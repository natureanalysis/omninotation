// Background service worker for OmniNotation

import * as storage from "@/services/storage"

// i18n for background (service worker can't use navigator.language)
function bgDetectLocale(): "zh-CN" | "en" {
  try {
    const lang = chrome.i18n.getUILanguage()
    return lang.startsWith("zh") ? "zh-CN" : "en"
  } catch {
    return "en"
  }
}

const BG_STRINGS = {
  "zh-CN": {
    contextMenuHighlight: "▌ 高亮",
    contextMenuUnderline: "U̲ 下划线",
    contextMenuStrikethrough: "S̶ 删除线",
    contextMenuSquiggly: "〰 波浪线",
    contextMenuDelete: "删除此批注"
  },
  en: {
    contextMenuHighlight: "▌ Highlight",
    contextMenuUnderline: "U̲ Underline",
    contextMenuStrikethrough: "S̶ Strikethrough",
    contextMenuSquiggly: "〰 Squiggly",
    contextMenuDelete: "Delete this annotation"
  }
}

function getBgStrings() {
  return BG_STRINGS[bgDetectLocale()]
}

const MARK_STYLE_ITEMS = [
  { id: "omninotation-highlight", style: "highlight", titleKey: "contextMenuHighlight" as const },
  { id: "omninotation-underline", style: "underline", titleKey: "contextMenuUnderline" as const },
  { id: "omninotation-strikethrough", style: "strikethrough", titleKey: "contextMenuStrikethrough" as const },
  { id: "omninotation-squiggly", style: "squiggly", titleKey: "contextMenuSquiggly" as const }
] as const

function setupContextMenu() {
  const S = getBgStrings()
  chrome.contextMenus.removeAll(() => {
    for (const item of MARK_STYLE_ITEMS) {
      chrome.contextMenus.create({
        id: item.id,
        title: S[item.titleKey],
        contexts: ["selection"]
      })
    }
    chrome.contextMenus.create({
      id: "omninotation-delete-annotation",
      title: S.contextMenuDelete,
      contexts: ["page"]
    })
    chrome.contextMenus.create({
      id: "omninotation-copy-link-name",
      title: "Copy Link Name",
      contexts: ["link"]
    })
  })
}

async function ensureOptionalPageAccess(tab?: chrome.tabs.Tab): Promise<boolean> {
  if (!tab?.url) return false

  const origins = ["https://*/*", "http://*/*"]
  try {
    const hasAccess = await chrome.permissions.contains({ origins })
    if (hasAccess) return true
    return await chrome.permissions.request({ origins })
  } catch {
    return false
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("[OmniNotation] Extension installed")
  setupContextMenu()
})

// Re-register on startup (also covers dev reloads where onInstalled doesn't fire)
setupContextMenu()

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const item = MARK_STYLE_ITEMS.find((i) => i.id === info.menuItemId)
  if (item && tab?.id && info.selectionText) {
    await ensureOptionalPageAccess(tab)
    chrome.tabs.sendMessage(tab.id, {
      type: "CONTEXT_MENU_SAVE",
      text: info.selectionText,
      markStyle: item.style
    }).catch(() => {
      // Content script may not be injected yet
    })
    // Open side panel so user can see/edit the new annotation
    if (tab.windowId) {
      chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {})
    }
  }
  if (info.menuItemId === "omninotation-delete-annotation" && tab?.id) {
    await ensureOptionalPageAccess(tab)
    chrome.tabs.sendMessage(tab.id, { type: "CONTEXT_MENU_DELETE" }).catch(() => {})
  }
  if (info.menuItemId === "omninotation-copy-link-name" && tab?.id) {
    await ensureOptionalPageAccess(tab)
    chrome.tabs.sendMessage(tab.id, { type: "COPY_LINK_NAME" }).catch(() => {})
  }
})

// Listen for tab updates to notify content scripts about URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    chrome.tabs.sendMessage(tabId, {
      type: "TAB_UPDATED",
      url: tab.url
    }).catch(() => {
      // Content script may not be injected yet
    })
  }
})

// Click extension icon to open Chrome side panel
chrome.action.onClicked.addListener(async (tab) => {
  await ensureOptionalPageAccess(tab)
  if (tab.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {})
  }
})

// Click mark in page → open side panel and scroll to annotation
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "HIGHLIGHT_CLICKED" && sender.tab?.windowId) {
    chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(() => {})
  }
  if (message.type === "OPEN_BACKGROUND_TAB" && message.url) {
    chrome.tabs.create({ url: message.url, active: false }).catch(() => {})
    sendResponse({ ok: true })
    return true
  }
  if (message.type === "OPEN_PINNED_TAB" && message.url) {
    chrome.tabs.create({ url: message.url, pinned: true }).catch(() => {})
    sendResponse({ ok: true })
    return true
  }
})

// ===== Icon color: red = bookmarked, green = not bookmarked =====

async function createTintedIcon(color: string): Promise<ImageData> {
  const size = 32
  const canvas = new OffscreenCanvas(size, size)
  const ctx = canvas.getContext("2d")!

  // Try to load the original icon from manifest and tint it
  try {
    const manifest = chrome.runtime.getManifest()
    const iconPath = manifest.icons?.[32] || manifest.action?.default_icon?.[32]
    if (!iconPath) throw new Error("No icon found in manifest")

    const response = await fetch(chrome.runtime.getURL("/" + iconPath))
    const blob = await response.blob()
    const bitmap = await createImageBitmap(blob)

    // Draw original
    ctx.drawImage(bitmap, 0, 0, size, size)

    // Apply color tint using source-atop
    ctx.globalCompositeOperation = "source-atop"
    ctx.fillStyle = color
    ctx.fillRect(0, 0, size, size)

    return ctx.getImageData(0, 0, size, size)
  } catch {
    // Fallback: draw a simple colored circle
    ctx.clearRect(0, 0, size, size)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2)
    ctx.fill()

    // White border
    ctx.strokeStyle = "#ffffff"
    ctx.lineWidth = 2
    ctx.stroke()

    return ctx.getImageData(0, 0, size, size)
  }
}

const GOLD = "#fbbf24"
const GREEN = "#22c55e"

let goldIcon: ImageData | null = null
let greenIcon: ImageData | null = null

async function ensureIcons() {
  if (!goldIcon) goldIcon = await createTintedIcon(GOLD)
  if (!greenIcon) greenIcon = await createTintedIcon(GREEN)
}

async function updateActionIcon(tabId: number, url: string | undefined) {
  if (!url || url.startsWith("chrome://") || url.startsWith("chrome-extension://")) {
    // Reset to default for internal pages
    chrome.action.setIcon({ tabId, path: { 32: "/icon32.plasmo.76b92899.png" } })
    chrome.action.setBadgeText({ tabId, text: "" })
    return
  }

  await ensureIcons()
  const isBookmarked = await storage.isBookmarked(url)
  const icon = isBookmarked ? goldIcon : greenIcon

  if (icon) {
    chrome.action.setIcon({ tabId, imageData: { 32: icon } })
  }

  // Also set a small badge indicator for extra clarity
  if (isBookmarked) {
    chrome.action.setBadgeBackgroundColor({ tabId, color: GOLD })
    chrome.action.setBadgeText({ tabId, text: "★" })
  } else {
    chrome.action.setBadgeText({ tabId, text: "" })
  }
}

// Update icon when tab is activated
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId)
  if (tab?.url) {
    updateActionIcon(tabId, tab.url)
  }
})

// Update icon when tab URL changes
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.url) {
    updateActionIcon(tabId, tab.url)
  }
})

// Update icon when bookmarks change in storage
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return
  if (!changes["bookmarks"]) return

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id && tab?.url) {
    updateActionIcon(tab.id, tab.url)
  }
})
