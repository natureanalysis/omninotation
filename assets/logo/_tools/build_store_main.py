"""
Chrome Web Store 商店主图（440×280，横向版式）。

为什么不能直接缩放 1:1 资产：
  1:1 标识是竖构图（图形在上、字在下），压进 440×280 会让图形缩得极小；
  商店主图在列表页以横幅展示，需要**横向锁定构图** —— 图形在左、字与副标在右。

版式（440×280，安全边距 32）：
  左：图形 mark 160×160，垂直居中偏上
  右：字标 + 副标 + 分隔线
"""
import os
import re
import subprocess
import shutil
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO_DIR = os.path.dirname(HERE)

EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
WORK = os.path.join(tempfile.gettempdir(), "omni-logo-render")

W, H = 440, 280
PAD = 32
RING = "#14B8A6"
DEEP = "#064E3B"
MINT = "#E8F5F1"
BG_TOP = "#F7FAF9"
BG_BOT = "#E8F4F1"


def edge_render(html, png, w, h, bg=None):
    os.makedirs(WORK, exist_ok=True)
    tmp_html = os.path.join(WORK, "store_main.html")
    with open(tmp_html, "w", encoding="utf-8") as f:
        f.write(html)
    out = os.path.join(WORK, "_store.png")
    if os.path.exists(out):
        os.remove(out)
    cmd = [EDGE, "--headless", "--disable-gpu"]
    if bg:
        cmd.append(f"--default-background-color={bg}")
    cmd += [f"--screenshot={out}", f"--window-size={w},{h}",
            "file:///" + tmp_html.replace("\\", "/")]
    subprocess.run(cmd, capture_output=True, timeout=120)
    deadline = time.time() + 15
    while time.time() < deadline:
        if os.path.exists(out) and os.path.getsize(out) > 0:
            break
        time.sleep(0.25)
    if not os.path.exists(out):
        raise RuntimeError("Edge 渲染失败")
    shutil.copy(out, png)
    return png


def read_group(svg_name, gid, keep_fill=True):
    """从 SVG 中提取指定 <g id="..."> 块的**全部后代**元素（保留嵌套结构）。

    两个已踩过的坑：
    1. 不要用正则 `</g>` 收尾 —— mark 分组内部还有嵌套 <g>（内横条），
       正则会在第一个 </g> 处截断，导致图形缺半。
    2. ET 输出 ns0: 前缀，内嵌进 HTML 的 <svg> 时必须剥掉，
       否则浏览器因未绑定命名空间而静默丢弃整个元素。
    另外必须清掉 mask 引用 —— 原 SVG 的 mask 定义在 <defs> 里，
    抽取片段不包含 <defs>，残留的 mask 引用会让浏览器丢弃整个元素。

    fill/stroke 默认**保留**（keep_fill=True）：环需要 fill="none" 走描边，
    而内横条与圆点需要实心填充 —— 一刀切清掉会把横条变成空心。
    """
    import xml.etree.ElementTree as ET
    path = os.path.join(LOGO_DIR, svg_name)
    root = ET.parse(path).getroot()
    ns = "{http://www.w3.org/2000/svg}"

    target = None
    for g in root.iter(f"{ns}g"):
        if g.get("id") == gid:
            target = g
            break
    if target is None:
        raise SystemExit(f"{svg_name} 中找不到 id={gid} 的 <g>")

    def clean(el):
        for child in list(el):
            if not isinstance(child.tag, str):       # 注释节点
                el.remove(child)
                continue
            child.attrib.pop("transform", None)
            if not keep_fill:
                child.attrib.pop("fill", None)
                child.attrib.pop("stroke", None)
            child.attrib.pop("mask", None)            # 关键：残留 mask 会丢元素
            clean(child)

    clean(target)
    target.attrib.pop("transform", None)
    target.attrib.pop("mask", None)
    target.attrib.pop("id", None)
    if not keep_fill:
        target.attrib.pop("fill", None)
        target.attrib.pop("stroke", None)

    xml = ET.tostring(target, encoding="unicode")
    # ET 会输出 ns0: 前缀。注意开闭标签两种形态：
    #   <ns0:ellipse ... />  → <ellipse ... />
    #   </ns0:g>             → </g>       （闭标签斜杠在前，不能用 [1:]）
    xml = re.sub(r"<(/?)ns\d+:", r"<\1", xml)
    xml = re.sub(r'\sxmlns(:\w+)?="[^"]*"', "", xml)
    return xml


def build():
    # mark：清掉 fill/stroke，环与横条、圆点统一由外层指定颜色。
    # wordmark：字标是纯 path，同样由外层指定填色。
    mark = read_group("omninotation-mark.svg", "mark", keep_fill=False)
    word = read_group("omninotation-logo-v1.svg", "wordmark", keep_fill=False)

    # 片段坐标说明：
    #  - mark 抽取自 omninotation-mark.svg，其内容仍在 1024 基准坐标系里
    #    （外层 transform 已被剥掉），所以 viewBox 用 0 0 1024 1024。
    #  - wordmark 同理，字标实际占 x 93–928 / y 666–765，
    #    直接把 viewBox 设成该包围盒即可自动适配，无需手工缩放。
    html = f'''<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{ width:{W}px; height:{H}px; overflow:hidden;
         font-family:"Segoe UI","Helvetica Neue",Arial,sans-serif; }}
  .bg {{ position:absolute; inset:0;
         background:linear-gradient(160deg, {BG_TOP} 0%, {BG_BOT} 100%); }}
  .ring-accent {{ position:absolute; left:0; top:0; width:6px; height:{H}px;
                  background:{RING}; }}
</style></head><body>
  <div class="bg"></div>
  <div class="ring-accent"></div>

  <!-- 左：图形 mark。
       viewBox 取 mark 的实际包围盒（含线宽）x 235–805 / y 220–685，
       比例约 1.25:1，配合下面的 width/height 保持等比，
       不能用 1:1 的 viewBox —— 那会横向溢出压到右侧字标。 -->
  <svg width="172" height="138" viewBox="235 220 570 465"
       style="position:absolute; left:{PAD}px; top:{(H - 138)//2}px;">
    <g fill="none" stroke="{RING}">{mark}</g>
  </svg>

  <!-- 右：字标 + 副标 -->
  <svg width="200" height="30" viewBox="88 660 845 112"
       style="position:absolute; left:230px; top:92px;">
    <g fill="{DEEP}">{word}</g>
  </svg>

  <div style="position:absolute; left:232px; top:140px; width:196px; height:2px;
              background:linear-gradient(90deg,{RING} 0%,{RING} 42%,rgba(20,184,166,0) 100%);"></div>

  <div style="position:absolute; left:232px; top:160px; color:{DEEP};
              font-size:15px; font-weight:600; letter-spacing:0.2px; opacity:0.92;">
    把网页变成可批注画布
  </div>
  <div style="position:absolute; left:232px; top:185px; color:{DEEP};
              font-size:12px; font-weight:400; opacity:0.62;">
    高亮重点 · 划线批注 · 随手笔记
  </div>
</body></html>'''

    out = os.path.join(LOGO_DIR, "omninotation-store-main-440x280.png")
    edge_render(html, out, W, H)
    print(f"→ {out}")


if __name__ == "__main__":
    build()