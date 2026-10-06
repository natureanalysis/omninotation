import { useEffect, useLayoutEffect, useRef } from "react"

import { detectLocale, t, type Locale } from "@/services/i18n"
import type { ToolbarStyle } from "@/types"

export interface AnnotationMenuTarget {
  annotationId: string
  /** 便签（浮动方块）与文中高亮的删除项文案一致，只是复制的是笔记正文。 */
  isSticky: boolean
  text: string
  x: number
  y: number
}

interface Props {
  target: AnnotationMenuTarget
  style: ToolbarStyle
  locale?: Locale
  onDelete: (annotationId: string) => void
  onClose: () => void
}

/**
 * 右键点在已有批注（高亮或便签）上时的页内菜单。
 *
 * 不用浏览器原生菜单：原生项要么在所有右击上出现（噪音），要么拿不到「点的是哪条批注」，
 * 而这里只在批注元素上出现并接管右击。
 */
export function AnnotationContextMenu({ target, style, locale: localeProp, onDelete, onClose }: Props) {
  const locale = localeProp ?? detectLocale()
  const L = t(locale)
  const menuRef = useRef<HTMLDivElement>(null)

  // 视口坐标定位（根容器是 fixed 在 0,0 的），并夹到视口内
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const left = Math.max(8, Math.min(target.x, window.innerWidth - r.width - 8))
    const top = Math.max(8, Math.min(target.y, window.innerHeight - r.height - 8))
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  }, [target])

  useEffect(() => {
    // 菜单在 shadow root 里：document 上收到的事件 target 会被重定向，只能用 composedPath 判断
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !e.composedPath().includes(menuRef.current)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", onDown, true)
    document.addEventListener("keydown", onKey, true)
    window.addEventListener("scroll", onClose, true)
    window.addEventListener("resize", onClose, true)
    return () => {
      document.removeEventListener("mousedown", onDown, true)
      document.removeEventListener("keydown", onKey, true)
      window.removeEventListener("scroll", onClose, true)
      window.removeEventListener("resize", onClose, true)
    }
  }, [onClose])

  const itemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    minWidth: "132px",
    padding: `${Math.max(5, style.padding + 1)}px ${Math.max(8, style.padding + 5)}px`,
    border: "none",
    background: "transparent",
    borderRadius: `${Math.max(4, style.borderRadius - 3)}px`,
    color: style.textColor,
    fontSize: "12px",
    lineHeight: "16px",
    textAlign: "left",
    cursor: "pointer",
    whiteSpace: "nowrap"
  }

  const handleCopy = () => {
    navigator.clipboard?.writeText(target.text).catch(() => {})
    onClose()
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        zIndex: 2147483647,
        display: "flex",
        flexDirection: "column",
        backgroundColor: style.backgroundColor,
        borderRadius: `${style.borderRadius}px`,
        padding: `${style.padding}px`,
        boxShadow: style.shadow,
        color: style.textColor,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
      }}>
      <button
        type="button"
        role="menuitem"
        style={itemStyle}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.06)")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        onClick={handleCopy}>
        {L.menuCopyText}
      </button>
      <div style={{ height: "1px", backgroundColor: "rgba(0,0,0,0.08)", margin: "2px 0" }} />
      <button
        type="button"
        role="menuitem"
        style={{ ...itemStyle, color: "#dc2626" }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(220,38,38,0.08)")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        onClick={() => {
          onDelete(target.annotationId)
          onClose()
        }}>
        {L.menuDeleteAnnotation}
      </button>
    </div>
  )
}
