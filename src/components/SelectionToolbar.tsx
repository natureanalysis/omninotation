import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

import * as anchor from "@/services/anchor"
import { getDomainConfig } from "@/services/config"
import { rangeToMarkdown } from "@/services/htmlToMarkdown"
import * as storage from "@/services/storage"
import { DEFAULT_ANNOTATION_COLOR, getLocalIconUrl } from "@/services/color"
import { detectLocale, t, type Locale } from "@/services/i18n"
import type { MarkStyle, ToolbarConfig, ToolbarSearchEngine } from "@/types"

// ========================
// Helpers
// ========================

function getFallbackIconUrl(engine: ToolbarSearchEngine): string | undefined {
  if (engine.favicon?.startsWith("http") || engine.favicon?.startsWith("data:")) {
    return engine.favicon
  }
  try {
    const domain = new URL(engine.urlTemplate.replace("{q}", "")).hostname
    return `https://${domain}/favicon.ico`
  } catch {
    return undefined
  }
}

interface SearchRequest {
  url: string
  method: "GET" | "POST"
  postBody?: string
}

function buildSearchRequest(engine: ToolbarSearchEngine, query: string): SearchRequest {
  const template = engine.urlTemplate
  if (template.includes("{POSTARGS}")) {
    const [urlPart, argsTemplate] = template.split("{POSTARGS}")
    const postBody = argsTemplate.replace(/%s/g, encodeURIComponent(query))
    return { url: urlPart, method: "POST", postBody }
  }
  return { url: template.replace(/%s/g, encodeURIComponent(query)), method: engine.method || "GET" }
}

function openGetUrl(url: string, mode: ToolbarConfig["tabOpenMode"]) {
  switch (mode) {
    case "current":
      window.open(url, "_self")
      break
    case "new-background-tab":
      if (typeof chrome !== "undefined" && chrome.runtime) {
        chrome.runtime.sendMessage({ type: "OPEN_BACKGROUND_TAB", url }).catch(() => {
          window.open(url, "_blank")
        })
      } else {
        window.open(url, "_blank")
      }
      break
    case "pinned":
      if (typeof chrome !== "undefined" && chrome.runtime) {
        chrome.runtime.sendMessage({ type: "OPEN_PINNED_TAB", url }).catch(() => {
          window.open(url, "_blank")
        })
      } else {
        window.open(url, "_blank")
      }
      break
    default:
      window.open(url, "_blank", "noopener,noreferrer")
  }
}

function submitPostSearch(url: string, postBody: string, target: string) {
  const form = document.createElement("form")
  form.action = url
  form.method = "POST"
  form.target = target
  form.style.display = "none"

  const params = new URLSearchParams(postBody)
  params.forEach((value, key) => {
    const input = document.createElement("input")
    input.type = "hidden"
    input.name = key
    input.value = value
    form.appendChild(input)
  })

  document.body.appendChild(form)
  form.submit()
  setTimeout(() => form.remove(), 100)
}

async function executeSearch(request: SearchRequest, mode: ToolbarConfig["tabOpenMode"]) {
  if (request.method === "POST" && request.postBody) {
    const target = mode === "current" ? "_self" : "_blank"
    submitPostSearch(request.url, request.postBody, target)
  } else {
    openGetUrl(request.url, mode)
  }
}

// ========================
// Annotation mark styles
// ========================

function getMarkStyles(locale: Locale): { key: MarkStyle; label: string; icon: string }[] {
  const L = t(locale)
  return [
    { key: "highlight", label: L.highlight, icon: "▌" },
    { key: "underline", label: L.underline, icon: "U̲" },
    { key: "strikethrough", label: L.strikethrough, icon: "S̶" },
    { key: "squiggly", label: L.squiggly, icon: "〰" }
  ]
}

// ========================
// Component
// ========================

function EngineIcon({ engine, size }: { engine: ToolbarSearchEngine, size: number }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading")
  const [imgSrc, setImgSrc] = useState<string | null>(null)

  // Text/emoji favicon: render directly
  if (engine.favicon && !engine.favicon.startsWith("http") && !engine.favicon.startsWith("data:")) {
    return <span style={{ fontSize: size * 0.8 }}>{engine.favicon}</span>
  }

  useEffect(() => {
    let isMounted = true
    setStatus("loading")
    setImgSrc(null)

    async function loadIcon() {
      // Priority 1: chrome.storage.local cache (downloaded by settings page)
      try {
        const cached = await storage.getEngineIconCache(engine.id)
        if (cached && isMounted) {
          setImgSrc(cached)
          return
        }
      } catch {}

      // Priority 2: local assets shipped with the extension
      try {
        const localUrl = getLocalIconUrl(engine.id)
        const res = await fetch(localUrl)
        if (res.ok && isMounted) {
          const blob = await res.blob()
          if (blob.type.startsWith("image/")) {
            const reader = new FileReader()
            reader.onloadend = () => {
              if (isMounted) setImgSrc(reader.result as string)
            }
            reader.readAsDataURL(blob)
            return
          }
        }
      } catch {}

      // Priority 3: online fallback (user favicon or domain favicon.ico)
      const fallback = getFallbackIconUrl(engine)
      if (fallback && isMounted) {
        setImgSrc(fallback)
      } else if (isMounted) {
        setStatus("error")
      }
    }

    loadIcon()
    return () => { isMounted = false }
  }, [engine])

  if (status === "error") {
    return <span style={{ fontSize: size * 0.8 }}>{engine.name.charAt(0).toUpperCase()}</span>
  }

  return (
    <div style={{ width: size, height: size, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {status !== "loaded" && (
        <span className="absolute text-gray-400 font-medium" style={{ fontSize: size * 0.8 }}>
          {engine.name.charAt(0).toUpperCase()}
        </span>
      )}
      {imgSrc && (
        <img
          src={imgSrc}
          alt={engine.name}
          className="absolute inset-0 object-contain"
          style={{
            width: "100%",
            height: "100%",
            opacity: status === "loaded" ? 1 : 0,
            transition: "opacity 0.2s"
          }}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
        />
      )}
    </div>
  )
}

export interface ToolbarSelection {
  text: string
  range: Range
  rect: DOMRect
}

interface SelectionToolbarProps {
  selection: ToolbarSelection
  config: ToolbarConfig
  onClose: () => void
  locale?: Locale
}

export function SelectionToolbar({ selection, config, onClose, locale: localeProp }: SelectionToolbarProps) {
  const { text, range, rect } = selection
  const menuRef = useRef<HTMLDivElement>(null)
  const [copySuccess, setCopySuccess] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isOverSelection = useRef(false)
  // Follow the shell locale so the toolbar re-renders on language switch.
  const locale = localeProp ?? detectLocale()

  const L = t(locale)
  const MARK_STYLES = getMarkStyles(locale)
  const style = config.style

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text)
    setCopySuccess(true)
    setTimeout(() => {
      setCopySuccess(false)
      onClose()
    }, 1000)
  }, [text, onClose])

  // Auto-close after configured delay unless hovered
  const startCloseTimer = useCallback(() => {
    if (!config.autoClose) return
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      onClose()
    }, config.autoCloseDelay)
  }, [config.autoClose, config.autoCloseDelay, onClose])

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }, [])

  // Detect hover over the selected text to keep menu open
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const { clientX, clientY } = e
      const inRect =
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom

      if (inRect && !isOverSelection.current) {
        isOverSelection.current = true
        clearCloseTimer()
      } else if (!inRect && isOverSelection.current) {
        isOverSelection.current = false
        startCloseTimer()
      }
    }
    document.addEventListener("mousemove", handleMouseMove)
    return () => document.removeEventListener("mousemove", handleMouseMove)
  }, [rect, clearCloseTimer, startCloseTimer])

  useEffect(() => {
    startCloseTimer()
    return () => clearCloseTimer()
  }, [startCloseTimer, clearCloseTimer])

  // Position calculation (viewport-relative because root container is fixed)
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const menuRect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    let top = rect.bottom + 8
    let left = rect.left + rect.width / 2 - menuRect.width / 2

    // Flip to top if near bottom edge
    if (top + menuRect.height + 8 > vh) {
      top = rect.top - menuRect.height - 8
    }

    // Clamp horizontally
    left = Math.max(8, Math.min(left, vw - menuRect.width - 8))

    el.style.top = `${top}px`
    el.style.left = `${left}px`
  }, [rect])

  // Close on click outside / scroll / selection loss
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleScroll = () => onClose()
    const handleSelectionChange = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) {
        onClose()
      }
    }

    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleMouseDown)
      document.addEventListener("scroll", handleScroll, true)
      document.addEventListener("selectionchange", handleSelectionChange)
    }, 80)

    return () => {
      clearTimeout(timer)
      document.removeEventListener("mousedown", handleMouseDown)
      document.removeEventListener("scroll", handleScroll, true)
      document.removeEventListener("selectionchange", handleSelectionChange)
    }
  }, [onClose])

  const saveAnnotation = useCallback(
    async (styleArg: MarkStyle, userContent: string = "") => {
      const cfg = getDomainConfig(location.href)
      const root = anchor.getRootElement(cfg.rootSelector)
      const selector = anchor.describeRange(root, range)
      if (!selector) {
        alert(L.anchorFailed)
        return
      }

      // Convert selected HTML to markdown to preserve formatting
      const selectedMarkdown = rangeToMarkdown(range) || text

      // quote = markdown formatted selected text; content = user's comment
      await storage.saveAnnotation({
        id: crypto.randomUUID(),
        url: location.href,
        title: document.title,
        selector,
        quote: selectedMarkdown.slice(0, 2000),
        data: { type: "comment", content: userContent.trim(), markStyle: styleArg, color: DEFAULT_ANNOTATION_COLOR },
        author: { id: "local-user", name: L.me },
        createdAt: new Date().toISOString()
      })

      onClose()
    },
    [range, text, onClose]
  )

  // 「添加批注」：不再在页面内联编辑，而是先创建一条空内容批注并跳转到
  // 右侧边栏的笔记面板，由侧边栏的 Markdown 编辑器完成内容编辑。
  const handleAddNote = useCallback(async () => {
    const cfg = getDomainConfig(location.href)
    const root = anchor.getRootElement(cfg.rootSelector)
    const selector = anchor.describeRange(root, range)
    if (!selector) {
      alert(L.anchorFailed)
      return
    }

    const selectedMarkdown = rangeToMarkdown(range) || text
    const id = crypto.randomUUID()
    await storage.saveAnnotation({
      id,
      url: location.href,
      title: document.title,
      selector,
      quote: selectedMarkdown.slice(0, 2000),
      data: { type: "comment", content: "", markStyle: "highlight", color: DEFAULT_ANNOTATION_COLOR },
      author: { id: "local-user", name: L.me },
      createdAt: new Date().toISOString()
    })
    await storage.setPendingEditAnnotation(location.href, id)
    try {
      await chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" })
    } catch {
      // background 不可用时静默失败，批注已保存
    }
    onClose()
  }, [range, text, onClose, L.anchorFailed])

  const handleSearch = useCallback(
    async (engine: ToolbarSearchEngine) => {
      const request = buildSearchRequest(engine, text)
      await executeSearch(request, config.tabOpenMode)
      if (config.autoClose) {
        onClose()
      }
    },
    [text, config.tabOpenMode, config.autoClose, onClose]
  )

  const containerStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 2147483647,
    backgroundColor: style.backgroundColor,
    borderRadius: `${style.borderRadius}px`,
    padding: `${style.padding}px`,
    boxShadow: style.shadow,
    color: style.textColor,
    display: "flex",
    alignItems: "center",
    gap: `${style.gap}px`
  }

  const buttonSize = style.buttonSize
  const buttonStyle: React.CSSProperties = {
    width: `${buttonSize}px`,
    height: `${buttonSize}px`,
    borderRadius: `${Math.max(4, style.borderRadius - 4)}px`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: `${Math.max(10, buttonSize * 0.4)}px`,
    lineHeight: 1,
    padding: 0,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    color: style.textColor
  }

  const dividerStyle: React.CSSProperties = {
    width: "1px",
    height: `${buttonSize * 0.6}px`,
    backgroundColor: "rgba(0,0,0,0.1)",
    flexShrink: 0
  }

  const enabledEngines = config.engines.filter((e) => e.enabled)

  const renderEngineButton = (engine: ToolbarSearchEngine) => {
    return (
      <button
        key={engine.id}
        title={config.showFaviconOnly ? engine.name : L.searchIn(engine.name)}
        onClick={() => handleSearch(engine)}
        style={buttonStyle}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={startCloseTimer}
      >
        <EngineIcon engine={engine} size={buttonSize * 0.5} />
        {!config.showFaviconOnly && (
          <span className="ml-1 truncate" style={{ maxWidth: 60, fontSize: `${Math.max(9, buttonSize * 0.32)}px` }}>
            {engine.name}
          </span>
        )}
      </button>
    )
  }

  return (
    <div
      ref={menuRef}
      style={containerStyle}
      onMouseEnter={clearCloseTimer}
      onMouseLeave={startCloseTimer}
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Annotation mark styles */}
      {config.showAnnotations && (
        <>
          {MARK_STYLES.map(({ key, label: lbl, icon }) => (
            <button
              key={key}
              title={lbl}
              onClick={() => saveAnnotation(key)}
              style={buttonStyle}
            >
              {icon}
            </button>
          ))}
          <button
            title={L.addComment}
            onClick={handleAddNote}
            style={buttonStyle}
          >
            📝
          </button>
          <button
            title={copySuccess ? L.copySuccess : L.copy}
            onClick={handleCopy}
            style={buttonStyle}
          >
            {copySuccess ? "✓" : "📋"}
          </button>
          {enabledEngines.length > 0 && <div style={dividerStyle} />}
        </>
      )}

      {/* Search engines */}
      {enabledEngines.map(renderEngineButton)}
    </div>
  )
}
