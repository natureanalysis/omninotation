"""
把 OmniNotation 标准字转曲为 SVG path，消除跨平台字体依赖。

设计约束（来自 SPEC.md）：
  字标视觉宽度835，x 93–927
  基线 y = 765，cap top y = 666（即 cap height = 99）

做法：
  1. fontTools 取 Segoe UI Semibold 的真实字形轮廓
  2. 横向缩放到 835（含字距），纵向缩放到 cap height 99
  3. y 轴翻转（字体 y 向上，SVG y 向下），平移到基线
  4. 每字形施加**单一**仿射变换：
     x' = LEFT + (penX + x) * sx
     y' = BASELINE - glyphY * sy
     ⚠️ 不要用嵌套 TransformPen —— 内层平移会被外层变换覆盖，导致所有字叠在原位。

注意：横向与纵向缩放比例不同是**有意的光学修正** ——
同一 scale 会让 cap height 对不上规范。
"""
import sys
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform

FONT = "C:/Windows/Fonts/seguisb.ttf"
TEXT = "OmniNotation"

TARGET_W = 835.0    # 字标视觉宽度
TARGET_CAP = 99.0   # 大写字母高度
BASELINE = 765.0    # 基线 y
LEFT = 93.0         # 字标左边界 x
TRACKING = -0.6     # 字距（1024 基准 px），随横向缩放等比应用


def main():
    font = TTFont(FONT)
    cmap = font.getBestCmap()
    gs = font.getGlyphSet()
    names = [cmap[ord(c)] for c in TEXT]

    # cap height：优先取 OS/2 sCapHeight（部分字体表用旧字段名 usCapHeight），
    # 都取不到时用大写 O 的 advance 近似
    os2 = font["OS/2"]
    cap_height = getattr(os2, "sCapHeight", None) or getattr(os2, "usCapHeight", None) \
        or font["hmtx"][cmap[ord("O")]][1]

    # 累积字形位置（含字距）
    xs = []
    x = 0.0
    for nm in names:
        xs.append(x)
        x += gs[nm].width + TRACKING
    total_w = x - TRACKING          # 去掉末尾多余字距

    sx = TARGET_W / total_w
    sy = TARGET_CAP / cap_height

    # tracking 在字体坐标系下表达：最终像素为 tracking * sx，
    # 反推回字体单位 = tracking / sx，与 sx 相乘后正好还原 tracking。
    track_font_units = TRACKING / sx

    print(f"字体 cap height   = {cap_height}")
    print(f"原始总宽          = {total_w:.2f}")
    print(f"scale_x           = {sx:.6f}   (目标宽 {TARGET_W:.0f})")
    print(f"scale_y           = {sy:.6f}   (目标 cap {TARGET_CAP:.0f})")
    print(f"字距（字体单位）  = {track_font_units:.3f} → 输出 {track_font_units * sx:.2f}px")

    out = []
    for ch, nm, x in zip(TEXT, names, xs):
        pen = SVGPathPen(gs, ntos=lambda v: f"{v:.2f}")
        # 单一仿射：x' = LEFT + (x + glyphX) * sx ; y' = BASELINE - glyphY * sy
        t = Transform(sx, 0, 0, -sy, LEFT + x * sx, BASELINE)
        gs[nm].draw(TransformPen(pen, t))
        d = pen.getCommands()
        if d:
            out.append(f'<path d="{d}"/>')

    body = "\n    ".join(out)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <!--
    OmniNotation 标准字 — 已转曲（outline），无字体依赖
    字体源：Segoe UI Semibold（weight 600），仅作字形来源，转曲后不再需要
    字标视觉宽 {TARGET_W:.0f}（x {LEFT:.0f}–{LEFT + TARGET_W:.0f}），cap height {TARGET_CAP:.0f}，基线 y={BASELINE:.0f}
    替换原 <text> 节点；如需换字体请用本脚本重新转曲，不要改回 <text>
  -->
  <g id="wordmark" fill="#064E3B">
    {body}
  </g>
</svg>
'''
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = (sys.argv[1] if len(sys.argv) > 1
            else os.path.join(here, "omninotation-wordmark-outlined.svg"))
    with open(path, "w", encoding="utf-8") as f:
        f.write(svg)
    print(f"→ {path}  ({len(out)} 个字形路径)")


if __name__ == "__main__":
    main()