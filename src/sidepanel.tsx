import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import "katex/dist/katex.min.css"
import "./style.css"

import { initLocale, setLocale, t, getLocale, type Locale } from "@/services/i18n"
import * as storage from "@/services/storage"
import type { Annotation, Reply } from "@/types"
import { AnnotationCard } from "@/components/AnnotationCard"
import { ToolbarSettings } from "@/components/ToolbarSettings"

export default function SidePanel() {
  const [locale, setLocaleState] = useState<Locale>(getLocale)
  const L = t(locale)
  const [url, setUrl] = useState("")
  const [title, setTitle] = useState("")
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [displayAnnotations, setDisplayAnnotations] = useState<Annotation[]>([])
  const [customOrder, setCustomOrder] = useState<string[] | null>(null)
  const [bookmarked, setBookmarked] = useState(false)
  const [bookmarkTime, setBookmarkTime] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newContent, setNewContent] = useState("")
  const [highlightColor, setHighlightColor] = useState("rgba(250, 204, 21, 0.3)")
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [pendingEditIds, setPendingEditIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState("")
  const [bookmarkTags, setBookmarkTags] = useState<string[]>([])
  const [pageCategories, setPageCategories] = useState<ReturnType<typeof storage.getDefaultPageCategories>>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [suggestedCategoryId, setSuggestedCategoryId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"annotations" | "categories">("annotations")
  const [showTagInput, setShowTagInput] = useState(false)
  const [tagInput, setTagInput] = useState("")
  const listRef = useRef<HTMLDivElement>(null)
  const pendingEditIdsRef = useRef<Set<string>>(new Set())
  const annotationsRef = useRef<Annotation[]>([])
  const customOrderRef = useRef<string[] | null>(null)
  useEffect(() => {
    pendingEditIdsRef.current = pendingEditIds
  }, [pendingEditIds])
  useEffect(() => {
    annotationsRef.current = annotations
  }, [annotations])
  useEffect(() => {
    customOrderRef.current = customOrder
  }, [customOrder])

  const highlightTerms = useMemo(() => {
    const filters = storage.parseSearchQuery(searchQuery)
    return filters.text ? filters.text.split(/\s+/).filter(Boolean) : []
  }, [searchQuery])

  const matchesSearch = useCallback((ann: Annotation, query: string): boolean => {
    if (!query.trim()) return true
    const filters = storage.parseSearchQuery(query)
    return storage.matchesAnnotation(ann, title, filters)
  }, [title])

  const applySort = useCallback((anns: Annotation[], positions: Record<string, number>, order: string[] | null) => {
    if (order && order.length > 0) {
      const orderMap = new Map(order.map((id, i) => [id, i]))
      const sorted = [...anns].sort((a, b) => {
        const oa = orderMap.get(a.id)
        const ob = orderMap.get(b.id)
        if (oa !== undefined && ob !== undefined) return oa - ob
        if (oa !== undefined) return -1
        if (ob !== undefined) return 1
        return (positions[a.id] ?? Infinity) - (positions[b.id] ?? Infinity)
      })
      return sorted
    }
    return [...anns].sort((a, b) => (positions[a.id] ?? Infinity) - (positions[b.id] ?? Infinity))
  }, [])

  const fetchPositionsAndSort = useCallback(async (anns: Annotation[], order: string[] | null) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: "GET_ANNOTATION_POSITIONS",
          annotations: anns
        }, (response) => {
          if (chrome.runtime.lastError) {
            setDisplayAnnotations(anns)
            return
          }
          if (response?.type === "ANNOTATION_POSITIONS") {
            setDisplayAnnotations(applySort(anns, response.positions, order))
          }
        })
      } else {
        setDisplayAnnotations(anns)
      }
    } catch {
      setDisplayAnnotations(anns)
    }
  }, [applySort])

  const load = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.url) {
        setUrl(tab.url)
        setTitle(tab.title || "")
        const data = await storage.getAnnotations(tab.url)
        setAnnotations(data)
        const order = await storage.getAnnotationOrder(tab.url)
        setCustomOrder(order.length > 0 ? order : null)
        const color = await storage.getHighlightColor()
        setHighlightColor(color.bg)
        const bookmarks = await storage.getBookmarks()
        const currentBm = bookmarks.find((b) => b.url === tab.url)
        setBookmarked(!!currentBm)
        setBookmarkTime(currentBm?.createdAt || null)
        setBookmarkTags(currentBm?.tags || [])
        setSelectedCategoryId(currentBm?.categoryId ?? null)
        const categories = await storage.getPageCategories()
        setPageCategories(categories)
        const suggested = await storage.getSuggestedPageCategory(tab.url, tab.title || "")
        setSuggestedCategoryId(suggested?.id ?? null)
        if (!currentBm?.categoryId && suggested && categories.some((c) => c.id === suggested.id)) {
          setSelectedCategoryId(suggested.id)
        }
        await fetchPositionsAndSort(data, order.length > 0 ? order : null)
      }
    } catch (e) {
      console.error("[SidePanel] load error:", e)
    }
  }

  // Initialize locale from storage on mount
  useEffect(() => {
    initLocale().then((l) => setLocaleState(l))
  }, [])

  // Listen for locale changes in storage (from other contexts)
  useEffect(() => {
    const listener = (changes: any, area: string) => {
      if (area !== "local" || !changes["locale_pref"]) return
      const newLocale = changes["locale_pref"].newValue as Locale
      if (newLocale === "zh-CN" || newLocale === "en") {
        setLocaleState(newLocale)
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  useEffect(() => {
    load()

    const onActivated = () => load()
    const onUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changeInfo.status === "complete" || changeInfo.url) {
        load()
      }
    }
    chrome.tabs.onActivated.addListener(onActivated)
    chrome.tabs.onUpdated.addListener(onUpdated)

    const onStorageChanged = (changes: any, area: string) => {
      if (area !== "local") return
      const key = storage.getKey(url)
      if (url && changes[key]) {
        const newAnns = changes[key].newValue as Annotation[] | undefined
        const oldAnns = changes[key].oldValue as Annotation[] | undefined
        if (newAnns) {
          // Only update if actually different from current state (avoid overwriting optimistic updates)
          const currentIds = new Set(annotationsRef.current.map((a) => a.id))
          const newIds = new Set(newAnns.map((a) => a.id))
          const idsChanged = currentIds.size !== newIds.size || newAnns.some((a) => !currentIds.has(a.id)) || annotationsRef.current.some((a) => !newIds.has(a.id))
          if (idsChanged) {
            setAnnotations(newAnns)
            fetchPositionsAndSort(newAnns, customOrderRef.current)
          }
          // Auto-edit empty annotations from context menu — only when newly added
          if (!oldAnns || newAnns.length > oldAnns.length) {
            const emptyIds = newAnns
              .filter((a) => a.data.content === "" && !pendingEditIdsRef.current.has(a.id))
              .map((a) => a.id)
            if (emptyIds.length > 0) {
              setPendingEditIds((prev) => {
                const next = new Set(prev)
                emptyIds.forEach((id) => next.add(id))
                return next
              })
            }
          }
        }
      }
      if (changes["bookmarks"]) {
        load()
      }
      if (changes["highlight_color"]) {
        storage.getHighlightColor().then((c) => setHighlightColor(c.bg))
      }
    }
    chrome.storage.onChanged.addListener(onStorageChanged)

    const messageListener = (message: any) => {
      if (message.type === "HIGHLIGHT_CLICKED" && message.annotationId) {
        const element = document.querySelector<HTMLElement>(
          `[data-annotation-id="${message.annotationId}"]`
        )
        if (element && listRef.current) {
          element.scrollIntoView({ behavior: "smooth", block: "center" })
          element.classList.add("ring-2", "ring-blue-500", "ring-offset-1")
          setTimeout(() => {
            element.classList.remove("ring-2", "ring-blue-500", "ring-offset-1")
          }, 1500)
        }
      }
    }
    chrome.runtime?.onMessage?.addListener(messageListener)

    return () => {
      chrome.tabs.onActivated.removeListener(onActivated)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      chrome.storage.onChanged.removeListener(onStorageChanged)
      chrome.runtime?.onMessage?.removeListener(messageListener)
    }
  }, [url])

  const handleDelete = useCallback(async (id: string) => {
    // Optimistically update UI state immediately to avoid async re-render issues
    const nextAnns = annotations.filter((a) => a.id !== id)
    setAnnotations(nextAnns)
    setDisplayAnnotations(nextAnns)
    setPendingEditIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    if (customOrder) {
      const nextOrder = customOrder.filter((oid) => oid !== id)
      setCustomOrder(nextOrder.length > 0 ? nextOrder : null)
      await storage.saveAnnotationOrder(url, nextOrder)
    }
    await storage.deleteAnnotation(url, id)
  }, [url, customOrder, annotations])

  const handleReplyAdded = useCallback((annId: string, reply: Reply) => {
    const updater = (prev: Annotation[]) =>
      prev.map((a) =>
        a.id === annId ? { ...a, replies: [...(a.replies || []), reply] } : a
      )
    setAnnotations(updater)
    setDisplayAnnotations(updater)
  }, [])

  const handleReplyDeleted = useCallback((annId: string, replyId: string) => {
    const deleteRecursive = (replies: Reply[]): Reply[] => {
      const filtered = replies.filter((r) => r.id !== replyId)
      return filtered.map((r) =>
        r.replies ? { ...r, replies: deleteRecursive(r.replies) } : r
      )
    }
    const updater = (prev: Annotation[]) =>
      prev.map((a) =>
        a.id === annId && a.replies
          ? { ...a, replies: deleteRecursive(a.replies) }
          : a
      )
    setAnnotations(updater)
    setDisplayAnnotations(updater)
  }, [])

  const handleReplyEdited = useCallback((annId: string, replyId: string, content: string) => {
    const editRecursive = (replies: Reply[]): Reply[] =>
      replies.map((r) => {
        if (r.id === replyId) return { ...r, content }
        if (r.replies) return { ...r, replies: editRecursive(r.replies) }
        return r
      })
    const updater = (prev: Annotation[]) =>
      prev.map((a) =>
        a.id === annId && a.replies
          ? { ...a, replies: editRecursive(a.replies) }
          : a
      )
    setAnnotations(updater)
    setDisplayAnnotations(updater)
  }, [])

  const handleEditAnnotation = useCallback(async (annId: string, content: string) => {
    await storage.updateAnnotationContent(url, annId, content)
    const updater = (prev: Annotation[]) =>
      prev.map((a) =>
        a.id === annId ? { ...a, data: { ...a.data, content } } : a
      )
    setAnnotations(updater)
    setDisplayAnnotations(updater)
    // Remove from pending edit once saved
    setPendingEditIds((prev) => {
      const next = new Set(prev)
      next.delete(annId)
      return next
    })
  }, [url])

  const handleStatusToggle = useCallback(async (annId: string) => {
    const ann = annotations.find((a) => a.id === annId)
    if (!ann) return
    const newStatus: "open" | "resolved" = ann.status === "resolved" ? "open" : "resolved"
    await storage.updateAnnotationStatus(url, annId, newStatus)
    const updater = (prev: Annotation[]) =>
      prev.map((a) => (a.id === annId ? { ...a, status: newStatus } : a))
    setAnnotations(updater)
    setDisplayAnnotations(updater)
  }, [url, annotations])

  const handleAnnotationColorChange = useCallback(async (annId: string, color: string | undefined) => {
    await storage.updateAnnotationColor(url, annId, color)
    const updater = (prev: Annotation[]) =>
      prev.map((a) => (a.id === annId ? { ...a, data: { ...a.data, color } } : a))
    setAnnotations(updater)
    setDisplayAnnotations(updater)
  }, [url])

  const handleBookmarkTagAdd = async () => {
    const trimmed = tagInput.trim()
    if (!trimmed || !url) return
    const bookmarks = await storage.getBookmarks()
    const bm = bookmarks.find((b) => b.url === url)
    if (!bm) return
    const newTags = [...(bm.tags || [])]
    if (!newTags.includes(trimmed)) {
      newTags.push(trimmed)
      await storage.updateBookmarkTags(url, newTags)
      setBookmarkTags(newTags)
    }
    setTagInput("")
    setShowTagInput(false)
  }

  const handleBookmarkTagRemove = async (tag: string) => {
    if (!url) return
    const newTags = bookmarkTags.filter((t) => t !== tag)
    await storage.updateBookmarkTags(url, newTags)
    setBookmarkTags(newTags)
  }

  const handleCategorySelect = async (categoryId: string | null) => {
    if (!url) return
    await storage.setPageCategory(url, categoryId ?? undefined)
    setSelectedCategoryId(categoryId)
    if (categoryId) setSuggestedCategoryId(categoryId)
    if (!bookmarked) setBookmarked(true)
    const bm = (await storage.getBookmarks()).find((b) => b.url === url)
    setBookmarkTime(bm?.createdAt || null)
    const updatedCategories = await storage.getPageCategories()
    setPageCategories(updatedCategories)
  }

  const handleNestedReplyAdded = useCallback((annId: string, parentReplyId: string, reply: Reply) => {
    const updater = (prev: Annotation[]) =>
      prev.map((a) => {
        if (a.id !== annId || !a.replies) return a
        const addToParent = (replies: Reply[]): Reply[] =>
          replies.map((r) => {
            if (r.id === parentReplyId) {
              return { ...r, replies: [...(r.replies || []), reply] }
            }
            if (r.replies) {
              return { ...r, replies: addToParent(r.replies) }
            }
            return r
          })
        return { ...a, replies: addToParent(a.replies) }
      })
    setAnnotations(updater)
    setDisplayAnnotations(updater)
  }, [])

  const handleAddSticky = async () => {
    if (!url) return
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: "START_STICKY_MODE" }).catch(() => {
        alert(L.cannotCommunicate)
      })
    }
  }

  const handleAddAnnotation = async () => {
    if (!newContent.trim() || !url) return
    const annotation: Annotation = {
      id: crypto.randomUUID(),
      url,
      title: title || url,
      data: { type: "comment", content: newContent.trim() },
      author: { id: "local-user", name: "Me" },
      createdAt: new Date().toISOString()
    }
    await storage.saveAnnotation(annotation)
    setBookmarked(true)
    const next = [...annotations, annotation]
    setAnnotations(next)
    setNewContent("")
    setShowAddForm(false)
    await fetchPositionsAndSort(next, customOrder)
  }

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", id)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    if (id !== draggingId) {
      setDragOverId(id)
    }
  }

  const handleDragLeave = () => {
    setDragOverId(null)
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
    e.preventDefault()
    setDragOverId(null)
    const draggedId = e.dataTransfer.getData("text/plain")
    if (!draggedId || draggedId === targetId) return

    const fromIndex = displayAnnotations.findIndex((a) => a.id === draggedId)
    const toIndex = displayAnnotations.findIndex((a) => a.id === targetId)
    if (fromIndex === -1 || toIndex === -1) return

    const next = [...displayAnnotations]
    const [removed] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, removed)

    setDisplayAnnotations(next)
    const newOrder = next.map((a) => a.id)
    setCustomOrder(newOrder)
    await storage.saveAnnotationOrder(url, newOrder)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDragOverId(null)
  }

  const handleResetOrder = async () => {
    setCustomOrder(null)
    await storage.saveAnnotationOrder(url, [])
    await fetchPositionsAndSort(annotations, null)
  }

  const handleExport = async () => {
    const md = await storage.exportAllDataAsMarkdown()
    const blob = new Blob([md], { type: "text/markdown" })
    const urlObj = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = urlObj
    a.download = `omninotation-backup-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(urlObj)
  }

  const handleImport = async (file: File) => {
    try {
      const text = await file.text()
      const data = storage.parseMarkdownData(text)
      if (!data || typeof data !== "object") {
        alert(L.invalidImportError)
        return
      }
      if (!confirm(L.importConfirm)) return
      await storage.importAllData(data)
      alert(L.importSuccess)
      load()
    } catch (e) {
      alert(L.importFailed(e instanceof Error ? e.message : String(e)))
    }
  }

  const handleExportPage = async () => {
    if (!url) return
    const md = await storage.exportPageAnnotationsAsMarkdown(url)
    const blob = new Blob([md], { type: "text/markdown" })
    const urlObj = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = urlObj
    const safeName = title.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, "_").slice(0, 50) || "page"
    a.download = `omninotation-${safeName}-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(urlObj)
  }

  const handleImportPage = async (file: File) => {
    try {
      const text = await file.text()
      const data = storage.parseMarkdownData(text)
      if (!data || typeof data !== "object") {
        alert(L.invalidImportError)
        return
      }
      if (!confirm(L.importPageConfirm)) return
      const ok = await storage.importPageAnnotations(url, data)
      if (ok) {
        alert(L.importPageSuccess)
        load()
      } else {
        alert(L.importPageFail)
      }
    } catch (e) {
      alert(L.importFailed(e instanceof Error ? e.message : String(e)))
    }
  }

  const handleColorChange = async (color: string) => {
    const colors: Record<string, { bg: string; hover: string }> = {
      yellow: { bg: "rgba(250, 204, 21, 0.3)", hover: "rgba(250, 204, 21, 0.6)" },
      blue: { bg: "rgba(59, 130, 246, 0.3)", hover: "rgba(59, 130, 246, 0.6)" },
      green: { bg: "rgba(34, 197, 94, 0.3)", hover: "rgba(34, 197, 94, 0.6)" },
      red: { bg: "rgba(239, 68, 68, 0.3)", hover: "rgba(239, 68, 68, 0.6)" },
      purple: { bg: "rgba(168, 85, 247, 0.3)", hover: "rgba(168, 85, 247, 0.6)" },
      orange: { bg: "rgba(249, 115, 22, 0.3)", hover: "rgba(249, 115, 22, 0.6)" }
    }
    const selected = colors[color] || colors.yellow
    await storage.setHighlightColor(selected)
    setHighlightColor(selected.bg)
    const tabs = await chrome.tabs.query({})
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: "TAB_UPDATED",
          url: tab.url || ""
        }).catch(() => {})
      }
    }
  }

  return (
    <div className="flex flex-col h-screen bg-white" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 shrink-0 bg-white">
        <div className="min-w-0 flex-1 mr-2">
          <h1 className="text-sm font-semibold text-gray-800 truncate leading-tight">{title || L.untitledPage}</h1>
          <p className="text-[10px] text-gray-400 truncate leading-tight mt-0.5">
            {(() => { try { return decodeURIComponent(url).replace(/^https?:\/\//, "") } catch { return url.replace(/^https?:\/\//, "") } })() || L.unselectedPage}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => chrome.runtime.openOptionsPage()}
            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title={L.openDashboard}>
            📊
          </button>
          <button
            onClick={async () => {
              if (!url) return
              if (bookmarked) {
                await storage.removeBookmark(url)
                setBookmarked(false)
                setBookmarkTime(null)
              } else {
                const now = new Date().toISOString()
                await storage.addBookmark({
                  id: crypto.randomUUID(),
                  url,
                  title: title || url,
                  createdAt: now
                })
                setBookmarked(true)
                setBookmarkTime(now)
              }
            }}
            className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
              bookmarked ? "text-yellow-500 bg-yellow-50" : "text-gray-300 hover:text-gray-500 hover:bg-gray-50"
            }`}
            title={bookmarked ? L.unbookmark : L.bookmark}>
            {bookmarked ? "⭐" : "☆"}
          </button>
        </div>
      </div>

      <div className="px-2 py-2 border-b border-gray-100 shrink-0">
        <div className="flex rounded-lg bg-gray-100 p-1">
          {[
            { key: "annotations", label: "Annotations" },
            { key: "categories", label: "Categories" }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as "annotations" | "categories")}
              className={`flex-1 rounded-md text-[10px] font-medium px-2 py-1.5 transition-colors ${
                activeTab === tab.key ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "categories" ? (
        <div className="px-3 py-3 border-b border-gray-100 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-gray-600">Page classification</span>
            {selectedCategoryId && (
              <button onClick={() => handleCategorySelect(null)} className="text-[10px] text-gray-500 hover:text-red-500">Clear</button>
            )}
          </div>
          {suggestedCategoryId && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5 text-[10px] text-blue-700">
              Suggested: <span className="font-semibold">{pageCategories.find((c) => c.id === suggestedCategoryId)?.name || "Unspecified"}</span>
              {selectedCategoryId !== suggestedCategoryId && (
                <button
                  onClick={() => handleCategorySelect(suggestedCategoryId)}
                  className="ml-2 underline underline-offset-2 hover:text-blue-900"
                >
                  Apply
                </button>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {pageCategories.map((category) => {
              const selected = selectedCategoryId === category.id
              return (
                <button
                  key={category.id}
                  onClick={() => handleCategorySelect(selected ? null : category.id)}
                  className={`flex items-center justify-between rounded-lg border px-2 py-2 text-left transition-colors ${
                    selected ? "border-blue-200 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-base" style={{ color: category.color }}>{category.icon}</span>
                    <span className="text-[11px] font-medium text-gray-700 truncate">{category.name}</span>
                  </span>
                  <span className="w-2.5 h-2.5 rounded-full border border-white" style={{ background: category.color }} />
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <>
          {/* Page tags */}
          {(bookmarkTags.length > 0 || showTagInput) && (
            <div className="px-3 py-1.5 border-b border-gray-100 shrink-0">
              <div className="flex items-center flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                {bookmarkTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                    {tag}
                    <button
                      onClick={() => handleBookmarkTagRemove(tag)}
                      className="text-amber-400 hover:text-amber-700 ml-0.5 leading-none">
                      ×
                    </button>
                  </span>
                ))}
                {showTagInput ? (
                  <div className="flex items-center gap-1">
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleBookmarkTagAdd()
                        if (e.key === "Escape") { setShowTagInput(false); setTagInput("") }
                      }}
                      placeholder={L.tagPlaceholder}
                      autoFocus
                      className="text-[10px] border border-gray-200 rounded px-1.5 py-0.5 w-20 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleBookmarkTagAdd}
                      disabled={!tagInput.trim()}
                      className="text-[10px] text-blue-600 hover:text-blue-800 disabled:text-gray-300">
                      {L.save}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowTagInput(true)}
                    className="text-[10px] text-gray-400 hover:text-blue-600 px-1 py-0.5 rounded border border-dashed border-gray-300 hover:border-blue-300 transition-colors">
                    {L.addTag}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Quick actions bar: color + add tag (collapsed) */}
          <div className="px-3 py-1.5 border-b border-gray-100 shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-1">
              {[
                { key: "yellow", color: "bg-yellow-400" },
                { key: "blue", color: "bg-blue-400" },
                { key: "green", color: "bg-green-400" },
                { key: "red", color: "bg-red-400" },
                { key: "purple", color: "bg-purple-400" },
                { key: "orange", color: "bg-orange-400" }
              ].map(({ key, color }) => (
                <button
                  key={key}
                  onClick={() => handleColorChange(key)}
                  className={`w-3.5 h-3.5 rounded-full ${color} border-2 ${
                    highlightColor.includes(key === "yellow" ? "250, 204, 21" :
                      key === "blue" ? "59, 130, 246" :
                      key === "green" ? "34, 197, 94" :
                      key === "red" ? "239, 68, 68" :
                      key === "purple" ? "168, 85, 247" :
                      "249, 115, 22")
                      ? "border-gray-700"
                      : "border-transparent"
                  } hover:scale-110 transition-transform`}
                  title={key}
                />
              ))}
            </div>
            {!showTagInput && bookmarkTags.length === 0 && (
              <button
                onClick={() => setShowTagInput(true)}
                className="text-[10px] text-gray-400 hover:text-blue-600 px-1.5 py-0.5 rounded border border-dashed border-gray-300 hover:border-blue-300 transition-colors"
              >
                {L.addTag}
              </button>
            )}
          </div>

          {/* Toolbar settings */}
          <ToolbarSettings locale={locale} />

          {/* Search + Add */}
          <div className="px-3 py-2 border-b border-gray-100 shrink-0 space-y-2">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={L.searchNotePlaceholder}
                className="w-full text-[11px] border border-gray-200 rounded-md pl-7 pr-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-300 transition-colors"
              />
              <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {searchQuery.trim() && (
              <p className="text-[9px] text-gray-400 leading-tight">
                {L.searchSyntaxHint}
              </p>
            )}
            {showAddForm ? (
              <div className="space-y-1">
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder={L.pageNotePlaceholder}
                  className="w-full text-xs border border-gray-200 rounded-md p-2 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  rows={3}
                  autoFocus
                />
                <div className="flex gap-1.5 justify-end">
                  <button
                    onClick={() => {
                      setShowAddForm(false)
                      setNewContent("")
                    }}
                    className="px-2.5 py-1 text-[11px] text-gray-500 hover:text-gray-700 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors">
                    {L.cancel}
                  </button>
                  <button
                    onClick={handleAddAnnotation}
                    disabled={!newContent.trim()}
                    className="px-2.5 py-1 text-[11px] bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    {L.save}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddForm(true)}
                  className="flex-1 py-1.5 text-[11px] font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {L.addNote}
                </button>
                <button
                  onClick={handleAddSticky}
                  className="px-3 py-1.5 text-[11px] font-medium bg-amber-500 text-white rounded-md hover:bg-amber-600 transition-colors"
                  title={L.stickyNoteBtn}>
                  {L.stickyNoteBtn}
                </button>
              </div>
            )}
          </div>

          {/* List */}
          {activeTab === "annotations" && (
            <div ref={listRef} className="flex-1 overflow-y-auto min-h-0">
              <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-gray-100 px-3 py-1 flex items-center justify-between">
                <span className="text-[10px] text-gray-400">
                  {searchQuery.trim()
                    ? L.searchResults(displayAnnotations.filter((a) => matchesSearch(a, searchQuery)).length)
                    : customOrder ? L.customSort : L.positionSort}
                </span>
                {customOrder && !searchQuery.trim() && (
                  <button
                    onClick={handleResetOrder}
                    className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline">
                    {L.resetToPositionSort}
                  </button>
                )}
              </div>
              <div className="p-3 space-y-2.5">
              {displayAnnotations.filter((a) => matchesSearch(a, searchQuery)).length === 0 && (
                <div className="text-center text-gray-400 text-sm py-8">
                  {url
                    ? searchQuery.trim()
                      ? L.noMatchResults
                      : L.noNotesAddPrompt
                    : L.selectTabPrompt}
                </div>
              )}
              {displayAnnotations.filter((a) => matchesSearch(a, searchQuery)).map((ann) => (
                <AnnotationCard
                  key={ann.id}
                  ann={ann}
                  url={url}
                  highlightTerms={highlightTerms}
                  onDelete={handleDelete}
                  onReplyAdded={handleReplyAdded}
                  onReplyDeleted={handleReplyDeleted}
                  onReplyEdited={handleReplyEdited}
                  onNestedReplyAdded={handleNestedReplyAdded}
                  onEdit={handleEditAnnotation}
                  onStatusToggle={handleStatusToggle}
                  onColorChange={handleAnnotationColorChange}
                  autoEdit={pendingEditIds.has(ann.id)}
                  draggable
                  isDragging={draggingId === ann.id}
                  isDragOver={dragOverId === ann.id}
                  onDragStart={(e) => handleDragStart(e, ann.id)}
                  onDragOver={(e) => handleDragOver(e, ann.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, ann.id)}
                  onDragEnd={handleDragEnd}
                />
              ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Footer */}
      <div className="px-3 py-2 border-t border-gray-100 shrink-0 bg-gray-50/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Language toggle */}
            <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
              <button
                onClick={async () => {
                  if (locale === "zh-CN") return
                  await setLocale("zh-CN")
                  setLocaleState("zh-CN")
                }}
                className={`text-[10px] px-2 py-0.5 transition-colors ${
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
                className={`text-[10px] px-2 py-0.5 border-l border-gray-200 transition-colors ${
                  locale === "en"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-500 hover:bg-gray-50"
                }`}>
                EN
              </button>
            </div>
            <span className="text-[10px] text-gray-400">
              {L.pageNoteCount(displayAnnotations.length)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="relative group">
              <button className="text-[10px] text-gray-500 hover:text-blue-600 px-1.5 py-0.5 rounded hover:bg-gray-100 transition-colors">
                {L.exportPage} ▾
              </button>
              <div className="absolute right-0 bottom-full mb-1 hidden group-hover:block bg-white border border-gray-200 rounded-md shadow-lg py-1 z-10 min-w-[80px]">
                <button
                  onClick={handleExportPage}
                  className="block w-full text-left text-[10px] text-gray-600 hover:text-blue-600 hover:bg-blue-50 px-3 py-1">
                  {L.exportPage}
                </button>
                <label className="block w-full text-left text-[10px] text-gray-600 hover:text-blue-600 hover:bg-blue-50 px-3 py-1 cursor-pointer">
                  {L.importPage}
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleImportPage(file)
                      e.target.value = ""
                    }}
                  />
                </label>
              </div>
            </div>
            <div className="relative group">
              <button className="text-[10px] text-gray-500 hover:text-blue-600 px-1.5 py-0.5 rounded hover:bg-gray-100 transition-colors">
                {L.exportBtn} ▾
              </button>
              <div className="absolute right-0 bottom-full mb-1 hidden group-hover:block bg-white border border-gray-200 rounded-md shadow-lg py-1 z-10 min-w-[80px]">
                <button
                  onClick={handleExport}
                  className="block w-full text-left text-[10px] text-gray-600 hover:text-blue-600 hover:bg-blue-50 px-3 py-1">
                  {L.exportBtn}
                </button>
                <label className="block w-full text-left text-[10px] text-gray-600 hover:text-blue-600 hover:bg-blue-50 px-3 py-1 cursor-pointer">
                  {L.importBtn}
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleImport(file)
                      e.target.value = ""
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
