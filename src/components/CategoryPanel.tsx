import { useCallback, useEffect, useState } from "react"

import {
  ASSIGN_NONE,
  assignCategory,
  getAnnotationStats,
  getAssignments,
  getCategories,
  makeCategory,
  resolvePageCategory,
  saveAssignments,
  saveCategories
} from "@/services/categories"
import {
  CATEGORY_ICONS,
  CATEGORY_PALETTE
} from "@/services/categoryIcon"
import { CategoryIconSwatch } from "@/components/CategoryIconSwatch"
import { t, type Locale } from "@/services/i18n"
import type {
  AnnotationStats,
  CategoryAutoRule,
  CategoryIcon,
  PageCategory,
  ResolvedCategory
} from "@/types/category"

interface CategoryPanelProps {
  url: string
  locale: Locale
}

const EMPTY_RESOLVED: ResolvedCategory = { category: null, source: "none", suppressed: false }
const EMPTY_STATS: AnnotationStats = { total: 0, withContent: 0 }

/**
 * 分类变更后立刻请求后台刷新工具栏图标，避免等 storage 变更事件造成延迟
 * （后台同时也监听 storage 变更，这里是更快的主动路径，重复刷新是幂等的）。
 */
function requestIconRefresh(): void {
  try {
    chrome.runtime.sendMessage({ type: "REFRESH_ACTION_ICON" }).catch(() => {})
  } catch {
    /* ignore */
  }
}

/** 字形名称（用于图标选择器的悬浮提示）。 */
const GLYPH_LABELS: Record<Locale, Record<CategoryIcon, string>> = {
  "zh-CN": {
    none: "纯色",
    comment: "评论",
    note: "笔记",
    star: "星标",
    bookmark: "书签",
    flag: "旗标",
    folder: "文件夹",
    book: "书本",
    check: "对勾",
    heart: "心形",
    bulb: "灯泡",
    pin: "图钉"
  },
  en: {
    none: "Solid",
    comment: "Comment",
    note: "Note",
    star: "Star",
    bookmark: "Bookmark",
    flag: "Flag",
    folder: "Folder",
    book: "Book",
    check: "Check",
    heart: "Heart",
    bulb: "Bulb",
    pin: "Pin"
  }
}

function ruleLabel(rule: CategoryAutoRule | null, locale: Locale): string {
  const L = t(locale)
  if (rule === "has-annotations") return L.catRuleHasAnnotations
  if (rule === "has-comments") return L.catRuleHasComments
  return L.catRuleNone
}

function CategoryEditor({
  draft,
  locale,
  onChange,
  onSave,
  onCancel
}: {
  draft: PageCategory
  locale: Locale
  onChange: (next: PageCategory) => void
  onSave: () => void
  onCancel: () => void
}) {
  const L = t(locale)
  const inputCls =
    "w-full text-sm px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"

  return (
    <div className="space-y-2 p-2 bg-gray-50 rounded">
      <div className="flex items-center gap-2">
        <CategoryIconSwatch color={draft.color} glyph={draft.icon} size={28} />
        <input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder={L.catName}
          className={inputCls}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="color"
          value={draft.color}
          onChange={(e) => onChange({ ...draft, color: e.target.value })}
          className="w-9 h-8 shrink-0 rounded border border-gray-200 cursor-pointer"
          title={L.catColor}
        />
        <div className="flex flex-wrap gap-1">
          {CATEGORY_PALETTE.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onChange({ ...draft, color: preset })}
              style={{ backgroundColor: preset }}
              title={preset}
              className={`w-5 h-5 rounded-full border ${
                draft.color.toLowerCase() === preset.toLowerCase()
                  ? "ring-2 ring-offset-1 ring-gray-400 border-white"
                  : "border-gray-200"
              }`}
            />
          ))}
        </div>
      </div>

      <div>
        <label className="block text-[10px] text-gray-400 mb-1">{L.catIcon}</label>
        <div className="flex flex-wrap gap-1">
          {CATEGORY_ICONS.map((glyph) => (
            <button
              key={glyph}
              type="button"
              onClick={() => onChange({ ...draft, icon: glyph })}
              title={GLYPH_LABELS[locale][glyph]}
              className={`rounded border p-0.5 ${
                draft.icon === glyph
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-white hover:bg-gray-50"
              }`}
            >
              <CategoryIconSwatch color={draft.color} glyph={glyph} size={20} />
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-[10px] text-gray-400 mb-1">{L.catAutoRule}</label>
        <select
          value={draft.autoRule ?? ""}
          onChange={(e) =>
            onChange({ ...draft, autoRule: (e.target.value || null) as CategoryAutoRule | null })
          }
          className={inputCls}
        >
          <option value="">{L.catRuleNone}</option>
          <option value="has-annotations">{L.catRuleHasAnnotations}</option>
          <option value="has-comments">{L.catRuleHasComments}</option>
        </select>
      </div>

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={onSave}
          disabled={!draft.name.trim()}
          className="flex-1 text-sm px-2 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
        >
          {L.save}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 text-sm px-2 py-1.5 bg-gray-200 text-gray-600 rounded hover:bg-gray-300"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

export function CategoryPanel({ url, locale }: CategoryPanelProps) {
  const L = t(locale)
  const [categories, setCategories] = useState<PageCategory[]>([])
  const [resolved, setResolved] = useState<ResolvedCategory>(EMPTY_RESOLVED)
  const [stats, setStats] = useState<AnnotationStats>(EMPTY_STATS)
  const [showManage, setShowManage] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<PageCategory | null>(null)
  const [newDraft, setNewDraft] = useState<PageCategory | null>(null)

  const reload = useCallback(async () => {
    const [cats, res, st] = await Promise.all([
      getCategories(locale),
      resolvePageCategory(url, locale),
      getAnnotationStats(url)
    ])
    setCategories(cats)
    setResolved(res)
    setStats(st)
  }, [url, locale])

  useEffect(() => {
    void reload()
  }, [reload])

  // 分类定义 / 页面指定 / 批注 任一变化都重新解析（工具栏图标由后台同步刷新）
  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local") return
      const annotationsTouched = Object.keys(changes).some((k) => k.startsWith("annotations:"))
      if (changes["page_categories"] || changes["page_category_assignments"] || annotationsTouched) {
        void reload()
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [reload])

  const selectCategory = useCallback(
    async (value: string | null) => {
      if (!url) return
      await assignCategory(url, value)
      requestIconRefresh()
      await reload()
    },
    [url, reload]
  )

  const startEdit = (category: PageCategory) => {
    setEditingId(category.id)
    setDraft({ ...category })
  }

  const commitEdit = async () => {
    if (!draft) return
    const name = draft.name.trim()
    const previous = categories.find((c) => c.id === draft.id)
    const next = categories.map((c) =>
      c.id === draft.id ? { ...draft, name: name || previous?.name || L.catUntitled } : c
    )
    await saveCategories(next)
    requestIconRefresh()
    setEditingId(null)
    setDraft(null)
    await reload()
  }

  const removeCategory = async (id: string) => {
    await saveCategories(categories.filter((c) => c.id !== id))
    // 清掉指向该分类的页面指定，避免留下悬空引用
    const assignments = await getAssignments()
    let dirty = false
    for (const key of Object.keys(assignments)) {
      if (assignments[key] === id) {
        delete assignments[key]
        dirty = true
      }
    }
    if (dirty) await saveAssignments(assignments)
    requestIconRefresh()
    if (editingId === id) {
      setEditingId(null)
      setDraft(null)
    }
    await reload()
  }

  const startNew = () => {
    setNewDraft(
      makeCategory({
        name: "",
        color: CATEGORY_PALETTE[categories.length % CATEGORY_PALETTE.length],
        icon: "folder",
        autoRule: null
      })
    )
  }

  const commitNew = async () => {
    if (!newDraft) return
    const name = newDraft.name.trim()
    if (!name) return
    await saveCategories([...categories, { ...newDraft, name }])
    requestIconRefresh()
    setNewDraft(null)
    await reload()
  }

  if (!url) {
    return <div className="text-center py-8 text-xs text-gray-400">{L.unselectedPage}</div>
  }

  const manualCategory =
    resolved.source === "manual" && resolved.category ? resolved.category : null
  const autoMode = !resolved.suppressed && !manualCategory

  const hint = resolved.suppressed
    ? L.catNoneHint
    : manualCategory
      ? L.catManualHint(manualCategory.name)
      : resolved.category
        ? L.catAutoMatched(resolved.category.name)
        : L.catAutoHint

  const chipBase =
    "inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border transition-colors"

  return (
    <div className="p-3 space-y-3">
      {/* 本页分类 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            🏷️ {L.pageCategory}
          </span>
          {stats.total > 0 && (
            <span className="text-[10px] text-blue-600">{L.catAnnotatedCount(stats.total)}</span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => selectCategory(null)}
            className={`${chipBase} ${
              autoMode
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
            }`}
          >
            {L.catAuto}
          </button>

          <button
            type="button"
            onClick={() => selectCategory(ASSIGN_NONE)}
            className={`${chipBase} ${
              resolved.suppressed
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
            }`}
          >
            {L.catNone}
          </button>

          {categories.map((category) => {
            const active = manualCategory?.id === category.id
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => selectCategory(category.id)}
                className={`${chipBase} ${
                  active
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <CategoryIconSwatch color={category.color} glyph={category.icon} size={14} />
                <span className="max-w-[10rem] truncate">{category.name || L.catUntitled}</span>
              </button>
            )
          })}
        </div>

        <p className="text-[10px] text-gray-400 mt-1.5 leading-snug">{hint}</p>
      </div>

      {/* 管理分类 */}
      <div className="pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={() => setShowManage((v) => !v)}
          className="w-full flex items-center justify-between text-xs text-gray-500 hover:text-gray-700"
        >
          <span className="font-medium">{L.manageCategories}</span>
          <span className="text-gray-400">{showManage ? "▲" : "▼"}</span>
        </button>

        {showManage && (
          <div className="mt-2 space-y-1.5">
            {categories.length === 0 && !newDraft && (
              <p className="text-[10px] text-gray-400">{L.catEmptyHint}</p>
            )}

            {categories.map((category) => (
              <div key={category.id}>
                {editingId === category.id && draft ? (
                  <CategoryEditor
                    draft={draft}
                    locale={locale}
                    onChange={setDraft}
                    onSave={commitEdit}
                    onCancel={() => {
                      setEditingId(null)
                      setDraft(null)
                    }}
                  />
                ) : (
                  <div className="flex items-center gap-2 py-1">
                    <CategoryIconSwatch color={category.color} glyph={category.icon} size={18} />
                    <span className="flex-1 truncate text-sm text-gray-700">
                      {category.name || L.catUntitled}
                    </span>
                    {category.autoRule && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 text-gray-500 whitespace-nowrap">
                        {ruleLabel(category.autoRule, locale)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => startEdit(category)}
                      className="text-gray-400 hover:text-blue-600 text-sm px-0.5"
                      title={L.catName}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCategory(category.id)}
                      className="text-gray-400 hover:text-red-600 text-sm px-0.5"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            ))}

            {newDraft ? (
              <CategoryEditor
                draft={newDraft}
                locale={locale}
                onChange={setNewDraft}
                onSave={commitNew}
                onCancel={() => setNewDraft(null)}
              />
            ) : (
              <button
                type="button"
                onClick={startNew}
                className="w-full text-xs px-3 py-1.5 border border-dashed border-gray-300 text-gray-500 rounded hover:border-blue-400 hover:text-blue-600"
              >
                + {L.addCategory}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
