"""
OmniNotation 品牌资产渲染管线。

单一事实来源：SVG。所有 PNG 产物都从SVG 无头渲染 + Pillow 降采样得到，
**不从位图放大、不手工重绘** —— 这是保证色值与几何零偏差的唯一可靠路径。

流程：
  SVG → (Edge headless 渲染) → 1024/512 PNG → (裁透明边 + 固定视觉留白) → 各尺寸

前置条件：
  - Edge: C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe
  - Pillow

用法：
  python render_assets.py            # 全量
  python render_assets.py full       # 仅完整标识（浅色 + 深色）
  python render_assets.py mark       # 仅图形 mark（浅色 + 深色）
"""
import os
import shutil
import subprocess
import sys
import tempfile
import time

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO_DIR = os.path.dirname(HERE)

EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"

# Edge 在部分盘符下无法写入截图文件（E:曾失败），统一走系统临时目录。
WORK = os.path.join(tempfile.gettempdir(), "omni-logo-render")

# 视觉留白（占图标边长的比例）—— 比几何留白更符合光学平衡
PAD_RATIO_MAIN = 32 / 512   # ≈ 6.25%
PAD_RATIO_SMALL = 40 / 512  # ≈ 7.8%

RING = (20, 184, 166)
DARK_DOT = (232, 245, 241)


def edge_render(svg_path, png_path, size, bg=None):
    """用 Edge 无头模式把 SVG 渲染成 PNG。

    ⚠️ 两个已踩过的坑：
    1. Edge 会在截图写完之前就返回（rc=0 但文件不存在），必须轮询等待。
    2. Edge 无法写入 E: 盘，必须先把 SVG 拷到系统临时目录再渲染。
    """
    os.makedirs(WORK, exist_ok=True)
    tmp_svg = os.path.join(WORK, os.path.basename(svg_path))
    shutil.copy(svg_path, tmp_svg)
    if os.path.abspath(png_path) != os.path.abspath(tmp_svg):
        pass
    out = os.path.join(WORK, "_render_" + os.path.basename(png_path))
    if os.path.exists(out):
        os.remove(out)

    cmd = [EDGE, "--headless", "--disable-gpu"]
    if bg:
        cmd.append(f"--default-background-color={bg}")
    cmd += [f"--screenshot={out}", f"--window-size={size},{size}",
            "file:///" + tmp_svg.replace("\\", "/")]
    subprocess.run(cmd, capture_output=True, timeout=120)

    # 轮询等待文件落盘（最多 15s）
    deadline = time.time() + 15
    while time.time() < deadline:
        if os.path.exists(out) and os.path.getsize(out) > 0:
            break
        time.sleep(0.25)

    if not os.path.exists(out) or os.path.getsize(out) == 0:
        raise RuntimeError(f"Edge 渲染失败：{svg_path}")
    shutil.copy(out, png_path)
    return png_path


def resize_rgba(im, size):
    """正确处理透明边缘的缩放。

    坑：Edge 渲染出的透明像素 RGB 是黑色，直接 LANCZOS 缩放会让黑色
    渗进半透明边缘（小尺寸下整块发灰、四周脏边）。

    标准做法（Pillow 官方推荐路径）：
      1. 把 alpha 当作独立灰度图缩放 —— 得到正确的新边缘柔度
      2. RGB通道**只在alpha>0 的区域**参与缩放，避免黑洞污染
      3. 缩放后用新 alpha 反解 premultiply
    这里用 Image.resize 对 premultiplied 图缩放的等价实现：
    先转成"颜色 × alpha/255"的预乘图，缩放，再反乘 alpha。
    预乘后透明像素天然为 0，不会污染边缘。
    """
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()

    # 预乘（透明像素自然为 0，不需特殊处理）
    pm = Image.new("RGBA", (w, h))
    ppx = pm.load()
    for j in range(h):
        for i in range(w):
            r, g, b, a = px[i, j]
            ppx[i, j] = (r * a // 255, g * a // 255, b * a // 255, a)

    small = pm.resize(size, Image.LANCZOS)

    # 反乘：除以新 alpha（a=0 时置 0，避免除零）
    out = Image.new("RGBA", size, (0, 0, 0, 0))
    opx = out.load()
    spx = small.load()
    for j in range(size[1]):
        for i in range(size[0]):
            r, g, b, a = spx[i, j]
            if a == 0:
                opx[i, j] = (0, 0, 0, 0)
            else:
                opx[i, j] = (min(255, r * 255 // a),
                             min(255, g * 255 // a),
                             min(255, b * 255 // a), a)
    return out


def fit_with_padding(src, dst, pad_ratio):
    """裁掉透明边，按固定视觉留白重新居中到正方形画布。"""
    im = Image.open(src).convert("RGBA")
    bbox = im.getbbox()
    if bbox is None:
        raise ValueError(f"{src} 全透明，无有效内容")
    inner = im.crop(bbox)
    w, h = inner.size
    side = im.width
    s = (side - 2 * round(side * pad_ratio)) / max(w, h)
    nw, nh = max(1, round(w * s)), max(1, round(h * s))
    inner = resize_rgba(inner, (nw, nh))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(inner, ((side - nw) // 2, (side - nh) // 2), inner)
    canvas.save(dst)
    return dst


def recolor_dark_dot(src, dst):
    """把松绿圆点换成浅薄荷白，产出深色底可用位图。

    注意：抗锯齿边缘是「松绿与透明」的混合，alpha 越低 RGB 越暗，
    只按固定容差匹配会漏掉大量边缘像素（实测dot 只剩 32px）。
    这里按**色相距离**判定（松绿 R<G<B 且偏暗），再按原 alpha 混合，
    保证边缘也正确过渡。
    """
    im = Image.open(src).convert("RGBA")
    px = im.load()
    for j in range(im.height):
        for i in range(im.width):
            r, g, b, a = px[i, j]
            if a == 0:
                continue
            # 松绿特征：R 显著小于 G，G 略大于 B，且整体偏暗
            if r < 60 and g < 130 and b < 110 and g >= b:
                px[i, j] = (*DARK_DOT, a)
    im.save(dst)
    return dst


def export_sizes(base_png, prefix, sizes, out_dir=LOGO_DIR):
    im = Image.open(base_png)
    outs = []
    for s in sizes:
        p = os.path.join(out_dir, f"{prefix}-{s}.png")
        resize_rgba(im, (s, s)).save(p)
        outs.append(p)
    return outs


def knock_out_bg(src, dst, key_rgb, tol=4):
    """把截图里指定的底色转为透明，产出 RGBA。

    Edge 无头截图会把页面背景烘进位图（输出 RGB、无 alpha），
    直接使用会导致「白底方块」污染所有下游合成。

    ⚠️ 羽化带不能误伤实心区域：抗锯齿边缘的过渡色是「前景色与白底的混合」，
    距离白底较远；若把宽过渡带一律线性衰减，会让本该不透明的实心像素
    alpha 掉到 240 之类，产生「整体发灰」的隐性缺陷。
    因此羽化带收窄到 tol*2，且只对**接近底色**的像素生效。
    """
    im = Image.open(src).convert("RGBA")
    px = im.load()
    w, h = im.size
    for j in range(h):
        for i in range(w):
            r, g, b, a = px[i, j]
            d = max(abs(r - key_rgb[0]), abs(g - key_rgb[1]), abs(b - key_rgb[2]))
            if d <= tol:
                px[i, j] = (r, g, b, 0)
            elif d <= tol * 2:
                # 紧邻底色的过渡像素：线性衰减到不透明
                t = (d - tol) / tol
                px[i, j] = (r, g, b, max(0, min(255, int(255 * t))))
            else:
                # 前景色或实心区域：保持完全不透明
                px[i, j] = (r, g, b, 255)
    im.save(dst)
    return dst


def verify(png, expect):
    """校验主色像素数量，确认渲染没有偏色。"""
    from collections import Counter
    im = Image.open(png).convert("RGBA")
    c = Counter(im.get_flattened_data() if hasattr(im, "get_flattened_data")
                else im.getdata())
    hits = {name: sum(n for col, n in c.items()
                      if col[3] > 200 and max(abs(col[i] - rgb[i]) for i in range(3)) <= 6)
            for name, rgb in expect.items()}
    return hits


def build_full():
    """完整标识（含字标）：浅色 + 深色。

    关键：必须输出**透明底RGBA**。商店素材与网页嵌入都要求透明底，
    Edge 无头截图默认把页面背景烘进位图（得到 RGB 无alpha），
    因此这里对浅底截图做一次「白底转透明」处理。
    深底版同理，用其指定底色做键控。
    """
    print("▸ 完整标识")
    for mode, bg, key_rgb in (("light", None, (255, 255, 255)),
                               ("dark", "0C1A16", (12, 26, 22))):
        svg = os.path.join(LOGO_DIR, f"omninotation-logo-v1{'' if mode == 'light' else '-dark'}.svg")
        raw = edge_render(svg, os.path.join(WORK, f"full_{mode}_raw.png"), 1024, bg)
        dst = os.path.join(LOGO_DIR, f"omninotation-logo-v1{'' if mode == 'light' else '-dark'}.png")
        knock_out_bg(raw, dst, key_rgb)
        export_sizes(dst, f"omninotation-logo{'' if mode == 'light' else '-dark'}",
                     (512, 256, 128, 48, 32, 16))
        exp = {"ring": RING, "dot/word": (6, 78, 59) if mode == "light" else DARK_DOT}
        got = verify(dst, exp)
        mode_chk = Image.open(dst).mode
        alpha = Image.open(dst).split()[3].getextrema() if mode_chk == "RGBA" else "n/a"
        print(f"  {mode:5s} → {os.path.basename(dst)}  {mode_chk} alpha={alpha}  {got}")


def build_mark():
    """纯图形 mark：浅色 + 深色，含小尺寸补偿版。"""
    print("▸ 图形 mark")
    variants = [
        # (svg, 输出前缀, pad, 是否深色)
        ("omninotation-mark.svg", "omninotation-mark", PAD_RATIO_MAIN, False),
        ("omninotation-mark-dark.svg", "omninotation-mark-dark", PAD_RATIO_MAIN, True),
        ("omninotation-mark-small.svg", "omninotation-mark-small", PAD_RATIO_SMALL, False),
    ]
    for svg_name, prefix, pad, is_dark in variants:
        svg = os.path.join(LOGO_DIR, svg_name)
        # Edge 的 --default-background-color 只接受 8 位色，
        # 且**必须在截图前**生效；这里统一传白底，随后按键控抠成透明。
        raw = edge_render(svg, os.path.join(WORK, f"{prefix}_raw.png"), 512,
                          bg="FFFFFFFF")
        knocked = os.path.join(WORK, f"{prefix}_knock.png")
        knock_out_bg(raw, knocked, (255, 255, 255))
        base = os.path.join(WORK, f"{prefix}_fit.png")
        fit_with_padding(knocked, base, pad)
        # 注意：深色版的圆点**已在 SVG 里就是浅薄荷白**（见 build_mark_dark.py），
        # 不需要也不能再做一次位图换色 —— 那会二次采样、削弱 alpha。
        shutil.copy(base, os.path.join(LOGO_DIR, f"{prefix}-512.png"))
        sizes = (128, 48, 32, 16) if prefix == "omninotation-mark" else ((32, 16) if "small" in prefix else (128, 48))
        export_sizes(base, prefix, sizes)
        exp = {"ring": RING, "dot": DARK_DOT if is_dark else (6, 78, 59)}
        sample = os.path.join(LOGO_DIR, f"{prefix}-512.png")
        corner = Image.open(sample).convert("RGBA").getpixel((3, 3))
        print(f"  {prefix:28s} {verify(sample, exp)}  corner={corner}")

    # 扩展图标：**刻意不写入**。
    #
    # assets/icon.png 与 assets/icon128.png 是扩展的商店图标，
    # 按项目决定保留原有紫色菱形，不用本Logo 覆盖。
    # 本管线的产物只落在 assets/logo/ 下，作为品牌物料备用。
    # 如需改为Logo 图标，在这里取消注释即可。
    #
    # assets = os.path.normpath(os.path.join(LOGO_DIR, os.pardir))
    # shutil.copy(os.path.join(LOGO_DIR, "omninotation-mark-512.png"),
    #             os.path.join(assets, "icon.png"))
    # shutil.copy(os.path.join(LOGO_DIR, "omninotation-mark-128.png"),
    #             os.path.join(assets, "icon128.png"))
    # print("  → assets/icon.png, assets/icon128.png 已更新")
    print("  · assets/icon.png / icon128.png 保持原状（紫色菱形，不被本管线覆盖）")


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    os.makedirs(WORK, exist_ok=True)
    if what in ("all", "full"):
        build_full()
    if what in ("all", "mark"):
        build_mark()
    print("完成")