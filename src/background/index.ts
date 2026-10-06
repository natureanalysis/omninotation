// Background service worker for OmniNotation

import { applyCategoryIcon } from "@/services/actionIcon"
import { resolvePageCategory } from "@/services/categories"
import * as hub from "@/services/hub"
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

// Prefer the in-app language preference (locale_pref) so context menus match
// the language chosen in the side panel / options; fall back to the browser UI
// language when no preference is stored yet.
async function bgPreferredLocale(): Promise<"zh-CN" | "en"> {
  try {
    const res = await chrome.storage.local.get("locale_pref")
    if (res?.locale_pref === "zh-CN" || res?.locale_pref === "en") return res.locale_pref
  } catch {
    // storage unavailable – fall through to browser language
  }
  return bgDetectLocale()
}

const BG_STRINGS = {
  "zh-CN": {
    contextMenuHighlight: "▌ 高亮",
    contextMenuUnderline: "U̲ 下划线",
    contextMenuStrikethrough: "S̶ 删除线",
    contextMenuSquiggly: "〰 波浪线",
    contextMenuCopyLinkName: "复制链接名称",
    contextMenuCopyText: "复制文本",
    contextMenuDeleteAnnotation: "删除批注"
  },
  en: {
    contextMenuHighlight: "▌ Highlight",
    contextMenuUnderline: "U̲ Underline",
    contextMenuStrikethrough: "S̶ Strikethrough",
    contextMenuSquiggly: "〰 Squiggly",
    contextMenuCopyLinkName: "Copy Link Name",
    contextMenuCopyText: "Copy text",
    contextMenuDeleteAnnotation: "Delete annotation"
  }
}

async function getBgStrings() {
  return BG_STRINGS[await bgPreferredLocale()]
}

const MARK_STYLE_ITEMS = [
  { id: "omninotation-highlight", style: "highlight", titleKey: "contextMenuHighlight" as const },
  { id: "omninotation-underline", style: "underline", titleKey: "contextMenuUnderline" as const },
  { id: "omninotation-strikethrough", style: "strikethrough", titleKey: "contextMenuStrikethrough" as const },
  { id: "omninotation-squiggly", style: "squiggly", titleKey: "contextMenuSquiggly" as const }
] as const

/**
 * 「复制文本 / 删除批注」只在该链接确实被批注过时才出现。
 * Edge 154 没有 `contextMenus.onShown`（实测 typeof 是 undefined），所以可见性由内容脚本
 * 在 contextmenu 事件里同步报过来——那时原生菜单还没开始构建，赶得上这一次弹出。
 */
const LINK_ANNOTATION_ITEMS = ["omninotation-link-copy-text", "omninotation-link-delete-annotation"] as const

function setLinkAnnotationItemsVisible(visible: boolean): void {
  for (const id of LINK_ANNOTATION_ITEMS) {
    try {
      chrome.contextMenus.update(id, { visible }, () => {
        void chrome.runtime.lastError
      })
    } catch {
      // 菜单还没建好
    }
  }
}

function setupContextMenu() {
  // Menus are (re)created asynchronously after reading the locale preference.
  void (async () => {
    const S = await getBgStrings()
    chrome.contextMenus.removeAll(() => {
      for (const item of MARK_STYLE_ITEMS) {
        chrome.contextMenus.create({
          id: item.id,
          title: S[item.titleKey],
          contexts: ["selection"]
        })
      }
      chrome.contextMenus.create({
        id: "omninotation-copy-link-name",
        title: S.contextMenuCopyLinkName,
        contexts: ["link"]
      })
      for (const id of LINK_ANNOTATION_ITEMS) {
        chrome.contextMenus.create({
          id,
          title: S[id === "omninotation-link-copy-text" ? "contextMenuCopyText" : "contextMenuDeleteAnnotation"],
          contexts: ["link"],
          visible: false
        })
      }
    })
  })()
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("[OmniNotation] Extension installed")
  setupContextMenu()
  registerHubSyncAlarm()
})

// Re-register on startup (also covers dev reloads where onInstalled doesn't fire)
setupContextMenu()
registerHubSyncAlarm()

// ===== KnoWeave 接收同步（hub-share-plan §3.2 / §5.2）=====

const HUB_SYNC_ALARM = "hub-sync"
const HUB_SYNC_PERIOD_MIN = 15
/** tabs.onUpdated 触发的针对性同步节流（避免每次导航都打一轮 API）。 */
const HUB_TAB_SYNC_MIN_INTERVAL_MS = 60_000
let lastTabSyncAt = 0

const HUB_FULL_SYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * 拉取我接收的网页批注并合并到本地。
 * 幂等：由 Hub `content_hash` 判变更；tombstone 防复活。
 *
 * 接收集合的对账（撤回/取消接收 → 整页清理）只能在全量拉取后做：
 * 带 `since` 的响应只含「本次有变更」的页面，未变更的页面不在列表里，
 * 若据此对账会把完好数据当成已撤回清空，而游标已推进则永不再回来。
 */
async function syncHubSubscriptions(): Promise<"ok" | "skipped" | "error"> {
  try {
    const session = await hub.getHubSession()
    if (!session) return "skipped"
    const since = await hub.getHubSyncCursor()
    const lastFullAt = await hub.getHubLastFullSyncAt()
    const fullSync = !since || !lastFullAt || Date.now() - lastFullAt > HUB_FULL_SYNC_INTERVAL_MS
    const feed = await hub.hubPullSubscriptions(fullSync ? undefined : since || undefined)
    for (const page of feed.pages) {
      let comments: hub.HubWebPageComment[] = []
      try {
        comments = await hub.hubListWebPageComments(page.page_id)
      } catch {
        // 评论拉取失败不阻塞批注合并（下次同步会再刷）
      }
      await storage.mergeRemoteAnnotations(
        page.url,
        { pageId: page.page_id, annotations: page.annotations },
        hub.groupHubComments(comments)
      )
    }
    if (fullSync) {
      await storage.reconcileAcceptedPages(feed.pages.map((p) => p.page_id))
      await hub.setHubLastFullSyncAt(Date.now())
    }
    await hub.setHubSyncCursor(feed.now)
    return "ok"
  } catch (e) {
    console.warn("[OmniNotation] hub sync failed:", e)
    return "error"
  }
}

/** MV3：alarms 持久化，service worker 被杀后到期会重新唤醒。 */
function registerHubSyncAlarm(): void {
  try {
    void chrome.alarms.create(HUB_SYNC_ALARM, { periodInMinutes: HUB_SYNC_PERIOD_MIN })
  } catch (e) {
    console.warn("[OmniNotation] hub alarm register failed:", e)
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HUB_SYNC_ALARM) void syncHubSubscriptions()
})

/** 页面加载完成的针对性同步：登录态 + 60s 节流。 */
function maybeSyncOnTabComplete(): void {
  const now = Date.now()
  if (now - lastTabSyncAt < HUB_TAB_SYNC_MIN_INTERVAL_MS) return
  lastTabSyncAt = now
  void syncHubSubscriptions()
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const item = MARK_STYLE_ITEMS.find((i) => i.id === info.menuItemId)
  if (item && tab?.id && info.selectionText) {
    // 面板要在手势的同步调用栈里打开，await 之后就再也开不了（同 action.onClicked）
    if (tab.windowId) {
      void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {})
    }
    chrome.tabs
      .sendMessage(tab.id, {
        type: "CONTEXT_MENU_SAVE",
        text: info.selectionText,
        markStyle: item.style
      })
      .catch(() => {
        // Content script may not be injected yet
      })
  }
  if (info.menuItemId === "omninotation-copy-link-name" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "COPY_LINK_NAME" }).catch(() => {})
  }
  if (info.menuItemId === "omninotation-link-copy-text" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "LINK_ANNOTATION_COPY" }).catch(() => {})
  }
  if (info.menuItemId === "omninotation-link-delete-annotation" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "LINK_ANNOTATION_DELETE" }).catch(() => {})
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
    // 低延迟路径：打开/刷新页面时顺带同步一次接收的批注（登录态 + 节流）
    maybeSyncOnTabComplete()
  }
})

// 点图标开合侧边栏交给平台自己做：`openPanelOnActionClick` 是持久开关，
// 手势、开合状态、跨 SW 休眠都由浏览器负责。后台自己记「哪个窗口开着面板」不可靠——
// 面板文档要等 React 挂载后才上报端口，中间那一下点击会落空，看起来像没反应。
// 老版本没有这个开关时，下面的 onClicked 兜底至少保证「点击能打开」。
chrome.action.onClicked.addListener((tab) => {
  // 注意：`sidePanel.open()` 只在用户手势的同步调用栈里有效，前面不能有任何 await。
  if (typeof tab.windowId === "number") {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {})
  }
})
try {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
} catch {
  /* 更早的版本没有这个开关：上面的 onClicked 兜底负责打开 */
}

// Click mark in page → open side panel and scroll to annotation
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "HIGHLIGHT_CLICKED" && sender.tab?.windowId) {
    chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(() => {})
  }
  // 右键落在被批注的链接上时，才把「复制文本 / 删除批注」挂进原生链接菜单
  if (message.type === "SET_LINK_MENU_VISIBLE") {
    setLinkAnnotationItemsVisible(!!message.visible)
  }
  // 页面选区点击「添加批注」后打开侧边栏，让用户在笔记面板中编辑
  if (message.type === "OPEN_SIDE_PANEL") {
    const windowId = sender.tab?.windowId
    if (windowId) {
      chrome.sidePanel.open({ windowId }).catch(() => {})
    }
    sendResponse({ ok: true })
    return true
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
  // 侧边栏改完分类后立刻刷新工具栏图标（storage 变更监听是兜底，这条保证不延迟）
  if (message.type === "REFRESH_ACTION_ICON") {
    void (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (tab?.id && tab?.url) await updateActionIcon(tab.id, tab.url)
      } catch {
        /* ignore */
      }
    })()
    sendResponse({ ok: true })
    return false
  }
  // 设置页「同步接收的批注」按钮：立即拉取一次
  if (message.type === "HUB_SYNC_NOW") {
    void syncHubSubscriptions().then((status) => sendResponse({ status }))
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
    await applyCategoryIcon(null, tabId)
    chrome.action.setBadgeText({ tabId, text: "" })
    return
  }

  const pageCategory = await resolvePageCategory(url)
  if (pageCategory.category) {
    // 按标签页设置图标，避免全局图标盖掉其它标签页的状态
    await applyCategoryIcon(pageCategory.category, tabId)
    chrome.action.setBadgeText({ tabId, text: "" })
    return
  }

  await ensureIcons()
  const bookmarks = await storage.getBookmarks()
  const bookmark = bookmarks.find((b) => b.url === url)
  const categories = await storage.getPageCategories()
  const category = bookmark?.categoryId ? categories.find((c) => c.id === bookmark.categoryId) : undefined
  const isBookmarked = !!bookmark
  const baseColor = category?.color || (isBookmarked ? GOLD : GREEN)
  const icon = isBookmarked ? await createTintedIcon(baseColor) : greenIcon

  if (icon) {
    chrome.action.setIcon({ tabId, imageData: { 32: icon } })
  }

  if (isBookmarked) {
    chrome.action.setBadgeBackgroundColor({ tabId, color: baseColor })
    // 分类图标存的是字形名（"bookmark"/"star"），不能直接当徽标文字用
    chrome.action.setBadgeText({ tabId, text: category?.name.trim().slice(0, 1) || "★" })
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

// 图标相关的存储键：收藏状态、分类定义、页面分类指定，
// 以及自动规则依赖的批注统计（annotations:<url>）。任一变化都要立刻刷新图标，
// 否则「更换分类后图标要等切标签页才更新」。
const ICON_REFRESH_KEYS = new Set(["bookmarks", "page_categories", "page_category_assignments"])

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return

  const touched = Object.keys(changes)
  // Language switch → rebuild context menus in the new locale
  if (changes["locale_pref"]) {
    setupContextMenu()
  }
  const relevant = touched.some((key) => ICON_REFRESH_KEYS.has(key) || key.startsWith("annotations:"))
  if (!relevant) return

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id && tab?.url) {
    updateActionIcon(tab.id, tab.url)
  }
})
