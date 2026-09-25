// ========================
// 网页分类（页面标注）存储与解析
//   直接移植自 Axiom Capture 的 src/services/categories.ts
//   page_categories            → PageCategory[]            分类定义（名称/颜色/图标/自动规则）
//   page_category_assignments  → Record<pageKey, categoryId | "__none__">
// 手动指定优先于自动规则；`__none__` 表示「本页明确不标注」，用于抑制自动规则。
//
// 与上游的唯一差异：批注统计只读本地 `chrome.storage.local`（见 getAnnotationStats），
// OmniNotation 没有 Axiom-KB bridge，因此去掉了上游的 bridge 探测逻辑。
// ========================

import type {
  AnnotationStats,
  CategoryAutoRule,
  PageCategory,
  ResolvedCategory
} from "@/types/category"
import { DEFAULT_CATEGORY_COLOR, normalizeHex } from "./categoryIcon"
import { ensureLocale, getLocale, type Locale } from "./i18n"
import { normalizePageUrl } from "./storage"

const CATEGORIES_KEY = "page_categories"
const ASSIGNMENTS_KEY = "page_category_assignments"
const ANNOTATION_PREFIX = "annotations:"

/** 手动指定为「不标注」的哨兵值。 */
export const ASSIGN_NONE = "__none__"

const DEFAULT_NAMES: Record<Locale, { toRead: string; important: string; read: string; annotated: string }> = {
  "zh-CN": { toRead: "待读", important: "重要", read: "已读", annotated: "有批注" },
  en: { toRead: "To read", important: "Important", read: "Read", annotated: "Has notes" }
}

type DefaultNameKey = keyof (typeof DEFAULT_NAMES)["en"]

/** 内置分类 id → DEFAULT_NAMES 字段，用于识别还没被用户改过名字的内置分类。 */
const DEFAULT_NAME_BY_ID: Record<string, DefaultNameKey> = {
  "cat-to-read": "toRead",
  "cat-important": "important",
  "cat-read": "read",
  "cat-annotated": "annotated"
}

/** 内置默认分类。首次读取时写入存储，之后完全由用户维护。 */
export function defaultCategories(locale: Locale = getLocale()): PageCategory[] {
  const n = DEFAULT_NAMES[locale] || DEFAULT_NAMES.en
  return [
    { id: "cat-to-read", name: n.toRead, color: "#f59e0b", icon: "bookmark", autoRule: null },
    { id: "cat-important", name: n.important, color: "#dc2626", icon: "star", autoRule: null },
    { id: "cat-read", name: n.read, color: "#16a34a", icon: "check", autoRule: null },
    { id: "cat-annotated", name: n.annotated, color: "#2563eb", icon: "comment", autoRule: "has-annotations" }
  ]
}

/**
 * 页面键：忽略 hash、主机名小写、无 query 时去掉末尾斜杠。
 * 分类指定与自动规则都以它为唯一键。
 */
export function pageKey(url: string): string {
  return normalizePageUrl(url)
}

// --- 读写 ----------------------------------------------------------

/**
 * 把内置分类的名字翻译成当前语言。
 *
 * 内置分类只在首次读取时按「当时的语言」播种，之后切换界面语言不会跟着更新，
 * 于是英文界面里仍显示「待读 / 重要 / 已读 / 有批注」。
 * 这里只改写名字仍然等于其它语言默认值的内置分类；用户改过的名字原样保留。
 */
function localizeDefaultNames(
  cats: PageCategory[],
  locale: Locale
): { cats: PageCategory[]; changed: boolean } {
  const current = DEFAULT_NAMES[locale] || DEFAULT_NAMES.en
  let changed = false
  const next = cats.map((cat) => {
    const key = DEFAULT_NAME_BY_ID[cat.id]
    if (!key || cat.name === current[key]) return cat
    const isUntouchedDefault = Object.values(DEFAULT_NAMES).some(
      (names) => names[key] === cat.name
    )
    if (!isUntouchedDefault) return cat
    changed = true
    return { ...cat, name: current[key] }
  })
  return { cats: next, changed }
}

export async function getCategories(locale?: Locale): Promise<PageCategory[]> {
  // 优先使用调用方显式传入的语言：UI 已持有最新 locale，避免依赖 i18n 缓存的更新时序；
  // 未传入时回退到已保存的语言偏好，避免 Service Worker / 侧边栏初始化先后顺序造成语言不一致。
  const resolvedLocale = locale ?? (await ensureLocale())
  try {
    const res = await chrome.storage.local.get(CATEGORIES_KEY)
    const saved = res[CATEGORIES_KEY]
    if (Array.isArray(saved)) {
      const localized = localizeDefaultNames(sanitizeCategories(saved as PageCategory[]), resolvedLocale)
      if (localized.changed) await saveCategories(localized.cats)
      return localized.cats
    }
  } catch {
    /* ignore */
  }
  const seeded = defaultCategories(resolvedLocale)
  await saveCategories(seeded)
  return seeded
}

export async function saveCategories(categories: PageCategory[]): Promise<void> {
  await chrome.storage.local.set({ [CATEGORIES_KEY]: sanitizeCategories(categories) })
}

export async function getAssignments(): Promise<Record<string, string>> {
  try {
    const res = await chrome.storage.local.get(ASSIGNMENTS_KEY)
    const saved = res[ASSIGNMENTS_KEY]
    if (saved && typeof saved === "object") return { ...(saved as Record<string, string>) }
  } catch {
    /* ignore */
  }
  return {}
}

export async function saveAssignments(assignments: Record<string, string>): Promise<void> {
  await chrome.storage.local.set({ [ASSIGNMENTS_KEY]: assignments })
}

/** 指定本页分类：`null` = 回到自动规则，`ASSIGN_NONE` = 明确不标注，其它 = 分类 id。 */
export async function assignCategory(url: string, value: string | null): Promise<void> {
  const key = pageKey(url)
  if (!key) return
  const assignments = await getAssignments()
  if (value === null) delete assignments[key]
  else assignments[key] = value
  await saveAssignments(assignments)
}

/** 新建分类对象（补齐颜色/图标/自动规则默认值）。 */
export function makeCategory(partial: Partial<PageCategory> = {}): PageCategory {
  const color = normalizeHex(partial.color || DEFAULT_CATEGORY_COLOR)
  const hex =
    "#" +
    [color.r, color.g, color.b]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  return {
    id: partial.id || `cat-${crypto.randomUUID()}`,
    name: (partial.name || "").trim(),
    color: hex,
    icon: partial.icon || "none",
    autoRule: partial.autoRule ?? null
  }
}

/** 防御性清洗：丢弃结构不完整的条目，避免损坏数据导致图标渲染失败。 */
function sanitizeCategories(input: PageCategory[]): PageCategory[] {
  return input
    .filter((c) => c && typeof c === "object" && typeof c.id === "string")
    .map((c) => ({
      id: c.id,
      name: typeof c.name === "string" ? c.name : "",
      color: typeof c.color === "string" && c.color ? c.color : DEFAULT_CATEGORY_COLOR,
      icon: (c.icon || "none") as PageCategory["icon"],
      autoRule: (c.autoRule ?? null) as CategoryAutoRule | null
    }))
}

// --- 批注统计（自动规则数据源） ------------------------------------

type AnnotatedLike = { data?: { content?: string | null } | null }

function statsFrom(list: readonly AnnotatedLike[]): AnnotationStats {
  let total = 0
  let withContent = 0
  for (const a of list) {
    total += 1
    const content = a?.data?.content
    if (typeof content === "string" && content.trim().length > 0) withContent += 1
  }
  return { total, withContent }
}

/** 只读 chrome.storage.local 里的 `annotations:<url>`（原始 URL 与归一化 URL 都查）。 */
async function readCachedAnnotationStats(url: string): Promise<AnnotationStats> {
  const keys = new Set<string>()
  if (url) keys.add(ANNOTATION_PREFIX + url)
  const normalized = pageKey(url)
  if (normalized) keys.add(ANNOTATION_PREFIX + normalized)
  if (keys.size === 0) return { total: 0, withContent: 0 }

  let res: Record<string, any> = {}
  try {
    res = await chrome.storage.local.get(Array.from(keys))
  } catch {
    return { total: 0, withContent: 0 }
  }

  const byId = new Map<string, any>()
  for (const key of Object.keys(res)) {
    const list = res[key]
    if (!Array.isArray(list)) continue
    for (const a of list) {
      if (a && typeof a.id === "string") byId.set(a.id, a)
    }
  }
  return statsFrom(Array.from(byId.values()))
}

/**
 * 批注统计（自动规则的数据源）。
 *
 * OmniNotation 的批注真身就在 `chrome.storage.local` 的 `annotations:<url>`，
 * 因此这里直接读本地数据；上游 Axiom Capture 因为数据在 Axiom-KB，
 * 需要额外向 bridge 探测一次，这里省略。
 */
export async function getAnnotationStats(url: string): Promise<AnnotationStats> {
  return readCachedAnnotationStats(url)
}

function matchesRule(rule: CategoryAutoRule, stats: AnnotationStats): boolean {
  if (rule === "has-annotations") return stats.total > 0
  if (rule === "has-comments") return stats.withContent > 0
  return false
}

// --- 解析 ----------------------------------------------------------

/**
 * 解析某个 URL 的有效分类。
 * 顺序：手动指定（含「不标注」）→ 自动规则（按分类列表顺序取首个命中）。
 */
export async function resolvePageCategory(url: string, locale?: Locale): Promise<ResolvedCategory> {
  const key = pageKey(url)
  if (!key) return { category: null, source: "none", suppressed: false }

  const [categories, assignments] = await Promise.all([getCategories(locale), getAssignments()])
  const assigned = assignments[key]

  if (assigned === ASSIGN_NONE) return { category: null, source: "none", suppressed: true }
  if (typeof assigned === "string" && assigned) {
    const hit = categories.find((c) => c.id === assigned)
    if (hit) return { category: hit, source: "manual", suppressed: false }
  }

  const autoCategories = categories.filter((c) => c.autoRule)
  if (autoCategories.length > 0) {
    const stats = await getAnnotationStats(url)
    for (const cat of autoCategories) {
      if (cat.autoRule && matchesRule(cat.autoRule, stats)) {
        return { category: cat, source: "auto", suppressed: false }
      }
    }
  }

  return { category: null, source: "none", suppressed: false }
}
