"""
构建 OmniNotation 完整标识 SVG（图形 + 已转曲字标）。

与 omninotation-logo-v1.svg 的唯一区别：`<text>` 字标替换为转曲后的 `<path>`，
消除跨平台字体依赖。图形部分逐字复制，保持几何一致。

用法：python build_full_logo.py <light|dark>
"""
import sys
import re
import os

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO_DIR = os.path.dirname(HERE)

WORDMARK = os.path.join(LOGO_DIR, "omninotation-wordmark-outlined.svg")

RING = "#14B8A6"# 环 / 内横条：两种模式共用
DOT_LIGHT = "#064E3B"     # 收笔圆点· 浅色底
DOT_DARK = "#E8F5F1"      # 收笔圆点 · 深色底
TEXT_LIGHT = "#064E3B"    # 字标 · 浅色底
TEXT_DARK = "#E8F5F1"     # 字标 · 深色底


def mark_group(dot_color):
    """图形部分：与 omninotation-logo-v1.svg 保持一致，仅圆点色随模式变化。"""
    return f'''  <g id="mark">
    <!-- 椭圆环：中心 (511.5,443)，中线半轴 227×173（椭圆率 0.763），线宽 50 -->
    <ellipse cx="511.5" cy="443" rx="227" ry="173"
             fill="none" stroke="{RING}" stroke-width="50"
             mask="url(#gapMask)"/>

    <!-- 被圈注的两行文字。
         宽度受椭圆内腔约束：内腔半轴 202×148，
         条带最窄处可用全宽 358.8 / 348.3，两侧各留 8 间隙 → 343 / 332。
         ⚠️ 不可加宽，否则会与环相接或溢出。 -->
    <g fill="{RING}">
      <rect x="340" y="375" width="343" height="53"/>
      <rect x="346" y="465" width="332" height="53"/>
    </g>

    <!-- 收笔圆点：⌀77，圆心 (678,306)。置于遮罩之外。
         深色底必须换浅色，否则松绿会糊进深色背景。 -->
    <circle cx="678" cy="306" r="38.5" fill="{dot_color}"/>
  </g>'''


def extract_wordmark_group(path, fill):
    """从转曲字标 SVG 中取出完整的 <g id="wordmark">…</g> 块并改色。"""
    with open(path, encoding="utf-8") as f:
        svg = f.read()
    m = re.search(r'(<g id="wordmark".*?</g>)', svg, re.S)
    if not m:
        raise SystemExit(f"未在 {path} 中找到 wordmark 分组")
    return m.group(1).replace('fill="#064E3B"', f'fill="{fill}"')


def build(mode):
    if mode == "light":
        dot, text = DOT_LIGHT, TEXT_LIGHT
        comment = "矢量定稿 · 浅色底版"
        name = "omninotation-logo-v1.svg"
        note = "环/条 #14B8A6 · 圆点与字标 #064E3B"
    elif mode == "dark":
        dot, text = DOT_DARK, TEXT_DARK
        comment = "矢量定稿 · 深色底版"
        name = "omninotation-logo-v1-dark.svg"
        note = "环/条 #14B8A6 · 圆点与字标 #E8F5F1（深底必换，否则糊进背景）"
    else:
        raise SystemExit("mode 应为 light 或 dark")

    wm = extract_wordmark_group(WORDMARK, text)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <!--
    OmniNotation Logo — {comment}
    {note}
    图形几何依据 assets/logo/SPEC.md。
    标准字已转曲（outline），**不含任何字体依赖**，跨平台渲染一致。
    如需更换字体，请用 _tools/outline_wordmark.py 重新转曲，不要改回 <text>。
  -->
  <defs>
    <!-- 断口遮罩：仅挖掉环的右上 45° 楔形，不影响内部横条 -->
    <mask id="gapMask">
      <rect x="0" y="0" width="1024" height="1024" fill="#fff"/>
      <path d="M 511.5 443 L 820 443 L 820 190 Z" fill="#000"/>
    </mask>
  </defs>

{mark_group(dot)}

  <!-- 标准字（已转曲）：x 93–928，cap height 99，基线 y=765 -->
  {wm}
</svg>
'''
    out = os.path.join(LOGO_DIR, name)
    with open(out, "w", encoding="utf-8") as f:
        f.write(svg)
    print(f"→ {out}  ({len(svg)} 字节)")


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else "light")