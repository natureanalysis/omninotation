import { useLayoutEffect, useRef } from "react"

import { flattenColor, withAlpha } from "@/services/color"
import { detectLocale, t, type Locale } from "@/services/i18n"
import type { ToolbarStyle } from "@/types"

/** 正文最多显示这么多字，完整内容仍去侧边栏看。 */
const MAX_COMMENT_CHARS = 600
/** 页面行高拿不准时的兜底偏移。 */
const FALLBACK_LINE_HEIGHT = 22
/** 让出一行：行距极大的页面也别把气泡推到离批注太远的地方。 */
const MAX_LINE_OFFSET = 56
/** 尾巴根部的宽度：贴着卡片那条边，越靠近批注越细。 */
const TAIL_BASE = 15
/** 气泡与尾巴的不透明度。 */
const BUBBLE_ALPHA = 0.85
const TAIL_ALPHA = 0.25

export interface AnnotationTooltipTarget {
  annotationId: string
  /** 批注正文。 */
  content: string
  author: string
  createdAt: string
  /** 被批注元素在视口中的位置：气泡放在它右下方。 */
  anchorTop: number
  anchorBottom: number
  anchorRight: number
  /** 页面自己的行高，用来把气泡再让开批注的下一行。 */
  anchorLineHeight?: number
  /** 批注自己的颜色：气泡底色跟它一致。 */
  color?: string
}

interface Props {
  target: AnnotationTooltipTarget
  style: ToolbarStyle
  locale?: Locale
}

const SERIF = `Georgia, "Times New Roman", "Songti SC", "Source Han Serif SC", SimSun, serif`

/**
 * 悬停批注时浮出的评论气泡：谁在什么时候说了什么。
 * 底色跟着批注的颜色，尾巴是个从批注末端收窄到卡片边缘的三角，看得出气泡长在字上。
 * 正文按纯文本 + 保留换行渲染——不引 marked/KaTeX，免得给每个站点的内容脚本塞进渲染引擎。
 */
export function AnnotationTooltip({ target, style, locale: localeProp }: Props) {
  const locale = localeProp ?? detectLocale()
  const L = t(locale)
  const boxRef = useRef<HTMLDivElement>(null)
  const tailRef = useRef<SVGPolygonElement>(null)

  useLayoutEffect(() => {
    const el = boxRef.current
    const tail = tailRef.current
    if (!el || !tail) return
    const r = el.getBoundingClientRect()
    const gap = 10
    const lineOffset = Math.min(
      Math.max(target.anchorLineHeight || FALLBACK_LINE_HEIGHT, FALLBACK_LINE_HEIGHT),
      MAX_LINE_OFFSET
    )

    let left = target.anchorRight + gap
    if (left + r.width > window.innerWidth - 8) left = window.innerWidth - r.width - 8
    left = Math.max(8, left)

    let top = target.anchorBottom + lineOffset
    let side: "below" | "above" = "below"
    if (top + r.height > window.innerHeight - 8) {
      // 下方放不下才翻到上方，尾巴随之改指上方
      top = Math.max(8, target.anchorTop - r.height - gap)
      side = "above"
    }
    el.style.left = `${left}px`
    el.style.top = `${top}px`

    // 尾巴：顶点扎在批注末端的角上，底边平行贴在卡片那条边往里 1.5px——
    // 底边若 perpendicular 于连线，卡片 8px 圆角会在接缝处留一个缺口。
    const ax = target.anchorRight
    const ay = side === "below" ? target.anchorBottom : target.anchorTop
    const radius = style.borderRadius
    const min = left + radius + TAIL_BASE / 2
    const max = left + r.width - radius - TAIL_BASE / 2
    const bx = Math.min(Math.max(ax, min), Math.max(min, max))
    const by = side === "below" ? top + 1.5 : top + r.height - 1.5
    const hw = TAIL_BASE / 2
    const rel = (x: number, y: number) => `${(x - left).toFixed(1)},${(y - top).toFixed(1)}`
    tail.setAttribute("points", `${rel(ax, ay)} ${rel(bx - hw, by)} ${rel(bx + hw, by)}`)
  }, [target, style.borderRadius])

  const content =
    target.content.length > MAX_COMMENT_CHARS
      ? `${target.content.slice(0, MAX_COMMENT_CHARS)}…`
      : target.content

  // 底色跟批注同色；没有批注色时退回工具栏外观的底色。
  // 透明度按用户要的层级来：气泡 85%（能透出底下的正文），尾巴 25%（只当引线）。
  const solid = target.color ? flattenColor(target.color, style.backgroundColor) : style.backgroundColor
  const background = withAlpha(solid, BUBBLE_ALPHA)
  const tailFill = withAlpha(solid, TAIL_ALPHA)

  return (
    <div
      ref={boxRef}
      data-omninotation-tooltip=""
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        zIndex: 2147483646,
        // 宿主容器是 flex：不给 max-content 会被压成一列竖排文字
        width: "max-content",
        flex: "0 0 auto",
        maxWidth: "min(340px, 88vw)",
        pointerEvents: "none"
      }}>
      {/* 尾巴画在卡片之前，靠卡片自己的底色盖住贴边那一段 */}
      <svg
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: "100%",
          overflow: "visible"
        }}>
        <polygon ref={tailRef} fill={tailFill} />
      </svg>

      <div
        style={{
          backgroundColor: background,
          color: style.textColor,
          borderRadius: `${style.borderRadius}px`,
          boxShadow: style.shadow,
          overflow: "hidden",
          fontFamily: SERIF
        }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "6px",
            padding: "6px 10px",
            borderBottom: "1px solid rgba(0,0,0,0.14)",
            fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
            fontSize: "10px",
            letterSpacing: "0.04em"
          }}>
          <span style={{ fontWeight: 700, textTransform: "uppercase", opacity: 0.8 }}>{L.hoverCommentLabel}</span>
          <span style={{ opacity: 0.45 }}>·</span>
          <span style={{ fontWeight: 600, opacity: 0.9 }}>{target.author}</span>
          <span style={{ opacity: 0.45 }}>·</span>
          <span style={{ opacity: 0.65, fontVariantNumeric: "tabular-nums" }}>
            {formatWhen(target.createdAt, locale)}
          </span>
        </div>

        <div
          style={{
            padding: "8px 10px 10px",
            fontSize: "12.5px",
            lineHeight: "1.65",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere"
          }}>
          {content}
        </div>
      </div>
    </div>
  )
}

function formatWhen(createdAt: string, locale: Locale): string {
  if (!createdAt) return ""
  const d = new Date(createdAt)
  if (Number.isNaN(d.getTime())) return ""
  return `${d.toLocaleDateString(locale === "zh-CN" ? "zh-CN" : "en-US")} ${d.toLocaleTimeString(locale === "zh-CN" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit" })}`
}
