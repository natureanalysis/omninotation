import type { Annotation } from "@/types"
import { darkenForDarkMode } from "./color"
import * as storage from "./storage"

export const HIGHLIGHT_CLASS = "omninotation-highlight"
export const STICKY_CLASS = "omninotation-sticky"
export const PAGE_STYLE_ID = "omninotation-page-style"

export function getMarkStyleCss(color: { bg: string; hover: string }): string {
  const darkBg = darkenForDarkMode(color.bg)
  return `
    .${HIGHLIGHT_CLASS} {
      cursor: pointer;
      transition: filter 0.15s;
    }
    .${HIGHLIGHT_CLASS}:hover {
      filter: brightness(0.9);
    }
    .${HIGHLIGHT_CLASS}.omninotation-style-highlight {
      background-color: ${color.bg} !important;
    }
    .${HIGHLIGHT_CLASS}.omninotation-style-underline {
      border-bottom: 2px solid ${color.bg.replace(/[\d.]+\)$/, "0.8)")} !important;
      background-color: transparent !important;
    }
    .${HIGHLIGHT_CLASS}.omninotation-style-strikethrough {
      text-decoration: line-through !important;
      text-decoration-color: ${color.bg.replace(/[\d.]+\)$/, "0.7)")} !important;
      background-color: transparent !important;
    }
    .${HIGHLIGHT_CLASS}.omninotation-style-squiggly {
      text-decoration: underline wavy !important;
      text-decoration-color: ${color.bg.replace(/[\d.]+\)$/, "0.7)")} !important;
      background-color: transparent !important;
    }

    /* Inline color overrides via CSS custom properties */
    .${HIGHLIGHT_CLASS}[data-omninotation-inline-color].omninotation-style-highlight {
      background-color: var(--omninotation-inline-bg) !important;
    }
    .${HIGHLIGHT_CLASS}[data-omninotation-inline-color].omninotation-style-underline {
      border-bottom-color: var(--omninotation-inline-border) !important;
    }
    .${HIGHLIGHT_CLASS}[data-omninotation-inline-color].omninotation-style-strikethrough {
      text-decoration-color: var(--omninotation-inline-deco) !important;
    }
    .${HIGHLIGHT_CLASS}[data-omninotation-inline-color].omninotation-style-squiggly {
      text-decoration-color: var(--omninotation-inline-deco) !important;
    }

    /* Dark mode */
    @media (prefers-color-scheme: dark) {
      .${HIGHLIGHT_CLASS}.omninotation-style-highlight {
        background-color: ${darkBg} !important;
      }
      .${HIGHLIGHT_CLASS}.omninotation-style-underline {
        border-bottom-color: ${darkBg.replace(/[\d.]+\)$/, "0.8)")} !important;
      }
      .${HIGHLIGHT_CLASS}.omninotation-style-strikethrough {
        text-decoration-color: ${darkBg.replace(/[\d.]+\)$/, "0.7)")} !important;
      }
      .${HIGHLIGHT_CLASS}.omninotation-style-squiggly {
        text-decoration-color: ${darkBg.replace(/[\d.]+\)$/, "0.7)")} !important;
      }
      .${HIGHLIGHT_CLASS}[data-omninotation-inline-color].omninotation-style-highlight {
        background-color: var(--omninotation-inline-bg-dark) !important;
      }
      .${HIGHLIGHT_CLASS}[data-omninotation-inline-color].omninotation-style-underline {
        border-bottom-color: var(--omninotation-inline-border-dark) !important;
      }
      .${HIGHLIGHT_CLASS}[data-omninotation-inline-color].omninotation-style-strikethrough {
        text-decoration-color: var(--omninotation-inline-deco-dark) !important;
      }
      .${HIGHLIGHT_CLASS}[data-omninotation-inline-color].omninotation-style-squiggly {
        text-decoration-color: var(--omninotation-inline-deco-dark) !important;
      }
    }

    .${STICKY_CLASS} {
      position: absolute;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: ${color.bg.replace(/[\d.]+\)$/, "0.6)")};
      border: 2px solid ${color.bg.replace(/[\d.]+\)$/, "0.9)")};
      cursor: pointer;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      transition: transform 0.2s, box-shadow 0.2s;
      box-shadow: 0 2px 4px rgba(0,0,0,0.15);
    }
    .${STICKY_CLASS}:hover {
      transform: scale(1.2);
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
    }
    .${STICKY_CLASS}::after {
      content: "📌";
    }
    @media (prefers-color-scheme: dark) {
      .${STICKY_CLASS} {
        background: ${darkBg.replace(/[\d.]+\)$/, "0.6)")};
        border-color: ${darkBg.replace(/[\d.]+\)$/, "0.9)")};
      }
    }
    @keyframes omninotation-flash {
      0% { outline: 2px solid transparent; }
      50% { outline: 2px solid #3b82f6; }
      100% { outline: 2px solid transparent; }
    }
    .${HIGHLIGHT_CLASS}.omninotation-active {
      animation: omninotation-flash 1.2s ease;
    }
  `
}

export async function injectPageStyles() {
  const color = await storage.getHighlightColor()
  let style = document.getElementById(PAGE_STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement("style")
    style.id = PAGE_STYLE_ID
    document.head.appendChild(style)
  }
  style.textContent = getMarkStyleCss(color)
}

export function clearHighlights() {
  const marks = document.querySelectorAll<HTMLElement>(`mark.${HIGHLIGHT_CLASS}`)
  marks.forEach((el) => {
    const parent = el.parentNode
    if (!parent) return
    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el)
    }
    parent.removeChild(el)
    parent.normalize()
  })
}

export function clearStickies() {
  document.querySelectorAll<HTMLElement>(`.${STICKY_CLASS}`).forEach((el) => el.remove())
}

export function renderSticky(ann: Annotation) {
  if (!ann.position) return
  const existing = document.querySelector<HTMLElement>(`.${STICKY_CLASS}[data-omninotation-id="${ann.id}"]`)
  if (existing) return

  const sticky = document.createElement("div")
  sticky.className = STICKY_CLASS
  sticky.dataset.omninotationId = ann.id
  sticky.style.left = `${ann.position.x}px`
  sticky.style.top = `${ann.position.y}px`
  if (ann.data.color) {
    sticky.style.background = ann.data.color.replace(/[\d.]+\)$/, "0.6)")
    sticky.style.borderColor = ann.data.color.replace(/[\d.]+\)$/, "0.9)")
  }

  sticky.addEventListener("click", (e) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      chrome.runtime.sendMessage({
        type: "HIGHLIGHT_CLICKED",
        annotationId: ann.id
      }).catch(() => {})
    } catch {
      // Extension context invalidated
    }
  })

  document.body.appendChild(sticky)
}

function applyMarkInlineColor(mark: HTMLElement, markStyle: string, color: string) {
  const darkColor = darkenForDarkMode(color)
  mark.dataset.omninotationInlineColor = "true"
  switch (markStyle) {
    case "highlight":
      mark.style.setProperty("--omninotation-inline-bg", color)
      mark.style.setProperty("--omninotation-inline-bg-dark", darkColor)
      break
    case "underline":
      mark.style.setProperty("--omninotation-inline-border", color.replace(/[\d.]+\)$/, "0.8)"))
      mark.style.setProperty("--omninotation-inline-border-dark", darkColor.replace(/[\d.]+\)$/, "0.8)"))
      break
    case "strikethrough":
      mark.style.setProperty("--omninotation-inline-deco", color.replace(/[\d.]+\)$/, "0.7)"))
      mark.style.setProperty("--omninotation-inline-deco-dark", darkColor.replace(/[\d.]+\)$/, "0.7)"))
      break
    case "squiggly":
      mark.style.setProperty("--omninotation-inline-deco", color.replace(/[\d.]+\)$/, "0.7)"))
      mark.style.setProperty("--omninotation-inline-deco-dark", darkColor.replace(/[\d.]+\)$/, "0.7)"))
      break
  }
}

export function wrapRange(range: Range, id: string, type: "comment" | "edit", markStyle: string = "highlight", color?: string) {
  const mark = document.createElement("mark")
  mark.className = `${HIGHLIGHT_CLASS} omninotation-style-${markStyle}`
  mark.dataset.omninotationId = id
  mark.dataset.omninotationType = type
  mark.dataset.omninotationStyle = markStyle
  if (color) {
    applyMarkInlineColor(mark, markStyle, color)
  }

  try {
    range.surroundContents(mark)
    attachMarkClick(mark, id)
    return
  } catch {
    // Range spans block boundaries — fall through
  }

  // Fallback: split by text nodes
  const textNodes: { node: Text; start: number; end: number }[] = []
  const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, null)

  let node: Node | null
  while ((node = walker.nextNode())) {
    const textNode = node as Text
    const text = textNode.textContent || ""
    let start = 0
    let end = text.length

    if (textNode === range.startContainer) start = range.startOffset
    if (textNode === range.endContainer) end = range.endOffset

    const nodeRange = document.createRange()
    nodeRange.selectNode(textNode)
    const isAfterStart = range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0 ||
      (range.startContainer === textNode && range.startOffset < text.length)
    const isBeforeEnd = range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 ||
      (range.endContainer === textNode && range.endOffset > 0)

    if (isAfterStart && isBeforeEnd && start < end) {
      textNodes.push({ node: textNode, start, end })
    }
  }

  textNodes.reverse().forEach(({ node, start, end }) => {
    const text = node.textContent || ""
    const before = text.slice(0, start)
    const selected = text.slice(start, end)
    const after = text.slice(end)
    if (!selected) return

    const fragment = document.createDocumentFragment()
    if (before) fragment.appendChild(document.createTextNode(before))

    const nodeMark = document.createElement("mark")
    nodeMark.className = `${HIGHLIGHT_CLASS} omninotation-style-${markStyle}`
    nodeMark.dataset.omninotationId = id
    nodeMark.dataset.omninotationType = type
    nodeMark.dataset.omninotationStyle = markStyle
    nodeMark.textContent = selected
    if (color) {
      applyMarkInlineColor(nodeMark, markStyle, color)
    }
    fragment.appendChild(nodeMark)

    if (after) fragment.appendChild(document.createTextNode(after))

    node.parentNode?.replaceChild(fragment, node)
    attachMarkClick(nodeMark, id)
  })
}

function attachMarkClick(mark: HTMLElement, id: string) {
  mark.addEventListener("click", (e) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      chrome.runtime.sendMessage({
        type: "HIGHLIGHT_CLICKED",
        annotationId: id
      }).catch(() => {})
    } catch {
      // Extension context invalidated
    }
  })
}

export function countRenderedAnnotations(): { marks: number; stickies: number } {
  return {
    marks: document.querySelectorAll(`mark.${HIGHLIGHT_CLASS}`).length,
    stickies: document.querySelectorAll(`.${STICKY_CLASS}`).length
  }
}

export function observeSpaNavigation(callback: () => void) {
  let lastUrl = location.href
  let urlChangeTimer: ReturnType<typeof setTimeout> | null = null
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href
      if (urlChangeTimer) clearTimeout(urlChangeTimer)
      urlChangeTimer = setTimeout(callback, 300)
    }
  })
  observer.observe(document.documentElement, { subtree: true, childList: true })
  window.addEventListener("popstate", callback)
  window.addEventListener("hashchange", callback)
  return () => {
    observer.disconnect()
    if (urlChangeTimer) clearTimeout(urlChangeTimer)
    window.removeEventListener("popstate", callback)
    window.removeEventListener("hashchange", callback)
  }
}

export function removeAnnotationFromDom(id: string) {
  const mark = document.querySelector<HTMLElement>(
    `mark.${HIGHLIGHT_CLASS}[data-omninotation-id="${id}"]`
  )
  if (mark) {
    const parent = mark.parentNode
    if (parent) {
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
      parent.removeChild(mark)
      parent.normalize()
    }
  }
  const sticky = document.querySelector<HTMLElement>(
    `.${STICKY_CLASS}[data-omninotation-id="${id}"]`
  )
  if (sticky) sticky.remove()
}
