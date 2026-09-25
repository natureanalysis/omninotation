import type { PlasmoCSConfig } from "plasmo"
import { useCallback, useEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import cssText from "data-text:~/style.css"

import { SelectionToolbar } from "@/components/SelectionToolbar"
import * as anchor from "@/services/anchor"
import { detectLocale, initLocale, t, type Locale } from "@/services/i18n"
import { getDomainConfig, shouldActivate } from "@/services/config"
import {
  HIGHLIGHT_CLASS,
  PAGE_STYLE_ID,
  STICKY_CLASS,
  clearHighlights,
  clearStickies,
  countRenderedAnnotations,
  injectPageStyles,
  observeSpaNavigation,
  removeAnnotationFromDom,
  renderSticky,
  wrapRange
} from "@/services/highlights"
import { rangeToMarkdown } from "@/services/htmlToMarkdown"
import * as storage from "@/services/storage"
import type { Annotation, MarkStyle, ToolbarConfig } from "@/types"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"]
}

export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

export const getShadowHostId = () => "omninotation-host"

const ROOT_CONTAINER_ID = "omninotation-root"

export const getRootContainer = () => {
  let container = document.getElementById(ROOT_CONTAINER_ID) as HTMLDivElement | null
  if (!container) {
    container = document.createElement("div")
    container.id = ROOT_CONTAINER_ID
    container.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;overflow:visible;z-index:2147483647;"
    document.documentElement.prepend(container)
  }
  return container
}

// ========================
// Component
// ========================

export default function OmniNotationOverlay() {
  const [url, setUrl] = useState(location.href)
  const isRendering = useRef(false)
  const renderCooldownUntil = useRef(0)
  const renderGeneration = useRef(0)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stickyMode = useRef(false)
  const stickyTooltip = useRef<HTMLDivElement | null>(null)
  const [popupSelection, setPopupSelection] = useState<{ text: string; range: Range; rect: DOMRect } | null>(null)
  const popupSelectionRef = useRef(popupSelection)
  useEffect(() => { popupSelectionRef.current = popupSelection }, [popupSelection])
  const [toolbarConfig, setToolbarConfig] = useState<ToolbarConfig | null>(null)
  const toolbarConfigRef = useRef<ToolbarConfig | null>(null)
  // Follow the persisted language preference so the in-page UI (selection
  // toolbar, tooltips, author names) switches language live.
  const [locale, setLocaleState] = useState<Locale>(detectLocale)
  useEffect(() => {
    initLocale().then(setLocaleState).catch(() => {})
    const onLocaleChange = (changes: any, area: string) => {
      if (area !== "local" || !changes["locale_pref"]) return
      const next = changes["locale_pref"].newValue
      if (next !== "zh-CN" && next !== "en") return
      // Re-read storage so the shared _currentLocale cache updates too
      // (other in-page code paths call detectLocale() directly).
      initLocale().then(setLocaleState).catch(() => setLocaleState(next))
    }
    chrome.storage?.onChanged?.addListener(onLocaleChange)
    return () => chrome.storage?.onChanged?.removeListener(onLocaleChange)
  }, [])
  const lastSelectionRef = useRef<{ text: string; range: Range; rect?: DOMRect } | null>(null)
  const lastClickedAnnotationId = useRef<string | null>(null)
  const lastLinkText = useRef("")
  const modifierState = useRef({ ctrl: false, alt: false, shift: false })
  const pendingMiddleClick = useRef(false)
  const hasSelectionOnMouseDown = useRef(false)
  const hoverShowTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMouseDown = useRef(false)

  function isToolbarEnabledForUrl(targetUrl: string, cfg: ToolbarConfig | null): boolean {
    if (!cfg || !cfg.enabled) return false
    try {
      const host = new URL(targetUrl).hostname
      if (cfg.whitelist.length > 0) return cfg.whitelist.some((p) => host.includes(p))
      if (cfg.blacklist.length > 0) return !cfg.blacklist.some((p) => host.includes(p))
      return true
    } catch {
      return false
    }
  }

  const renderAnnotations = useCallback((targetUrl: string) => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }

    isRendering.current = true
    renderCooldownUntil.current = Date.now() + 3000
    renderGeneration.current += 1
    const currentGen = renderGeneration.current

    try {
      injectPageStyles().catch(() => {})
      clearHighlights()
      clearStickies()

      if (!shouldActivate(targetUrl)) { isRendering.current = false; return }

      const key = storage.getKey(targetUrl)
      chrome.storage.local.get([key], (result) => {
        if (renderGeneration.current !== currentGen) return

        if (chrome.runtime.lastError) {
          isRendering.current = false
          console.warn(`[OmniNotation] ${t(detectLocale()).extensionReloaded}`)
          return
        }

        const annotations: Annotation[] = result[key] ?? []
        if (annotations.length === 0) { isRendering.current = false; return }

        const config = getDomainConfig(targetUrl)
        const root = anchor.getRootElement(config.rootSelector)

        for (const ann of annotations) {
          if (ann.selector) {
            const range = anchor.resolveRange(root, ann.selector)
            if (range) {
              try {
                wrapRange(range, ann.id, ann.data.type, ann.data.markStyle || "highlight", ann.data.color)
              } catch (e) {
                console.warn("[OmniNotation] Failed to wrap highlight:", e)
              }
            }
          }
          if (ann.position) renderSticky(ann)
        }

        isRendering.current = false
      })
    } catch (e: any) {
      isRendering.current = false
      if (e?.message?.includes("Extension context invalidated")) {
        console.warn(`[OmniNotation] ${t(detectLocale()).extensionReloaded}`)
      } else {
        console.warn("[OmniNotation] Render error:", e)
      }
    }
  }, [])

  // Inject page styles once
  useEffect(() => { injectPageStyles() }, [])

  // Render highlights when URL changes
  useEffect(() => { renderAnnotations(url) }, [url, renderAnnotations])

  // SPA navigation + MutationObserver + storage listener + input handlers
  useEffect(() => {
    const handleNav = () => setUrl(location.href)
    const disposeNav = observeSpaNavigation(handleNav)

    // MutationObserver: re-render only when external DOM changes detected
    const observer = new MutationObserver((mutations) => {
      if (isRendering.current || Date.now() < renderCooldownUntil.current) return

      const hasExternalChange = mutations.some((m) => {
        const target = m.target as HTMLElement
        if (target.closest?.(`mark.${HIGHLIGHT_CLASS}`)) return false
        if (target.closest?.(`.${STICKY_CLASS}`)) return false
        for (let i = 0; i < m.addedNodes.length; i++) {
          const node = m.addedNodes[i]
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement
            if (el.classList?.contains(HIGHLIGHT_CLASS)) continue
            if (el.classList?.contains(STICKY_CLASS)) continue
            if (el.id === PAGE_STYLE_ID) continue
            return true
          }
          if (node.nodeType === Node.TEXT_NODE) return true
        }
        for (let i = 0; i < m.removedNodes.length; i++) {
          const node = m.removedNodes[i]
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement
            if (el.classList?.contains(HIGHLIGHT_CLASS)) continue
            if (el.classList?.contains(STICKY_CLASS)) continue
            return true
          }
          if (node.nodeType === Node.TEXT_NODE) return true
        }
        return false
      })

      if (hasExternalChange) {
        if (debounceTimer.current) clearTimeout(debounceTimer.current)
        debounceTimer.current = setTimeout(() => {
          if (isRendering.current) return
          const key = storage.getKey(location.href)
          try {
            chrome.storage.local.get([key], (result) => {
              if (chrome.runtime.lastError || isRendering.current) return
              const annotations: Annotation[] = result[key] ?? []
              const { marks, stickies } = countRenderedAnnotations()
              const expectedMarks = annotations.filter((a) => a.selector).length
              const expectedStickies = annotations.filter((a) => a.position).length
              if (marks !== expectedMarks || stickies !== expectedStickies) {
                renderAnnotations(location.href)
              }
            })
          } catch { /* ignore */ }
        }, 1500)
      }
    })
    observer.observe(document.body, { subtree: true, childList: true, characterData: true })

    // Toolbar config
    storage.getToolbarConfig().then(setToolbarConfig).catch(() => {
      setToolbarConfig(storage.getDefaultToolbarConfig())
    })

    // Storage change listener
    const storageListener = (changes: any, area: string) => {
      if (area !== "local") return
      const key = storage.getKey(location.href)
      if (key && changes[key]) renderAnnotations(location.href)
      if (changes["toolbar_config"]) {
        const next = changes["toolbar_config"].newValue as ToolbarConfig | undefined
        if (next) { setToolbarConfig(next); toolbarConfigRef.current = next }
      }
    }
    chrome.storage?.onChanged?.addListener(storageListener)

    // Modifier keys
    const handleKeyDown = (e: KeyboardEvent) => { modifierState.current = { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey } }
    const handleKeyUp = (e: KeyboardEvent) => { modifierState.current = { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey } }
    document.addEventListener("keydown", handleKeyDown)
    document.addEventListener("keyup", handleKeyUp)

    // Selection tracking
    const handleSelectionChange = () => {
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        const text = sel.toString().trim()
        if (text) lastSelectionRef.current = { text, range, rect }
      }
    }
    document.addEventListener("selectionchange", handleSelectionChange)

    const showToolbarIfAllowed = () => {
      const cfg = toolbarConfigRef.current
      if (!isToolbarEnabledForUrl(location.href, cfg)) return
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0)
        const text = sel.toString().trim()
        if (text) setPopupSelection({ text, range, rect: range.getBoundingClientRect() })
      }
    }

    const handleMouseUp = (e: MouseEvent) => {
      const host = document.getElementById(ROOT_CONTAINER_ID)
      if (host && e.target === host) return
      // Only respond to left mouse button release
      if (e.button !== 0) return

      const cfg = toolbarConfigRef.current
      if (!cfg || !cfg.enabled) return

      if (cfg.triggerMode === "middle-click") {
        if (pendingMiddleClick.current) {
          pendingMiddleClick.current = false
          setTimeout(showToolbarIfAllowed, 10)
        }
        return
      }

      // Delay to let the browser finalize the selection range/rect
      const showAfterSettle = () => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return
        const range = sel.getRangeAt(0)
        const text = sel.toString().trim()
        if (text) setPopupSelection({ text, range, rect: range.getBoundingClientRect() })
      }

      if (cfg.triggerMode === "select") { setTimeout(showAfterSettle, 0); return }

      const mod = modifierState.current
      if ((cfg.triggerMode === "ctrl" && mod.ctrl) ||
          (cfg.triggerMode === "alt" && mod.alt) ||
          (cfg.triggerMode === "shift" && mod.shift)) {
        setTimeout(showAfterSettle, 0)
      }
    }

    const handleMouseDown = (e: MouseEvent) => {
      const sel = window.getSelection()
      hasSelectionOnMouseDown.current = !!(sel && !sel.isCollapsed && sel.toString().trim())
      const cfg = toolbarConfigRef.current
      if (!cfg || !cfg.enabled || cfg.triggerMode !== "middle-click" || e.button !== 1) return
      if (sel && !sel.isCollapsed) { e.preventDefault(); pendingMiddleClick.current = true }
    }

    document.addEventListener("mouseup", handleMouseUp)
    document.addEventListener("mousedown", handleMouseDown)

    // Hover re-show — only when mouse button is NOT pressed (prevents toolbar during drag selection)
    const handleMouseMove = (e: MouseEvent) => {
      if (popupSelectionRef.current) return
      if (isMouseDown.current) return                          // ← skip while selecting
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return
      let rect: DOMRect
      try {
        rect = sel.getRangeAt(0).getBoundingClientRect()
      } catch { return }
      // Ignore zero-size rects (selection not yet rendered)
      if (rect.width === 0 && rect.height === 0) return
      const inRect = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom
      if (inRect) {
        if (hoverShowTimer.current) return
        hoverShowTimer.current = setTimeout(() => {
          hoverShowTimer.current = null
          if (isMouseDown.current) return                      // ← double-check before showing
          const currentSel = window.getSelection()
          if (!currentSel || currentSel.isCollapsed) return
          const r = currentSel.getRangeAt(0)
          const t = currentSel.toString().trim()
          if (t) setPopupSelection({ text: t, range: r, rect: r.getBoundingClientRect() })
        }, 50)
      } else {
        if (hoverShowTimer.current) { clearTimeout(hoverShowTimer.current); hoverShowTimer.current = null }
      }
    }
    document.addEventListener("mousemove", handleMouseMove)

    // Track global mouse button state so hover-re-show never fires during a drag
    const handleGlobalMouseDown = (e: MouseEvent) => {
      isMouseDown.current = true
      // Clear any pending hover timer immediately on mouse down
      if (hoverShowTimer.current) {
        clearTimeout(hoverShowTimer.current)
        hoverShowTimer.current = null
      }
    }
    const handleGlobalMouseUp = () => { isMouseDown.current = false }
    document.addEventListener("mousedown", handleGlobalMouseDown, true)
    document.addEventListener("mouseup", handleGlobalMouseUp, true)

    // Context menu: track right-clicked annotation
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      lastLinkText.current = (target.closest?.("a") as HTMLElement)?.textContent?.trim() || ""
      const markEl = target.closest?.(`mark.${HIGHLIGHT_CLASS}`) as HTMLElement | null
      const stickyEl = target.closest?.(`.${STICKY_CLASS}`) as HTMLElement | null
      lastClickedAnnotationId.current = markEl?.dataset?.omninotationId || stickyEl?.dataset?.omninotationId || null
    }
    document.addEventListener("contextmenu", handleContextMenu)

    // Sticky note placement
    const handleStickyClick = (e: MouseEvent) => {
      if (!stickyMode.current) return
      const target = e.target as HTMLElement
      if (target.closest(`.${STICKY_CLASS}`) || target.closest(`[data-omninotation-menu]`)) return

      e.preventDefault()
      e.stopPropagation()
      stickyMode.current = false
      if (stickyTooltip.current) { stickyTooltip.current.remove(); stickyTooltip.current = null }
      document.body.style.cursor = ""

      storage.saveAnnotation({
        id: crypto.randomUUID(),
        url: location.href,
        title: document.title,
        position: { x: e.pageX - 12, y: e.pageY - 12 },
        data: { type: "comment", content: "" },
        author: { id: "local-user", name: t(detectLocale()).me },
        createdAt: new Date().toISOString()
      }).catch(() => {})
    }
    document.addEventListener("click", handleStickyClick, true)

    // Message handler
    const messageListener = (message: any, _sender: any, sendResponse: (r: any) => void) => {
      switch (message.type) {
        case "TAB_UPDATED":
          if (message.url === location.href) renderAnnotations(location.href)
          break
        case "START_STICKY_MODE":
          stickyMode.current = true
          document.body.style.cursor = "crosshair"
          const tooltip = document.createElement("div")
          tooltip.textContent = t(detectLocale()).stickyModeTooltip
          tooltip.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#1f2937;color:white;padding:8px 16px;border-radius:8px;font-size:13px;z-index:2147483647;pointer-events:none;white-space:nowrap;"
          document.body.appendChild(tooltip)
          stickyTooltip.current = tooltip
          break
        case "GET_PAGE_INFO":
          sendResponse({
            type: "PAGE_INFO",
            url: location.href,
            title: document.title
          })
          return true
        case "GET_ANNOTATION_POSITIONS":
          if (!message.annotations) break
          const positions: Record<string, number> = {}
          const cfg = getDomainConfig(location.href)
          const root = anchor.getRootElement(cfg.rootSelector)
          for (const ann of message.annotations as Annotation[]) {
            if (ann.position) { positions[ann.id] = ann.position.y; continue }
            if (!ann.selector) { positions[ann.id] = Infinity; continue }
            const range = anchor.resolveRange(root, ann.selector)
            positions[ann.id] = range ? range.getBoundingClientRect().top + window.scrollY : Infinity
          }
          sendResponse({ type: "ANNOTATION_POSITIONS", positions })
          return true
        case "SCROLL_TO_HIGHLIGHT":
          if (!message.annotationId) break
          const mark = document.querySelector<HTMLElement>(`mark.${HIGHLIGHT_CLASS}[data-omninotation-id="${message.annotationId}"]`)
          if (mark) {
            mark.scrollIntoView({ behavior: "smooth", block: "center" })
            mark.classList.add("omninotation-active")
            setTimeout(() => mark.classList.remove("omninotation-active"), 1500)
          } else {
            const sticky = document.querySelector<HTMLElement>(`.${STICKY_CLASS}[data-omninotation-id="${message.annotationId}"]`)
            if (sticky) {
              sticky.scrollIntoView({ behavior: "smooth", block: "center" })
              sticky.style.transform = "scale(1.5)"
              setTimeout(() => { sticky.style.transform = "" }, 1500)
            }
          }
          break
        case "CONTEXT_MENU_SAVE":
          if (!message.text) break
          const selInfo = lastSelectionRef.current
          if (!selInfo) break
          const markStyle = (message.markStyle as MarkStyle) || "highlight"
          const config = getDomainConfig(location.href)
          const rootEl = anchor.getRootElement(config.rootSelector)
          const selector = anchor.describeRange(rootEl, selInfo.range)
          if (selector) {
            const selectedMarkdown = rangeToMarkdown(selInfo.range) || selInfo.text
            storage.saveAnnotation({
              id: crypto.randomUUID(),
              url: location.href,
              title: document.title,
              selector,
              quote: selectedMarkdown.slice(0, 2000),
              data: { type: "comment", content: "", markStyle },
              author: { id: "local-user", name: t(detectLocale()).me },
              createdAt: new Date().toISOString()
            }).catch(() => {})
          }
          break
        case "CONTEXT_MENU_DELETE":
          if (lastClickedAnnotationId.current) {
            const annId = lastClickedAnnotationId.current
            lastClickedAnnotationId.current = null
            storage.deleteAnnotation(location.href, annId).then(() => {
              removeAnnotationFromDom(annId)
            }).catch(() => {})
          }
          break
        case "COPY_LINK_NAME":
          if (lastLinkText.current) navigator.clipboard.writeText(lastLinkText.current).catch(() => {})
          break
      }
    }
    chrome.runtime?.onMessage?.addListener(messageListener)

    return () => {
      disposeNav()
      observer.disconnect()
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      chrome.storage?.onChanged?.removeListener(storageListener)
      chrome.runtime?.onMessage?.removeListener(messageListener)
      document.removeEventListener("click", handleStickyClick, true)
      document.removeEventListener("mousedown", handleGlobalMouseDown, true)
      document.removeEventListener("mouseup", handleGlobalMouseUp, true)
      document.removeEventListener("selectionchange", handleSelectionChange)
      document.removeEventListener("mouseup", handleMouseUp)
      document.removeEventListener("mousedown", handleMouseDown)
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("keydown", handleKeyDown)
      document.removeEventListener("keyup", handleKeyUp)
      if (hoverShowTimer.current) { clearTimeout(hoverShowTimer.current); hoverShowTimer.current = null }
      if (stickyTooltip.current) { stickyTooltip.current.remove(); stickyTooltip.current = null }
    }
  }, [renderAnnotations])

  if (!shouldActivate(url)) return null

  return (
    <>
      {popupSelection && toolbarConfig && (
        <SelectionToolbar
          selection={{ text: popupSelection.text, range: popupSelection.range, rect: popupSelection.rect }}
          config={toolbarConfig}
          locale={locale}
          onClose={() => setPopupSelection(null)}
        />
      )}
    </>
  )
}