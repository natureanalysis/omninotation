import { useCallback, useEffect, useMemo, useState } from "react"
import "katex/dist/katex.min.css"
import "./style.css"

import { detectLocale, initLocale, setLocale, t, type Locale } from "@/services/i18n"
import * as storage from "@/services/storage"
import type { Annotation, AnnotationEntry, Bookmark, BookmarkFolder } from "@/types"
import type { PageCategory } from "@/types/category"
import { CategoryIconSwatch } from "@/components/CategoryIconSwatch"
import { MarkdownContent } from "@/components/MarkdownContent"
import { ASSIGN_NONE, assignCategory, getAssignments, getCategories, pageKey } from "@/services/categories"

// ===== Helpers =====

function decodeUrl(url: string): string {
  try { return decodeURIComponent(url) } catch { return url }
}

function countTotalAnnotations(entries: AnnotationEntry[]): number {
  return entries.reduce((sum, e) => sum + e.annotations.length, 0)
}

function countReplies(ann: Annotation): number {
  if (!ann.replies) return 0
  const count = (replies: typeof ann.replies): number =>
    replies.reduce((s, r) => s + 1 + (r.replies ? count(r.replies) : 0), 0)
  return count(ann.replies)
}

function buildTree(folders: BookmarkFolder[], parentId?: string): BookmarkFolder[] {
  return folders
    .filter((f) => (parentId ? f.parentId === parentId : !f.parentId))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function getDescendantFolderIds(folders: BookmarkFolder[], parentId: string): string[] {
  const result: string[] = [parentId]
  const children = folders.filter((f) => f.parentId === parentId)
  for (const child of children) {
    result.push(...getDescendantFolderIds(folders, child.id))
  }
  return result
}

function getFolderPath(folderId: string | undefined, folders: BookmarkFolder[], L: ReturnType<typeof t>): string {
  if (!folderId) return L.allBookmarksFolder
  const folder = folders.find((f) => f.id === folderId)
  if (!folder) return L.allBookmarksFolder
  if (folder.parentId) {
    return getFolderPath(folder.parentId, folders, L) + " / " + folder.name
  }
  return folder.name
}

// ===== Components =====

function FolderTreeItem({
  folder,
  folders,
  selectedId,
  expandedIds,
  onSelect,
  onToggleExpand,
  onDelete,
  level = 0
}: {
  folder: BookmarkFolder
  folders: BookmarkFolder[]
  selectedId: string | undefined
  expandedIds: Set<string>
  onSelect: (id: string | undefined) => void
  onToggleExpand: (id: string) => void
  onDelete: (id: string) => void
  level?: number
}) {
  const children = buildTree(folders, folder.id)
  const isExpanded = expandedIds.has(folder.id)
  const isSelected = selectedId === folder.id

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer text-sm ${
          isSelected ? "bg-blue-100 text-blue-800" : "hover:bg-gray-100 text-gray-700"
        }`}
        style={{ paddingLeft: `${8 + level * 16}px` }}
        onClick={() => onSelect(folder.id)}>
        {children.length > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand(folder.id) }}
            className="text-xs text-gray-400 hover:text-gray-600 w-4">
            {isExpanded ? "▼" : "▶"}
          </button>
        )}
        {children.length === 0 && <span className="w-4" />}
        <span className="truncate">📁 {folder.name}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(folder.id) }}
          className="ml-auto text-[10px] text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
          style={{ opacity: isSelected ? undefined : 0 }}>
          ×
        </button>
      </div>
      {isExpanded && children.map((child) => (
        <FolderTreeItem
          key={child.id}
          folder={child}
          folders={folders}
          selectedId={selectedId}
          expandedIds={expandedIds}
          onSelect={onSelect}
          onToggleExpand={onToggleExpand}
          onDelete={onDelete}
          level={level + 1}
        />
      ))}
    </div>
  )
}

export default function OptionsPage() {
  // Stateful locale: initialized from the persisted preference and kept in
  // sync via storage changes, so the dashboard follows language switches
  // made in the side panel (and vice versa via the header toggle below).
  const [locale, setLocaleState] = useState<Locale>(detectLocale)
  const L = t(locale)
  useEffect(() => {
    initLocale().then(setLocaleState).catch(() => {})
    const onLocaleChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local" || !changes["locale_pref"]) return
      const next = changes["locale_pref"].newValue
      if (next === "zh-CN" || next === "en") {
        // Refresh the shared cache too, so data loaders that resolve the locale
        // internally localize built-in category names to the new language.
        initLocale().then((l) => setLocaleState(l)).catch(() => setLocaleState(next))
      }
    }
    chrome.storage.onChanged.addListener(onLocaleChange)
    return () => chrome.storage.onChanged.removeListener(onLocaleChange)
  }, [])
  const [entries, setEntries] = useState<AnnotationEntry[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [folders, setFolders] = useState<BookmarkFolder[]>([])
  const [categories, setCategories] = useState<PageCategory[]>([])
  const [categoryAssignments, setCategoryAssignments] = useState<Record<string, string>>({})
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>(undefined)
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState("")
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Expanded URL cards
  const [expandedUrls, setExpandedUrls] = useState<Set<string>>(new Set())

  // Folder editing
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [newFolderParent, setNewFolderParent] = useState<string | undefined>(undefined)

  const load = useCallback(async () => {
    setLoading(true)
    const [all, bms, fdrs, cats, assignments] = await Promise.all([
      storage.getAllAnnotations(),
      storage.getBookmarks(),
      storage.getBookmarkFolders(),
      getCategories(locale),
      getAssignments()
    ])
    setEntries(all)
    setBookmarks(bms)
    setFolders(fdrs)
    setCategories(cats)
    setCategoryAssignments(assignments)
    setLoading(false)
  }, [locale])

  useEffect(() => {
    load()
  }, [load])

  // Keep the dashboard in sync when bookmarks, folders, categories, or
  // category assignments are changed from the side panel or another page.
  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local") return
      const annotationsTouched = Object.keys(changes).some((key) => key.startsWith("annotations:"))
      if (
        changes.bookmarks ||
        changes.bookmark_folders ||
        changes.page_categories ||
        changes.page_category_assignments ||
        annotationsTouched
      ) {
        void load()
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [load])

  const highlightTerms = useMemo(() => {
    const filters = storage.parseSearchQuery(query)
    return filters.text ? filters.text.split(/\s+/).filter(Boolean) : []
  }, [query])

  const effectiveCategoryByUrl = useMemo(() => {
    const annotationsByUrl = new Map(entries.map((entry) => [pageKey(entry.url), entry]))
    const byUrl = new Map<string, PageCategory | null>()

    for (const bookmark of bookmarks) {
      const key = pageKey(bookmark.url)
      const assigned = categoryAssignments[key]
      if (assigned === ASSIGN_NONE) {
        byUrl.set(key, null)
        continue
      }
      if (assigned) {
        const manual = categories.find((category) => category.id === assigned)
        if (manual) {
          byUrl.set(key, manual)
          continue
        }
      }

      const annotations = annotationsByUrl.get(key)?.annotations || []
      const hasContent = annotations.some((annotation) => annotation.data.content?.trim())
      const automatic = categories.find((category) => {
        if (category.autoRule === "has-annotations") return annotations.length > 0
        if (category.autoRule === "has-comments") return hasContent
        return false
      })
      byUrl.set(key, automatic || null)
    }
    return byUrl
  }, [bookmarks, categories, categoryAssignments, entries])

  const filteredEntries = useMemo(() => {
    let result = storage.searchAnnotations(entries, query, bookmarks)
    // Filter by selected folder
    if (selectedFolderId) {
      const folderIds = getDescendantFolderIds(folders, selectedFolderId)
      const allowedUrls = new Set(
        bookmarks
          .filter((b) => folderIds.includes(b.folderId || ""))
          .map((b) => b.url)
      )
      result = result.filter((e) => allowedUrls.has(e.url))
    } else {
      // "All bookmarks" - only show bookmarked URLs
      const bookmarkedUrls = new Set(bookmarks.map((b) => b.url))
      result = result.filter((e) => bookmarkedUrls.has(e.url))
    }
    // Tag filter
    if (selectedTag) {
      const taggedUrls = new Set(
        bookmarks.filter((b) => b.tags?.includes(selectedTag)).map((b) => b.url)
      )
      result = result.filter((e) => taggedUrls.has(e.url))
    }
    if (selectedCategoryId) {
      result = result.filter((entry) => {
        const category = effectiveCategoryByUrl.get(pageKey(entry.url))
        return selectedCategoryId === ASSIGN_NONE
          ? !category
          : category?.id === selectedCategoryId
      })
    }
    return result
  }, [entries, bookmarks, folders, query, selectedFolderId, selectedTag, selectedCategoryId, effectiveCategoryByUrl])

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    for (const bm of bookmarks) {
      bm.tags?.forEach((t) => tags.add(t))
    }
    return Array.from(tags).sort()
  }, [bookmarks])

  const handleCategoryChange = async (url: string, value: string) => {
    const key = pageKey(url)
    if (!key) return
    // Let the shared category service persist the change, then update the
    // local snapshot from storage so the result also matches other writers.
    await assignCategory(url, value || null)
    setCategoryAssignments(await getAssignments())
  }

  const toggleUrl = (url: string) => {
    setExpandedUrls((prev) => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }

  const handleDeleteAnnotation = async (url: string, id: string) => {
    await storage.deleteAnnotation(url, id)
    setEntries((prev) =>
      prev
        .map((e) =>
          e.url === url
            ? { ...e, annotations: e.annotations.filter((a) => a.id !== id) }
            : e
        )
        .filter((e) => e.annotations.length > 0)
    )
  }

  const openUrl = (url: string) => {
    chrome.tabs.create({ url, active: true }).catch(() => {
      window.open(url, "_blank")
    })
  }

  const openAndScroll = async (url: string, annotationId: string) => {
    const tab = await chrome.tabs.create({ url, active: true })
    if (tab?.id) {
      const targetTabId = tab.id
      const listener = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
        if (tabId === targetTabId && changeInfo.status === "complete") {
          chrome.tabs.sendMessage(targetTabId, {
            type: "SCROLL_TO_HIGHLIGHT",
            annotationId
          }).catch(() => {})
          chrome.tabs.onUpdated.removeListener(listener)
        }
      }
      chrome.tabs.onUpdated.addListener(listener)
      setTimeout(() => chrome.tabs.onUpdated.removeListener(listener), 10000)
    }
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    const folder: BookmarkFolder = {
      id: crypto.randomUUID(),
      name: newFolderName.trim(),
      parentId: newFolderParent,
      createdAt: new Date().toISOString()
    }
    await storage.saveBookmarkFolder(folder)
    setFolders((prev) => [...prev, folder])
    setNewFolderName("")
    setShowNewFolder(false)
    setNewFolderParent(undefined)
  }

  const handleDeleteFolder = async (id: string) => {
    if (!confirm(L.deleteFolderConfirm)) return
    await storage.deleteBookmarkFolder(id)
    setFolders((prev) => prev.filter((f) => f.id !== id))
    const bms = await storage.getBookmarks()
    setBookmarks(bms)
    if (selectedFolderId === id) setSelectedFolderId(undefined)
  }

  const handleMoveToFolder = async (url: string, folderId: string | undefined) => {
    await storage.updateBookmarkFolder(url, folderId)
    setBookmarks((prev) =>
      prev.map((b) =>
        b.url === url
          ? { ...b, folderId: folderId || undefined }
          : b
      )
    )
  }

  const rootFolders = buildTree(folders)

  return (
    <div className="extension-ui min-h-screen bg-slate-50" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500 shadow-sm shadow-blue-200" />
                <h1 className="text-xl font-bold tracking-tight text-slate-800">{L.bookmarksTitle}</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Language toggle (same segmented control as the side panel footer) */}
              <div className="inline-flex rounded-md border border-gray-200 overflow-hidden" title={L.languageLabel}>
                <button
                  onClick={async () => {
                    if (locale === "zh-CN") return
                    await setLocale("zh-CN")
                    setLocaleState("zh-CN")
                  }}
                  className={`text-xs px-2 py-1 transition-colors ${
                    locale === "zh-CN"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-500 hover:bg-gray-50"
                  }`}>
                  中文
                </button>
                <button
                  onClick={async () => {
                    if (locale === "en") return
                    await setLocale("en")
                    setLocaleState("en")
                  }}
                  className={`text-xs px-2 py-1 border-l border-gray-200 transition-colors ${
                    locale === "en"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-500 hover:bg-gray-50"
                  }`}>
                  EN
                </button>
              </div>
              <button
                onClick={load}
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline">
                {L.refresh}
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-2 text-xs text-slate-500 mb-4">
            {[L.totalBookmarks(bookmarks.length), L.totalAnnotations(countTotalAnnotations(entries)), L.folderCount(folders.length)].map((stat, index) => (
              <div key={stat} className={`flex-1 min-w-[120px] rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 ${index === 0 ? "text-blue-700" : index === 1 ? "text-violet-700" : "text-slate-600"}`}>
                {stat}
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={L.searchPlaceholder}
              className="flex-1 text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Category filter */}
          {categories.length > 0 && (
            <div className="flex items-center flex-wrap gap-1.5 mt-2">
              <span className="text-[11px] text-gray-400">{L.categoryFilter}</span>
              <button
                onClick={() => setSelectedCategoryId(null)}
                className={`text-[11px] px-2 py-0.5 rounded-full border ${
                  selectedCategoryId === null
                    ? "bg-blue-100 border-blue-300 text-blue-700"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}>
                {L.filterAll}
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategoryId(category.id === selectedCategoryId ? null : category.id)}
                  className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${
                    selectedCategoryId === category.id
                      ? "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} />
                  {category.name || L.catUntitled}
                </button>
              ))}
              <button
                onClick={() => setSelectedCategoryId(ASSIGN_NONE)}
                className={`text-[11px] px-2 py-0.5 rounded-full border ${
                  selectedCategoryId === ASSIGN_NONE
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}>
                {L.uncategorized}
              </button>
            </div>
          )}

          {/* Tag filter */}
          {allTags.length > 0 && (
            <div className="flex items-center flex-wrap gap-1.5 mt-2">
              <span className="text-[11px] text-gray-400">{L.tagLabel}</span>
              <button
                onClick={() => setSelectedTag(null)}
                className={`text-[11px] px-2 py-0.5 rounded-full border ${
                  selectedTag === null
                    ? "bg-blue-100 border-blue-300 text-blue-700"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}>
                {L.filterAll}
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                  className={`text-[11px] px-2 py-0.5 rounded-full border ${
                    selectedTag === tag
                      ? "bg-amber-100 border-amber-300 text-amber-700"
                      : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}>
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main layout */}
      <div className="max-w-6xl mx-auto px-6 py-4 flex gap-4">
        {/* Sidebar - Folder tree */}
        <div className="w-64 shrink-0">
          <div className="bg-white rounded-lg border border-gray-200 p-2">
            <div className="flex items-center justify-between mb-2 px-2">
              <span className="text-xs font-medium text-gray-500">{L.allBookmarksFolder.replace("📂 ", "").replace("📁 ", "")}</span>
              <button
                onClick={() => setShowNewFolder(true)}
                className="text-[11px] text-blue-600 hover:text-blue-800 hover:underline">
                {L.newFolder}
              </button>
            </div>

            {/* Root "All bookmarks" */}
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer text-sm ${
                selectedFolderId === undefined
                  ? "bg-blue-100 text-blue-800"
                  : "hover:bg-gray-100 text-gray-700"
              }`}
              onClick={() => setSelectedFolderId(undefined)}>
              <span className="w-4" />
              <span>{L.allBookmarksFolder}</span>
            </div>

            {/* Folder tree */}
            {rootFolders.map((folder) => (
              <FolderTreeItem
                key={folder.id}
                folder={folder}
                folders={folders}
                selectedId={selectedFolderId}
                expandedIds={expandedFolderIds}
                onSelect={setSelectedFolderId}
                onToggleExpand={(id) =>
                  setExpandedFolderIds((prev) => {
                    const next = new Set(prev)
                    if (next.has(id)) next.delete(id)
                    else next.add(id)
                    return next
                  })
                }
                onDelete={handleDeleteFolder}
              />
            ))}

            {/* New folder form */}
            {showNewFolder && (
              <div className="mt-2 px-2 space-y-1">
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder={L.folderNamePlaceholder}
                  autoFocus
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <select
                  value={newFolderParent || ""}
                  onChange={(e) => setNewFolderParent(e.target.value || undefined)}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white">
                  <option value="">{L.rootDirectory}</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
                <div className="flex gap-1 justify-end">
                  <button
                    onClick={() => { setShowNewFolder(false); setNewFolderName("") }}
                    className="text-[10px] text-gray-500 hover:text-gray-700 px-2 py-0.5">
                    {L.cancel}
                  </button>
                  <button
                    onClick={handleCreateFolder}
                    disabled={!newFolderName.trim()}
                    className="text-[10px] bg-blue-600 text-white rounded px-2 py-0.5 disabled:opacity-50">
                    {L.create}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Breadcrumb */}
          <div className="text-xs text-gray-500 mb-2">
            {getFolderPath(selectedFolderId, folders, L)}
            {selectedTag && (
              <span className="ml-2 text-amber-600">{L.tagLabel} {selectedTag}</span>
            )}
            {selectedCategoryId && (
              <span className="ml-2 text-blue-600">
                {L.categoryFilter.replace(/[：:]\s*$/, "")} {selectedCategoryId === ASSIGN_NONE
                  ? L.uncategorized
                  : categories.find((category) => category.id === selectedCategoryId)?.name || L.catUntitled}
              </span>
            )}
          </div>

          {loading && (
            <div className="text-center text-gray-400 py-12">{L.loading}</div>
          )}

          {!loading && filteredEntries.length === 0 && (
            <div className="text-center text-gray-400 py-12">
              {bookmarks.length === 0 ? L.noBookmarks : L.noMatchResults}
            </div>
          )}

          {!loading && filteredEntries.map((entry) => {
            const bm = bookmarks.find((b) => b.url === entry.url)
            const categoryKey = pageKey(entry.url)
            const category = effectiveCategoryByUrl.get(categoryKey) || null
            const assignedId = categoryAssignments[categoryKey]
            const hasValidAssignment = assignedId === ASSIGN_NONE || categories.some((item) => item.id === assignedId)
            const categoryValue = hasValidAssignment ? assignedId || "" : ""
            const isExpanded = expandedUrls.has(entry.url)
            return (
              <div key={entry.url} className="mb-3 bg-white rounded-lg border border-gray-200 overflow-hidden">
                {/* URL header */}
                <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                  <button
                    onClick={() => toggleUrl(entry.url)}
                    className="min-w-0 flex-1 text-left">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {bm?.title || entry.annotations[0]?.title || decodeUrl(entry.url).replace(/^https?:\/\//, "")}
                    </p>
                    <p className="text-[11px] text-gray-400 truncate">{decodeUrl(entry.url)}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      {category ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ color: category.color, backgroundColor: `${category.color}14` }}>
                          <CategoryIconSwatch color={category.color} glyph={category.icon} size={12} />
                          {category.name || L.catUntitled}
                          <span className="opacity-70">
                            {categoryAssignments[pageKey(entry.url)] ? L.categoryManual : L.catAuto}
                          </span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400">{L.uncategorized}</span>
                      )}
                    </div>
                  </button>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    {bm?.tags && bm.tags.length > 0 && (
                      <div className="flex gap-1">
                        {bm.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            {tag}
                          </span>
                        ))}
                        {bm.tags.length > 3 && (
                          <span className="text-[10px] text-gray-400">+{bm.tags.length - 3}</span>
                        )}
                      </div>
                    )}

                    {/* Page category */}
                    <select
                      value={categoryValue}
                      onChange={(e) => handleCategoryChange(entry.url, e.target.value)}
                      className="max-w-[8rem] text-[10px] border rounded px-1 py-0.5 bg-white"
                      style={category ? { color: category.color, borderColor: `${category.color}55` } : undefined}
                      title={L.pageCategory}>
                      <option value="">{L.catAuto}</option>
                      <option value={ASSIGN_NONE}>{L.catNone}</option>
                      {categories.map((item) => (
                        <option key={item.id} value={item.id}>{item.name || L.catUntitled}</option>
                      ))}
                    </select>

                    {/* Move to folder */}
                    <select
                      value={bm?.folderId || ""}
                      onChange={(e) => handleMoveToFolder(entry.url, e.target.value || undefined)}
                      className="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white"
                      title={L.allBookmarksFolder}>
                      <option value="">{L.rootDirectory}</option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>

                    <button
                      onClick={(e) => { e.stopPropagation(); openUrl(entry.url) }}
                      className="text-[11px] text-blue-600 hover:text-blue-800 hover:underline"
                      title={L.open}>
                      {L.open}
                    </button>
                    <span className="text-[11px] text-gray-400">
                      {L.annotationsCount(entry.annotations.length)}
                    </span>
                    <button
                      onClick={() => toggleUrl(entry.url)}
                      className="text-xs text-gray-400 hover:text-gray-600">
                      {isExpanded ? "▼" : "▶"}
                    </button>
                  </div>
                </div>

                {/* Annotations list */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                    {entry.annotations.map((ann) => (
                      <div key={ann.id} className="rounded border border-gray-100 bg-gray-50 p-3">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                              {ann.position
                                ? `📌 ${L.stickyNote}`
                                : ann.data.markStyle === "underline"
                                ? `U̲ ${L.markUnderline}`
                                : ann.data.markStyle === "strikethrough"
                                ? `S̶ ${L.markStrikethrough}`
                                : ann.data.markStyle === "squiggly"
                                ? `〰 ${L.markSquiggly}`
                                : `▌ ${L.markHighlight}`}
                            </span>

                            <span className="text-[10px] px-1 py-0.5 rounded bg-gray-100 text-gray-600">
                              👤 {ann.author.name}
                            </span>
                            {ann.status === "resolved" && (
                              <span className="text-[10px] px-1 py-0.5 rounded bg-green-100 text-green-700">
                                ✓ {L.resolved}
                              </span>
                            )}
                            <span className="text-[10px] text-gray-400">
                              {new Date(ann.createdAt).toLocaleString(locale === "zh-CN" ? "zh-CN" : "en-US")}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 ml-2 shrink-0">
                            <button
                              onClick={() => openAndScroll(entry.url, ann.id)}
                              className="text-[11px] text-blue-600 hover:text-blue-800 hover:underline">
                              {L.jump}
                            </button>
                            <button
                              onClick={() => handleDeleteAnnotation(entry.url, ann.id)}
                              className="text-[11px] text-red-400 hover:text-red-600 hover:underline">
                              {L.delete}
                            </button>
                          </div>
                        </div>

                        {ann.quote && (
                          <p className="text-xs text-gray-500 mb-2 line-clamp-2 italic">
                            "{ann.quote}"
                          </p>
                        )}

                        <MarkdownContent text={ann.data.content} highlightTerms={highlightTerms} />

                        {countReplies(ann) > 0 && (
                          <p className="text-[10px] text-gray-400 mt-1">
                            {L.replyCount(countReplies(ann))}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {!loading && filteredEntries.length > 0 && (query || selectedTag || selectedFolderId || selectedCategoryId) && (
            <div className="text-center text-[11px] text-gray-400 py-4">
              {L.foundAnnotations(countTotalAnnotations(filteredEntries))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}