import { useLayoutEffect, useRef } from "react"

import { detectLocale, t, type Locale } from "@/services/i18n"
import type { ToolbarStyle } from "@/types"

/** 引文两侧各带的上下文字数：够看完整一句话，又不至于把卡片撑爆。 */
const CONTEXT_CHARS = 180
/** 正文最多显示这么多字，完整内容仍去侧边栏看。 */
const MAX_COMMENT_CHARS = 600

export interface AnnotationTooltipTarget {
  annotationId: string
  /** 批注正文。 */
  content: string
  author: string
  createdAt: string
  /** 被批注的原文，连同前后语境；marked 是命中的那一段。 */
  excerpt: { before: string; marked: string; after: string }
  /** 批注自身的颜色（便签/高亮都可能带），用来画左侧色条。 */
  color?: string
  /** 被批注元素在视口中的位置：卡片贴其上方，放不下翻到下方。 */
  anchorTop: number
  anchorBottom: number
  anchorLeft: number
}

interface Props {
  target: AnnotationTooltipTarget
  style: ToolbarStyle
  locale?: Locale
}

const SERIF = `Georgia, "Times New Roman", "Songti SC", "Source Han Serif SC", SimSun, serif`

/**
 * 悬停批注时浮出的评论卡：谁在什么时候，对哪一句（带语境）说了什么。
 * 正文按纯文本 + 保留换行渲染——不引 marked/KaTeX，免得给每个站点的内容脚本塞进渲染引擎。
 */
export function AnnotationTooltip({ target, style, locale: localeProp }: Props) {
  const locale = localeProp ?? detectLocale()
  const L = t(locale)
  const boxRef = useRef<HTMLDivElement>(null)

  // 贴在批注上方（放不下翻到下方），左右夹在视口内：
  // 这样一张截图里既有被批注的那行原文，也有整张评论卡。
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const gap = 10
    const left = Math.max(8, Math.min(target.anchorLeft, window.innerWidth - r.width - 8))
    const above = target.anchorTop - r.height - gap
    const top = above >= 8 ? above : Math.min(target.anchorBottom + gap, window.innerHeight - r.height - 8)
    el.style.left = `${left}px`
    el.style.top = `${Math.max(8, top)}px`
  }, [target])

  const accent = target.color || style.textColor
  const content =
    target.content.length > MAX_COMMENT_CHARS
      ? `${target.content.slice(0, MAX_COMMENT_CHARS)}…`
      : target.content
  const when = formatWhen(target.createdAt, locale)

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
        maxWidth: "min(380px, 90vw)",
        pointerEvents: "none",
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
        {when && (
          <>
            <span style={{ opacity: 0.45 }}>·</span>
            <span style={{ opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>{when}</span>
          </>
        )}
      </div>

      {target.excerpt.marked && (
        <div
          style={{
            margin: "8px 10px 0",
            paddingLeft: "9px",
            borderLeft: `3px solid ${accent}`,
            fontSize: "12px",
            lineHeight: "1.62",
            color: "inherit",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere"
          }}>
          <span style={{ opacity: 0.62 }}>{target.excerpt.before ? `…${target.excerpt.before}` : ""}</span>
          <span
            style={{
              backgroundColor: accent.startsWith("rgb") ? accent.replace(/[\d.]+\)$/, "0.28)") : "rgba(0,0,0,0.10)",
              boxDecorationBreak: "clone",
              WebkitBoxDecorationBreak: "clone",
              padding: "1px 2px"
            }}>
            {target.excerpt.marked}
          </span>
          <span style={{ opacity: 0.62 }}>{target.excerpt.after ? `${target.excerpt.after}…` : ""}</span>
        </div>
      )}

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
  )
}

function formatWhen(createdAt: string, locale: Locale): string {
  if (!createdAt) return ""
  const d = new Date(createdAt)
  if (Number.isNaN(d.getTime())) return ""
  return `${d.toLocaleDateString(locale === "zh-CN" ? "zh-CN" : "en-US")} ${d.toLocaleTimeString(locale === "zh-CN" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit" })}`
}

/**
 * 取被批注元素所在文字块的一段语境：命中段前后各 CONTEXT_CHARS 字。
 * 段落取不到（或文字对不上）时退回锚点自带的 prefix/suffix。
 */
export function buildExcerpt(
  el: HTMLElement,
  fallback: { exact?: string; prefix?: string; suffix?: string }
): { before: string; marked: string; after: string } {
  const flatten = (s: string) => s.replace(/\s+/g, " ").trim()
  const marked = flatten(el.textContent || "") || flatten(fallback.exact || "")
  const block = el.closest<HTMLElement>("p, li, blockquote, td, th, pre, h1, h2, h3, h4, h5, h6, dd, dt, figure")
  const full = flatten(block?.textContent || "")
  const at = marked ? full.indexOf(marked) : -1
  if (full && at >= 0) {
    return {
      before: full.slice(Math.max(0, at - CONTEXT_CHARS), at),
      marked: full.slice(at, at + marked.length),
      after: full.slice(at + marked.length, at + marked.length + CONTEXT_CHARS)
    }
  }
  return { before: flatten(fallback.prefix || ""), marked, after: flatten(fallback.suffix || "") }
}
