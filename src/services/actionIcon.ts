// ========================
// Axiom Capture: 工具栏图标应用
// 有分类 → 用 OffscreenCanvas 现画「颜色 + 字形」图标并 setIcon(imageData)
// 无分类 → 还原 manifest 里声明的默认图标
// 绘制结果按 (颜色|字形) 缓存，切标签页时零成本复用。
// ========================

import type { CategoryIcon, PageCategory } from "@/types/category"
import { ICON_SIZES, drawCategoryIcon } from "./categoryIcon"

const MAX_CACHE = 64
const cache = new Map<string, Record<number, ImageData>>()

function isoSupported(): boolean {
  return typeof OffscreenCanvas !== "undefined"
}

/** 为指定配色/字形生成全尺寸 ImageData 集合；环境不支持时返回 null。 */
export function getCategoryIconSet(
  color: string,
  glyph: CategoryIcon
): Record<number, ImageData> | null {
  if (!isoSupported()) return null
  const key = `${color}|${glyph}`
  const hit = cache.get(key)
  if (hit) return hit

  const out: Record<number, ImageData> = {}
  for (const size of ICON_SIZES) {
    let ctx: OffscreenCanvasRenderingContext2D | null = null
    try {
      ctx = new OffscreenCanvas(size, size).getContext("2d")
    } catch {
      return null
    }
    if (!ctx) return null
    drawCategoryIcon(ctx, size, color, glyph)
    out[size] = ctx.getImageData(0, 0, size, size)
  }

  if (cache.size >= MAX_CACHE) cache.clear()
  cache.set(key, out)
  return out
}

/** manifest 中声明的默认图标路径（Plasmo 产物带内容哈希，不能硬编码）。 */
function defaultIconPaths(): Record<string, string> {
  try {
    const m = chrome.runtime.getManifest() as chrome.runtime.Manifest & {
      action?: { default_icon?: Record<string, string> }
    }
    const icons = m?.action?.default_icon || m?.icons
    if (icons && typeof icons === "object") return icons as Record<string, string>
  } catch {
    /* ignore */
  }
  return {}
}

async function restoreDefaultIcon(tabId?: number): Promise<void> {
  const paths = defaultIconPaths()
  if (Object.keys(paths).length === 0) return
  const details: chrome.action.TabIconDetails = { path: paths }
  if (typeof tabId === "number") details.tabId = tabId
  await chrome.action.setIcon(details)
}

/**
 * 把分类图标应用到工具栏。
 * 传入 `null` 时还原默认图标。任何失败都被吞掉——图标只是装饰，不能影响主流程。
 *
 * 与上游的差异：OmniNotation 按标签页设置图标，故多一个可选 `tabId`
 * （上游始终修改全局图标；不传 `tabId` 时行为与上游一致）。
 */
export async function applyCategoryIcon(category: PageCategory | null, tabId?: number): Promise<void> {
  try {
    if (!category) {
      await restoreDefaultIcon(tabId)
      return
    }
    const set = getCategoryIconSet(category.color, category.icon)
    if (!set) {
      await restoreDefaultIcon(tabId)
      return
    }
    const details: chrome.action.TabIconDetails = { imageData: set }
    if (typeof tabId === "number") details.tabId = tabId
    await chrome.action.setIcon(details)
  } catch {
    /* ignore */
  }
}
