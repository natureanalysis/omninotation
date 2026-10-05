"""
构建 OmniNotation 纯图形 mark 的深色底版本。

为什么需要：松绿 #064E3B 在近黑底（#0C1A16）上的对比度极低，
圆点会糊进背景、识别点丢失。深色版把圆点换成浅薄荷白 #E8F5F1，
环与内横条保持 KnoWeave 青绿 #14B8A6 不变（青绿在深底上对比度良好）。

用法：python build_mark_dark.py
输出：assets/logo/omninotation-mark-dark.svg
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO_DIR = os.path.dirname(HERE)

RING = "#14B8A6"
DOT_DARK = "#E8F5F1"

MARK_DARK = f'''<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <!--
    OmniNotation 应用图标 — 深色底版（仅图形，无标准字）
    与主版唯一的差异：收笔圆点 #064E3B → #E8F5F1。
    松绿在近黑底上对比度过低，圆点会糊进背景、识别点丢失；
    青绿 #14B8A6 在深底上对比度良好，故环与内横条保持不变。

    ⚠️ 浅色底请用 omninotation-mark.svg，不要用本文件。
  -->
  <defs>
    <mask id="gapMask">
      <rect x="0" y="0" width="1200" height="1200" fill="#fff"/>
      <path d="M 255.75 221.5 L 410 221.5 L 410 95 Z" fill="#000"/>
    </mask>
  </defs>

  <g id="mark" transform="translate(-127.625 -76.25) scale(0.75)">
    <!-- 椭圆环：中心 (511.5,443)，中线半轴 227×173，线宽 50 -->
    <ellipse cx="511.5" cy="443" rx="227" ry="173"
             fill="none" stroke="{RING}" stroke-width="50"
             mask="url(#gapMask)"/>

    <!-- 被圈注的两行文字：内腔约束下宽度 343 / 332 -->
    <g fill="{RING}">
      <rect x="340" y="375" width="343" height="53"/>
      <rect x="346" y="465" width="332" height="53"/>
    </g>

    <!-- 收笔圆点：⌀77，圆心 (678,306)。深底换浅薄荷白 -->
    <circle cx="678" cy="306" r="38.5" fill="{DOT_DARK}"/>
  </g>
</svg>
'''

if __name__ == "__main__":
    out = os.path.join(LOGO_DIR, "omninotation-mark-dark.svg")
    with open(out, "w", encoding="utf-8") as f:
        f.write(MARK_DARK)
    print(f"→ {out}")