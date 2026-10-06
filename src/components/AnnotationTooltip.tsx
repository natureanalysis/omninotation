import { useLayoutEffect, useRef } from "react"

import { detectLocale, t, type Locale } from "@/services/i18n"
import type { ToolbarStyle } from "@/types"

export interface AnnotationTooltipTarget {
  annotationId: string
  text: string
  /** 被悬停元素在视口中的位置，用于把提示摆在它上方/下方。 */
  rect: { top: number; bottom: number; left: number; width: number }
}

interface Props {
  target: AnnotationTooltipTarget
  style: ToolbarStyle
  locale?: Locale
}

/** 最多展示的字符数：完整内容仍去侧边栏/卡片里看。 */
const MAX_CHARS = 500

/**
 * 鼠标移到页内批注（高亮或便签）上时浮出的批注内容。
 * 纯文本 + 保留换行：不引 marked/KaTeX，免得给每个站点的内容脚本塞进渲染引擎。
 */
export function AnnotationTooltip({ target, style, locale: localeProp }: Props) {
  const locale = localeProp ?? detectLocale()
  const L = t(locale)
  const boxRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth
    const left = Math.max(8, Math.min(target.rect.left, vw - r.width - 8))
    // 默认贴在元素上方，上方放不下就翻到下方
    const above = target.rect.top - r.height - 8
    const top = above >= 8 ? above : Math.min(target.rect.bottom + 8, window.innerHeight - r.height - 8)
    el.style.left = `${left}px`
    el.style.top = `${Math.max(8, top)}px`
  }, [target])

  const text = target.text.length > MAX_CHARS ? `${target.text.slice(0, MAX_CHARS)}…` : target.text

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
        maxWidth: "min(360px, 90vw)",
        pointerEvents: "none",
        backgroundColor: style.backgroundColor,
        color: style.textColor,
        borderRadius: `${style.borderRadius}px`,
        padding: `${Math.max(6, style.padding + 2)}px ${Math.max(8, style.padding + 5)}px`,
        boxShadow: style.shadow,
        fontSize: "12px",
        lineHeight: "17px",
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
      }}>
      <div style={{ fontSize: "10px", opacity: 0.55, marginBottom: "2px" }}>{L.annotationNote}</div>
      {text}
    </div>
  )
}
