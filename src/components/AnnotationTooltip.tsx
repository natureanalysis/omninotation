import { useLayoutEffect, useRef } from "react"

import { detectLocale, t, type Locale } from "@/services/i18n"
import type { ToolbarStyle } from "@/types"

/** 正文最多显示这么多字，完整内容仍去侧边栏看。 */
const MAX_COMMENT_CHARS = 600
/** 页面行高拿不准时的兜底偏移。 */
const FALLBACK_LINE_HEIGHT = 22
/** 让出一行：行距极大的页面也别把气泡推到离批注太远的地方。 */
const MAX_LINE_OFFSET = 56
/** 气泡尾巴离卡片左缘的距离（尾巴指向批注末端）。 */
const TAIL_INSET = 14

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
}

interface Props {
  target: AnnotationTooltipTarget
  style: ToolbarStyle
  locale?: Locale
}

const SERIF = `Georgia, "Times New Roman", "Songti SC", "Source Han Serif SC", SimSun, serif`

/**
 * 悬停批注时浮出的评论气泡：谁在什么时候说了什么。
 * 摆在批注右下方，不遮住被批注的那一行，也不遮住它上面/紧跟的下一行。
 * 正文按纯文本 + 保留换行渲染——不引 marked/KaTeX，免得给每个站点的内容脚本塞进渲染引擎。
 */
export function AnnotationTooltip({ target, style, locale: localeProp }: Props) {
  const locale = localeProp ?? detectLocale()
  const L = t(locale)
  const boxRef = useRef<HTMLDivElement>(null)
  const tailRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const gap = 10
    const lineOffset = Math.min(Math.max(target.anchorLineHeight || FALLBACK_LINE_HEIGHT, FALLBACK_LINE_HEIGHT), MAX_LINE_OFFSET)

    let left = target.anchorRight + gap
    if (left + r.width > window.innerWidth - 8) left = window.innerWidth - r.width - 8

    let top = target.anchorBottom + lineOffset
    let side: "below" | "above" = "below"
    if (top + r.height > window.innerHeight - 8) {
      // 下方放不下才翻到上方，此时尾巴改指下方
      top = target.anchorTop - r.height - gap
      side = "above"
    }
    el.style.left = `${Math.max(8, left)}px`
    el.style.top = `${Math.max(8, top)}px`

    const tail = tailRef.current
    if (tail) {
      tail.style.top = side === "below" ? "-5px" : ""
      tail.style.bottom = side === "below" ? "" : "-5px"
      tail.style.left = `${TAIL_INSET}px`
      tail.style.borderTopLeftRadius = side === "below" ? "3px" : "0"
      tail.style.borderBottomLeftRadius = side === "below" ? "0" : "3px"
    }
  }, [target])

  const content =
    target.content.length > MAX_COMMENT_CHARS
      ? `${target.content.slice(0, MAX_COMMENT_CHARS)}…`
      : target.content

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
      {/* 尾巴：旋转 45° 的小方块，指向被批注的那段文字。必须留在裁剪盒外面，否则被 overflow 切掉 */}
      <div
        ref={tailRef}
        aria-hidden
        style={{
          position: "absolute",
          width: "11px",
          height: "11px",
          backgroundColor: style.backgroundColor,
          transform: "rotate(45deg)"
        }}
      />

      <div
        style={{
          backgroundColor: style.backgroundColor,
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
            borderBottom: "1px solid rgba(0,0,0,0.10)",
            backgroundColor: "rgba(0,0,0,0.03)",
            fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
            fontSize: "10px",
            letterSpacing: "0.04em"
          }}>
          <span style={{ fontWeight: 600, textTransform: "uppercase", opacity: 0.75 }}>{L.hoverCommentLabel}</span>
          <span style={{ opacity: 0.45 }}>·</span>
          <span style={{ fontWeight: 600, opacity: 0.85 }}>{target.author}</span>
          <span style={{ opacity: 0.45 }}>·</span>
          <span style={{ opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>
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
