import { getLocalIconUrl } from "@/services/color"
import type { Annotation, AnnotationEntry, Bookmark, BookmarkFolder, Group, PageCategory, UserProfile, Reply, Visibility, ToolbarConfig, ToolbarSearchEngine, ToolbarStyle, AnnotationType, MarkStyle } from "@/types"

import defaultEnginesJson from "./engines.json"

const ANNOTATION_KEY_PREFIX = "annotations:"

export function getKey(url: string): string {
  return ANNOTATION_KEY_PREFIX + url
}

function safeGet(keys: string | string[]): Promise<Record<string, any>> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || ""
          if (msg.includes("Extension context invalidated")) {
            console.warn("[OmniNotation] 扩展已重新加载，请刷新页面。")
          } else {
            console.warn("[OmniNotation] storage get error:", msg)
          }
          resolve({})
        } else {
          resolve(result)
        }
      })
    } catch (e) {
      console.warn("[OmniNotation] storage get exception:", e)
      resolve({})
    }
  })
}

function safeSet(items: Record<string, any>): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(items, () => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || ""
          if (msg.includes("Extension context invalidated")) {
            console.warn("[OmniNotation] 扩展已重新加载，请刷新页面。")
          } else {
            console.warn("[OmniNotation] storage set error:", msg)
          }
        }
        resolve()
      })
    } catch (e) {
      console.warn("[OmniNotation] storage set exception:", e)
      resolve()
    }
  })
}

function safeRemove(keys: string | string[]): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.remove(keys, () => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || ""
          if (msg.includes("Extension context invalidated")) {
            console.warn("[OmniNotation] 扩展已重新加载，请刷新页面。")
          } else {
            console.warn("[OmniNotation] storage remove error:", msg)
          }
        }
        resolve()
      })
    } catch (e) {
      console.warn("[OmniNotation] storage remove exception:", e)
      resolve()
    }
  })
}

export async function getAnnotations(url: string): Promise<Annotation[]> {
  const key = getKey(url)
  const result = await safeGet(key)
  return result[key] ?? []
}

export async function saveAnnotation(annotation: Annotation): Promise<void> {
  const key = getKey(annotation.url)
  const existing = await getAnnotations(annotation.url)
  const index = existing.findIndex((a) => a.id === annotation.id)
  if (index >= 0) {
    existing[index] = annotation
  } else {
    existing.push(annotation)
  }
  await safeSet({ [key]: existing })
  // Auto-bookmark if not already bookmarked
  const bookmarked = await isBookmarked(annotation.url)
  if (!bookmarked) {
    await addBookmark({
      id: crypto.randomUUID(),
      url: annotation.url,
      title: annotation.title || annotation.url,
      visibility: "private",
      createdAt: new Date().toISOString()
    })
  }
}

export async function deleteAnnotation(url: string, id: string): Promise<void> {
  const key = getKey(url)
  const existing = await getAnnotations(url)
  const filtered = existing.filter((a) => a.id !== id)
  await safeSet({ [key]: filtered })
}

export async function addReply(url: string, annotationId: string, reply: Reply): Promise<void> {
  const key = getKey(url)
  const annotations = await getAnnotations(url)
  const ann = annotations.find((a) => a.id === annotationId)
  if (!ann) return
  if (!ann.replies) ann.replies = []
  ann.replies.push(reply)
  await safeSet({ [key]: annotations })
}

function findReplyRecursive(replies: Reply[], replyId: string): Reply | undefined {
  for (const r of replies) {
    if (r.id === replyId) return r
    if (r.replies) {
      const found = findReplyRecursive(r.replies, replyId)
      if (found) return found
    }
  }
  return undefined
}

function deleteReplyRecursive(replies: Reply[], replyId: string): boolean {
  const index = replies.findIndex((r) => r.id === replyId)
  if (index >= 0) {
    replies.splice(index, 1)
    return true
  }
  for (const r of replies) {
    if (r.replies && deleteReplyRecursive(r.replies, replyId)) {
      return true
    }
  }
  return false
}

function updateReplyRecursive(replies: Reply[], replyId: string, content: string): boolean {
  const reply = replies.find((r) => r.id === replyId)
  if (reply) {
    reply.content = content
    return true
  }
  for (const r of replies) {
    if (r.replies && updateReplyRecursive(r.replies, replyId, content)) {
      return true
    }
  }
  return false
}

export async function deleteReply(url: string, annotationId: string, replyId: string): Promise<void> {
  const key = getKey(url)
  const annotations = await getAnnotations(url)
  const ann = annotations.find((a) => a.id === annotationId)
  if (!ann || !ann.replies) return
  deleteReplyRecursive(ann.replies, replyId)
  await safeSet({ [key]: annotations })
}

export async function updateAnnotationContent(url: string, annotationId: string, content: string): Promise<void> {
  const key = getKey(url)
  const annotations = await getAnnotations(url)
  const ann = annotations.find((a) => a.id === annotationId)
  if (!ann) return
  ann.data.content = content
  ann.updatedAt = new Date().toISOString()
  await safeSet({ [key]: annotations })
}

export async function updateReplyContent(url: string, annotationId: string, replyId: string, content: string): Promise<void> {
  const key = getKey(url)
  const annotations = await getAnnotations(url)
  const ann = annotations.find((a) => a.id === annotationId)
  if (!ann || !ann.replies) return
  if (!updateReplyRecursive(ann.replies, replyId, content)) return
  await safeSet({ [key]: annotations })
}

export async function updateAnnotationStatus(url: string, annotationId: string, status: "open" | "resolved"): Promise<void> {
  const key = getKey(url)
  const annotations = await getAnnotations(url)
  const ann = annotations.find((a) => a.id === annotationId)
  if (!ann) return
  ann.status = status
  await safeSet({ [key]: annotations })
}

export async function updateAnnotationColor(url: string, annotationId: string, color: string | undefined): Promise<void> {
  const key = getKey(url)
  const annotations = await getAnnotations(url)
  const ann = annotations.find((a) => a.id === annotationId)
  if (!ann) return
  ann.data.color = color
  ann.updatedAt = new Date().toISOString()
  await safeSet({ [key]: annotations })
}

export async function clearAnnotations(url: string): Promise<void> {
  const key = getKey(url)
  await safeRemove(key)
}

export async function updateBookmarkVisibility(url: string, visibility: Visibility, groupId?: string): Promise<void> {
  const bookmarks = await getBookmarks()
  const bm = bookmarks.find((b) => b.url === url)
  if (!bm) return
  bm.visibility = visibility
  if (groupId) bm.groupId = groupId
  else delete bm.groupId
  await safeSet({ [BOOKMARKS_KEY]: bookmarks })
}

export async function updateBookmarkTags(url: string, tags: string[]): Promise<void> {
  const bookmarks = await getBookmarks()
  const bm = bookmarks.find((b) => b.url === url)
  if (!bm) return
  bm.tags = tags
  await safeSet({ [BOOKMARKS_KEY]: bookmarks })
}

export function getDefaultPageCategories(): PageCategory[] {
  return [
    { id: "to-read", name: "To Read", icon: "📖", color: "#fbbf24" },
    { id: "important", name: "Important", icon: "⭐", color: "#ef4444" },
    { id: "read", name: "Read", icon: "✅", color: "#22c55e" },
    { id: "annotated", name: "Annotated", icon: "💬", color: "#3b82f6" }
  ]
}

const PAGE_CATEGORIES_KEY = "page_categories"

export async function getPageCategories(): Promise<PageCategory[]> {
  const result = await safeGet(PAGE_CATEGORIES_KEY)
  const saved = result[PAGE_CATEGORIES_KEY] as PageCategory[] | undefined
  return saved && saved.length > 0 ? saved : getDefaultPageCategories()
}

export async function savePageCategories(categories: PageCategory[]): Promise<void> {
  await safeSet({ [PAGE_CATEGORIES_KEY]: categories })
}

export async function setPageCategory(url: string, categoryId: string | undefined): Promise<void> {
  const bookmarks = await getBookmarks()
  const bm = bookmarks.find((b) => b.url === url)
  if (!bm) {
    const cat = categoryId ? (await getPageCategories()).find((c) => c.id === categoryId) : undefined
    if (!cat) return
    const newBookmark: Bookmark = {
      id: crypto.randomUUID(),
      url,
      title: url,
      createdAt: new Date().toISOString(),
      categoryId
    }
    bookmarks.unshift(newBookmark)
    await safeSet({ [BOOKMARKS_KEY]: bookmarks })
    return
  }

  if (categoryId) bm.categoryId = categoryId
  else delete bm.categoryId
  await safeSet({ [BOOKMARKS_KEY]: bookmarks })
}

export async function getPageCategoryForUrl(url: string): Promise<PageCategory | undefined> {
  const bookmarks = await getBookmarks()
  const bm = bookmarks.find((b) => b.url === url)
  if (!bm?.categoryId) return undefined
  const categories = await getPageCategories()
  return categories.find((c) => c.id === bm.categoryId)
}

export async function getSuggestedPageCategory(url: string, title = ""): Promise<PageCategory | undefined> {
  const categories = await getPageCategories()
  const text = `${url} ${title}`.toLowerCase()

  const categoryHints: Array<{ id: string; keywords: string[] }> = [
    { id: "important", keywords: ["paper", "research", "study", "journal", "analysis", "report", "abstract", "doi", "arxiv", "scholar", "pubmed", "nature", "science"] },
    { id: "to-read", keywords: ["blog", "tutorial", "guide", "learning", "docs", "reference", "manual", "howto", "course", "notes", "wiki"] },
    { id: "read", keywords: ["wikipedia", "encyclopedia", "article", "news", "readme", "documentation", "overview"] },
    { id: "annotated", keywords: ["annotation", "highlight", "notes", "memo", "bookmark", "workspace", "project"] }
  ]

  let bestMatch: { category: PageCategory; score: number } | undefined

  for (const hint of categoryHints) {
    const category = categories.find((c) => c.id === hint.id)
    if (!category) continue
    const score = hint.keywords.reduce((total, keyword) => total + (text.includes(keyword) ? 2 : 0), 0)
    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { category, score }
    }
  }

  if (bestMatch) return bestMatch.category

  const bookmarks = await getBookmarks()
  const bookmark = bookmarks.find((b) => b.url === url)
  if (bookmark?.categoryId) {
    return categories.find((category) => category.id === bookmark.categoryId)
  }

  return categories[0]
}

// Hierarchical replies — reply to a specific reply
export async function addNestedReply(url: string, annotationId: string, parentReplyId: string, reply: Reply): Promise<void> {
  const key = getKey(url)
  const annotations = await getAnnotations(url)
  const ann = annotations.find((a) => a.id === annotationId)
  if (!ann || !ann.replies) return
  const parent = ann.replies.find((r) => r.id === parentReplyId)
  if (!parent) return
  if (!parent.replies) parent.replies = []
  parent.replies.push(reply)
  await safeSet({ [key]: annotations })
}

// Groups
const GROUPS_KEY = "groups"

export async function getGroups(): Promise<Group[]> {
  const result = await safeGet(GROUPS_KEY)
  return result[GROUPS_KEY] ?? []
}

export async function saveGroup(group: Group): Promise<void> {
  const groups = await getGroups()
  const index = groups.findIndex((g) => g.id === group.id)
  if (index >= 0) groups[index] = group
  else groups.push(group)
  await safeSet({ [GROUPS_KEY]: groups })
}

export async function deleteGroup(id: string): Promise<void> {
  const groups = await getGroups()
  await safeSet({ [GROUPS_KEY]: groups.filter((g) => g.id !== id) })
}

// User profile
const USER_PROFILE_KEY = "user_profile"

export async function getUserProfile(): Promise<UserProfile | null> {
  const result = await safeGet(USER_PROFILE_KEY)
  return result[USER_PROFILE_KEY] ?? null
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await safeSet({ [USER_PROFILE_KEY]: profile })
}

const ANNOTATION_ORDER_PREFIX = "annotation_order:"

export function getOrderKey(url: string): string {
  return ANNOTATION_ORDER_PREFIX + url
}

export async function getAnnotationOrder(url: string): Promise<string[]> {
  const key = getOrderKey(url)
  const result = await safeGet(key)
  return result[key] ?? []
}

export async function saveAnnotationOrder(url: string, order: string[]): Promise<void> {
  const key = getOrderKey(url)
  await safeSet({ [key]: order })
}

const HIGHLIGHT_COLOR_KEY = "highlight_color"

export interface HighlightColor {
  bg: string
  hover: string
}

export async function getHighlightColor(): Promise<HighlightColor> {
  const result = await safeGet(HIGHLIGHT_COLOR_KEY)
  return result[HIGHLIGHT_COLOR_KEY] ?? {
    bg: "rgba(250, 204, 21, 0.3)",
    hover: "rgba(250, 204, 21, 0.6)"
  }
}

export async function setHighlightColor(color: HighlightColor): Promise<void> {
  await safeSet({ [HIGHLIGHT_COLOR_KEY]: color })
}

const BOOKMARKS_KEY = "bookmarks"

export async function getBookmarks(): Promise<Bookmark[]> {
  const result = await safeGet(BOOKMARKS_KEY)
  return result[BOOKMARKS_KEY] ?? []
}

export async function isBookmarked(url: string): Promise<boolean> {
  const bookmarks = await getBookmarks()
  return bookmarks.some((b) => b.url === url)
}

export async function addBookmark(bookmark: Bookmark): Promise<void> {
  const bookmarks = await getBookmarks()
  if (bookmarks.some((b) => b.url === bookmark.url)) return
  bookmarks.unshift(bookmark)
  await safeSet({ [BOOKMARKS_KEY]: bookmarks })
}

export async function removeBookmark(url: string): Promise<void> {
  const bookmarks = await getBookmarks()
  const filtered = bookmarks.filter((b) => b.url !== url)
  await safeSet({ [BOOKMARKS_KEY]: filtered })
}

export async function updateBookmarkFolder(url: string, folderId: string | undefined): Promise<void> {
  const bookmarks = await getBookmarks()
  const bm = bookmarks.find((b) => b.url === url)
  if (!bm) return
  if (folderId) bm.folderId = folderId
  else delete bm.folderId
  await safeSet({ [BOOKMARKS_KEY]: bookmarks })
}

// Bookmark folders
const BOOKMARK_FOLDERS_KEY = "bookmark_folders"

export async function getBookmarkFolders(): Promise<BookmarkFolder[]> {
  const result = await safeGet(BOOKMARK_FOLDERS_KEY)
  return result[BOOKMARK_FOLDERS_KEY] ?? []
}

export async function saveBookmarkFolder(folder: BookmarkFolder): Promise<void> {
  const folders = await getBookmarkFolders()
  const index = folders.findIndex((f) => f.id === folder.id)
  if (index >= 0) folders[index] = folder
  else folders.push(folder)
  await safeSet({ [BOOKMARK_FOLDERS_KEY]: folders })
}

export async function deleteBookmarkFolder(id: string): Promise<void> {
  const folders = await getBookmarkFolders()
  const filtered = folders.filter((f) => f.id !== id)
  // Also remove folderId from bookmarks and child folders
  const bookmarks = await getBookmarks()
  bookmarks.forEach((b) => { if (b.folderId === id) delete b.folderId })
  filtered.forEach((f) => { if (f.parentId === id) delete f.parentId })
  await safeSet({ [BOOKMARK_FOLDERS_KEY]: filtered, [BOOKMARKS_KEY]: bookmarks })
}

export async function getAllAnnotations(): Promise<AnnotationEntry[]> {
  const all = await safeGet(null as any)
  const entries: AnnotationEntry[] = []
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(ANNOTATION_KEY_PREFIX) && Array.isArray(value)) {
      const url = key.slice(ANNOTATION_KEY_PREFIX.length)
      entries.push({ url, annotations: value as Annotation[] })
    }
  }
  // Sort by most recent annotation
  entries.sort((a, b) => {
    const aTime = a.annotations[a.annotations.length - 1]?.createdAt || ""
    const bTime = b.annotations[b.annotations.length - 1]?.createdAt || ""
    return bTime.localeCompare(aTime)
  })
  return entries
}

// ========================
// Advanced Search
// ========================

export interface SearchFilters {
  text: string
  tags: string[]
  types: AnnotationType[]
  markStyles: MarkStyle[]
  status: ("open" | "resolved")[]
  site: string[]
}

export function parseSearchQuery(query: string): SearchFilters {
  const filters: SearchFilters = {
    text: "",
    tags: [],
    types: [],
    markStyles: [],
    status: [],
    site: []
  }

  const parts = query.trim().split(/\s+/)
  const textParts: string[] = []

  for (const part of parts) {
    const colonIdx = part.indexOf(":")
    if (colonIdx > 0) {
      const key = part.slice(0, colonIdx).toLowerCase()
      const value = part.slice(colonIdx + 1).toLowerCase()
      switch (key) {
        case "tag":
        case "标签":
          filters.tags.push(value)
          break
        case "type":
          if (value === "comment" || value === "edit") filters.types.push(value as AnnotationType)
          break
        case "style":
          if (["highlight", "underline", "strikethrough", "squiggly"].includes(value)) {
            filters.markStyles.push(value as MarkStyle)
          }
          break
        case "status":
          if (value === "resolved" || value === "open") filters.status.push(value as "open" | "resolved")
          break
        case "site":
          filters.site.push(value)
          break
        default:
          textParts.push(part)
      }
    } else {
      textParts.push(part)
    }
  }

  filters.text = textParts.join(" ").toLowerCase()
  return filters
}

function searchRepliesRecursive(replies: Reply[], q: string): boolean {
  return replies.some((r) =>
    r.content.toLowerCase().includes(q) ||
    (r.replies ? searchRepliesRecursive(r.replies, q) : false)
  )
}

export function matchesAnnotation(
  ann: Annotation,
  pageTitle: string | undefined,
  filters: SearchFilters
): boolean {
  if (filters.text) {
    const q = filters.text
    const textMatch =
      ann.data.content.toLowerCase().includes(q) ||
      (pageTitle?.toLowerCase().includes(q) ?? false) ||
      (ann.quote?.toLowerCase().includes(q) ?? false) ||
      (ann.replies ? searchRepliesRecursive(ann.replies, q) : false)
    if (!textMatch) return false
  }

  if (filters.types.length > 0 && !filters.types.includes(ann.data.type)) return false
  if (filters.markStyles.length > 0 && !filters.markStyles.includes(ann.data.markStyle || "highlight")) return false
  if (filters.status.length > 0 && !filters.status.includes(ann.status || "open")) return false

  return true
}

export function searchAnnotations(
  entries: AnnotationEntry[],
  query: string,
  bookmarks?: Bookmark[]
): AnnotationEntry[] {
  const filters = parseSearchQuery(query)

  if (!filters.text && filters.tags.length === 0 && filters.types.length === 0 &&
      filters.markStyles.length === 0 && filters.status.length === 0 && filters.site.length === 0) {
    return entries
  }

  const urlTags = new Map<string, string[]>()
  if (bookmarks) {
    for (const bm of bookmarks) {
      if (bm.tags) urlTags.set(bm.url, bm.tags.map((t) => t.toLowerCase()))
    }
  }

  return entries
    .map((entry) => {
      if (filters.site.length > 0) {
        const url = entry.url.toLowerCase()
        if (!filters.site.some((s) => url.includes(s))) return null
      }

      if (filters.tags.length > 0) {
        const tags = urlTags.get(entry.url) || []
        if (!filters.tags.some((t) => tags.includes(t))) return null
      }

      const filtered = entry.annotations.filter((ann) =>
        matchesAnnotation(ann, ann.title, filters)
      )
      return filtered.length > 0 ? { ...entry, annotations: filtered } : null
    })
    .filter(Boolean) as AnnotationEntry[]
}

// ========================
// Markdown Export / Import
// ========================

function toBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
}

function fromBase64(str: string): string {
  return decodeURIComponent(escape(atob(str)))
}

function formatExportDate(dateStr: string): string {
  const d = new Date(dateStr)
  try {
    return d.toLocaleString("zh-CN", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    })
  } catch {
    return dateStr
  }
}

function getStyleEmoji(style?: string): string {
  switch (style) {
    case "highlight": return "🟡"
    case "underline": return "🔵"
    case "strikethrough": return "🔴"
    case "squiggly": return "〰️"
    default: return "🟡"
  }
}

function getStyleLabel(style?: string): string {
  const map: Record<string, string> = {
    highlight: "高亮",
    underline: "下划线",
    strikethrough: "删除线",
    squiggly: "波浪线"
  }
  return map[style || "highlight"] || (style || "Highlight")
}

function renderRepliesMd(replies: Reply[], depth = 0): string[] {
  const lines: string[] = []
  const indent = "  ".repeat(depth)
  for (const r of replies) {
    const author = r.author?.name || "Anonymous"
    const date = formatExportDate(r.createdAt)
    lines.push(`${indent}- **${author}** (${date}): ${r.content}`)
    if (r.replies?.length) {
      lines.push(...renderRepliesMd(r.replies, depth + 1))
    }
  }
  return lines
}

function annotationsToMarkdown(
  entries: AnnotationEntry[],
  bookmarks: Bookmark[],
  title: string
): string {
  const lines: string[] = []
  lines.push(`# ${title}`)
  lines.push("")
  lines.push(`> ${new Date().toLocaleString("zh-CN")}`)
  lines.push("")
  lines.push("---")
  lines.push("")

  for (const entry of entries) {
    const bm = bookmarks.find((b) => b.url === entry.url)
    const pageTitle = bm?.title || entry.url

    lines.push(`## Page: ${pageTitle}`)
    lines.push(`- **URL:** ${entry.url}`)
    if (bm?.tags?.length) {
      lines.push(`- **Tags:** ${bm.tags.join(", ")}`)
    }
    lines.push("")

    for (const ann of entry.annotations) {
      const emoji = getStyleEmoji(ann.data.markStyle)
      const styleName = getStyleLabel(ann.data.markStyle)
      const resolved = ann.status === "resolved" ? " · [已解决]" : ""
      const date = formatExportDate(ann.createdAt)

      lines.push(`### ${emoji} ${styleName} · ${date}${resolved}`)
      lines.push("")
      if (ann.quote) {
        const quoted = ann.quote.split("\n").join("\n> ")
        lines.push(`> ${quoted}`)
        lines.push("")
      }
      if (ann.data.content) {
        lines.push(ann.data.content)
        lines.push("")
      }
      if (ann.replies?.length) {
        lines.push("**Replies:**")
        lines.push("")
        lines.push(...renderRepliesMd(ann.replies))
        lines.push("")
      }
      lines.push("---")
      lines.push("")
    }
  }

  return lines.join("\n")
}

/**
 * Parse markdown export file and extract the embedded JSON data.
 * Falls back to plain JSON parsing for backward compatibility.
 */
export function parseMarkdownData(markdown: string): Record<string, any> | null {
  // 1. Try HTML comment with base64 data
  const match = markdown.match(/<!--\s*OmniNotation-Data:\s*([A-Za-z0-9+/=]+)\s*-->/)
  if (match) {
    try {
      const jsonStr = fromBase64(match[1])
      return JSON.parse(jsonStr)
    } catch {
      // fall through
    }
  }
  // 2. Try plain JSON (backward compat)
  try {
    const trimmed = markdown.trim()
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return JSON.parse(trimmed)
    }
  } catch {
    // fall through
  }
  return null
}

// Export / Import all data
export async function exportAllData(): Promise<Record<string, any>> {
  return safeGet(null as any)
}

export async function exportAllDataAsMarkdown(): Promise<string> {
  const data = await exportAllData()
  const entries = await getAllAnnotations()
  const bookmarks: Bookmark[] = data[BOOKMARKS_KEY] || []
  const md = annotationsToMarkdown(entries, bookmarks, "OmniNotation Annotations")
  const jsonStr = JSON.stringify(data)
  const base64 = toBase64(jsonStr)
  return `${md}\n<!-- OmniNotation-Data: ${base64} -->\n`
}

export async function importAllData(data: Record<string, any>): Promise<void> {
  await safeSet(data)
}

// Export / Import annotations for a single page
export async function exportPageAnnotations(url: string): Promise<Record<string, any>> {
  const key = getKey(url)
  const orderKey = getOrderKey(url)
  const result = await safeGet([key, orderKey])
  const data: Record<string, any> = {}
  if (result[key]) data[key] = result[key]
  if (result[orderKey]) data[orderKey] = result[orderKey]
  return data
}

export async function exportPageAnnotationsAsMarkdown(url: string): Promise<string> {
  const data = await exportPageAnnotations(url)
  const annotations: Annotation[] = data[getKey(url)] || []
  const allData = await safeGet(null as any)
  const bookmarks: Bookmark[] = allData[BOOKMARKS_KEY] || []
  const bm = bookmarks.find((b) => b.url === url)
  const pageTitle = bm?.title || url
  const md = annotationsToMarkdown(
    [{ url, annotations }],
    bookmarks,
    `OmniNotation: ${pageTitle}`
  )
  const jsonStr = JSON.stringify(data)
  const base64 = toBase64(jsonStr)
  return `${md}\n<!-- OmniNotation-Data: ${base64} -->\n`
}

export async function importPageAnnotations(url: string, data: Record<string, any>): Promise<boolean> {
  // Try to find annotations by scanning keys or by URL matching
  const key = getKey(url)
  if (data[key]) {
    await safeSet({ [key]: data[key] })
    const orderKey = getOrderKey(url)
    if (data[orderKey]) await safeSet({ [orderKey]: data[orderKey] })
    return true
  }
  // If no exact key match, try to find any annotations:* key and import to this URL
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith(ANNOTATION_KEY_PREFIX) && Array.isArray(v)) {
      await safeSet({ [key]: v })
      return true
    }
  }
  return false
}

// ========================
// Toolbar config
// ========================

const TOOLBAR_CONFIG_KEY = "toolbar_config"

const DEFAULT_ENGINES: ToolbarSearchEngine[] = defaultEnginesJson.map((e) => ({
  id: e.id,
  name: e.name,
  urlTemplate: e.urlTemplate,
  method: "GET" as const,
  favicon: e.favicon,
  enabled: true
}))

const DEFAULT_STYLE: ToolbarStyle = {
  backgroundColor: "#ffffff",
  textColor: "#374151",
  borderRadius: 8,
  padding: 4,
  buttonSize: 28,
  gap: 2,
  shadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"
}

export function getDefaultToolbarConfig(): ToolbarConfig {
  return {
    enabled: true,
    triggerMode: "select",
    engines: DEFAULT_ENGINES,
    layout: "horizontal",
    showAnnotations: true,
    showFaviconOnly: true,
    tabOpenMode: "new-tab",
    autoClose: true,
    autoCloseDelay: 3000,
    style: DEFAULT_STYLE,
    blacklist: [],
    whitelist: []
  }
}

function mergeEngines(saved: ToolbarSearchEngine[], defaults: ToolbarSearchEngine[]): ToolbarSearchEngine[] {
  const savedIds = new Set(saved.map((e) => e.id))
  const merged = [...saved]
  for (const engine of defaults) {
    if (!savedIds.has(engine.id)) {
      merged.push(engine)
    }
  }
  return merged
}

export async function getToolbarConfig(): Promise<ToolbarConfig> {
  const result = await safeGet(TOOLBAR_CONFIG_KEY)
  const saved = result[TOOLBAR_CONFIG_KEY] as ToolbarConfig | undefined
  if (!saved) return getDefaultToolbarConfig()
  // Merge with defaults to ensure new fields exist
  const defaults = getDefaultToolbarConfig()
  return {
    ...defaults,
    ...saved,
    style: { ...defaults.style, ...(saved.style || {}) },
    engines: saved.engines?.length ? mergeEngines(saved.engines, defaults.engines) : defaults.engines
  }
}

export async function saveToolbarConfig(config: ToolbarConfig): Promise<void> {
  await safeSet({ [TOOLBAR_CONFIG_KEY]: config })
}

// ========================
// Engine icon cache
// ========================

const ENGINE_ICONS_KEY = "engine_icons_cache"

export async function getEngineIconCache(engineId: string): Promise<string | null> {
  const result = await safeGet(ENGINE_ICONS_KEY)
  const cache = result[ENGINE_ICONS_KEY] as Record<string, string> | undefined
  return cache?.[engineId] ?? null
}

export async function setEngineIconCache(engineId: string, base64: string): Promise<void> {
  const result = await safeGet(ENGINE_ICONS_KEY)
  const cache = (result[ENGINE_ICONS_KEY] as Record<string, string> | undefined) ?? {}
  cache[engineId] = base64
  await safeSet({ [ENGINE_ICONS_KEY]: cache })
}

export async function removeEngineIconCache(engineId: string): Promise<void> {
  const result = await safeGet(ENGINE_ICONS_KEY)
  const cache = (result[ENGINE_ICONS_KEY] as Record<string, string> | undefined) ?? {}
  delete cache[engineId]
  await safeSet({ [ENGINE_ICONS_KEY]: cache })
}

export async function getAllEngineIconCaches(): Promise<Record<string, string>> {
  const result = await safeGet(ENGINE_ICONS_KEY)
  return (result[ENGINE_ICONS_KEY] as Record<string, string> | undefined) ?? {}
}

export async function prefetchEngineIcon(engine: ToolbarSearchEngine): Promise<boolean> {
  const cached = await getEngineIconCache(engine.id)
  if (cached) return true

  const sources: string[] = []

  if (engine.favicon?.startsWith("http") || engine.favicon?.startsWith("data:")) {
    sources.push(engine.favicon)
  }

  try {
    sources.push(getLocalIconUrl(engine.id))
  } catch {}

  try {
    const domain = new URL(engine.urlTemplate.replace("{q}", "")).hostname
    sources.push(`https://${domain}/favicon.ico`)
  } catch {}

  for (const url of sources) {
    try {
      const response = await fetch(url)
      if (!response.ok) continue
      const blob = await response.blob()
      if (!blob.type.startsWith("image/")) continue
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      await setEngineIconCache(engine.id, base64)
      return true
    } catch {}
  }

  return false
}
