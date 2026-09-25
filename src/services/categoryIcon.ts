// ========================
// Axiom Capture: 分类图标绘制（纯 canvas，无 chrome API）
// 同一套绘制逻辑同时服务：
//   · Service Worker  → OffscreenCanvas → chrome.action.setIcon(imageData)
//   · 侧边栏/设置页    → <canvas>       → 实时预览
// 所有坐标都在 24×24 的虚拟网格里，按目标尺寸等比缩放，
// 因此 16px 与 128px 的图标形状完全一致。
// ========================

import type { CategoryIcon } from "@/types/category"

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** 工具栏图标需要提供的尺寸集合。 */
export const ICON_SIZES = [16, 32, 48, 64, 128] as const

/** 可供选择的字形（`none` 表示纯色块）。 */
export const CATEGORY_ICONS: CategoryIcon[] = [
  "none",
  "comment",
  "note",
  "star",
  "bookmark",
  "flag",
  "folder",
  "book",
  "check",
  "heart",
  "bulb",
  "pin"
]

/** 新建分类时的候选配色。 */
export const CATEGORY_PALETTE = [
  "#2563eb",
  "#dc2626",
  "#f59e0b",
  "#16a34a",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#ea580c",
  "#475569"
]

export const DEFAULT_CATEGORY_COLOR = CATEGORY_PALETTE[0]

/** 把任意输入规整成 #rrggbb（非法时回退到默认蓝）。 */
export function normalizeHex(hex: string): { r: number; g: number; b: number } {
  let h = (hex || "").trim().replace(/^#/, "")
  if (h.length === 3) {
    h = h
      .split("")
      .map((ch) => ch + ch)
      .join("")
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) h = DEFAULT_CATEGORY_COLOR.slice(1)
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  }
}

/** 相对亮度（WCAG），用于决定字形用白色还是深色。 */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = normalizeHex(hex)
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** 在浅色底上应使用的字形颜色。 */
export function foregroundFor(hex: string): string {
  return relativeLuminance(hex) > 0.6 ? "#1f2937" : "#ffffff"
}

function roundRectPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  if (rr === 0) {
    ctx.rect(x, y, w, h)
    return
  }
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.arcTo(x + w, y, x + w, y + rr, rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr)
  ctx.lineTo(x + rr, y + h)
  ctx.arcTo(x, y + h, x, y + h - rr, rr)
  ctx.lineTo(x, y + rr)
  ctx.arcTo(x, y, x + rr, y, rr)
  ctx.closePath()
}

function starPath(ctx: Ctx2D, cx: number, cy: number, outer: number, inner: number, points = 5) {
  ctx.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner
    const angle = -Math.PI / 2 + (i * Math.PI) / points
    const x = cx + radius * Math.cos(angle)
    const y = cy + radius * Math.sin(angle)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

/** 在 24×24 网格内绘制字形（调用方负责缩放/保存状态）。 */
function drawGlyph(ctx: Ctx2D, glyph: CategoryIcon, fg: string) {
  ctx.fillStyle = fg
  ctx.strokeStyle = fg
  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  switch (glyph) {
    case "none":
      return

    case "comment": {
      // 气泡主体 + 左下尾巴
      roundRectPath(ctx, 4.4, 5.2, 15.2, 10.6, 2.4)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(8.4, 15.2)
      ctx.lineTo(8.4, 19.8)
      ctx.lineTo(13.2, 15.2)
      ctx.closePath()
      ctx.fill()
      return
    }

    case "note": {
      // 三条文本线（末行短）
      roundRectPath(ctx, 4.6, 5.4, 14.8, 2.3, 1.15)
      ctx.fill()
      roundRectPath(ctx, 4.6, 10.85, 14.8, 2.3, 1.15)
      ctx.fill()
      roundRectPath(ctx, 4.6, 16.3, 9.2, 2.3, 1.15)
      ctx.fill()
      return
    }

    case "star": {
      starPath(ctx, 12, 12.8, 8.2, 3.5)
      ctx.fill()
      return
    }

    case "bookmark": {
      ctx.beginPath()
      ctx.moveTo(7.2, 4.2)
      ctx.lineTo(16.8, 4.2)
      ctx.lineTo(16.8, 20.2)
      ctx.lineTo(12, 15.4)
      ctx.lineTo(7.2, 20.2)
      ctx.closePath()
      ctx.fill()
      return
    }

    case "flag": {
      ctx.lineWidth = 2.2
      ctx.beginPath()
      ctx.moveTo(7.4, 3.8)
      ctx.lineTo(7.4, 20.6)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(8.8, 5)
      ctx.lineTo(19.2, 8.6)
      ctx.lineTo(8.8, 12.2)
      ctx.closePath()
      ctx.fill()
      return
    }

    case "folder": {
      ctx.beginPath()
      ctx.moveTo(3.4, 6.6)
      ctx.lineTo(9.4, 6.6)
      ctx.lineTo(11.2, 8.8)
      ctx.lineTo(20.6, 8.8)
      ctx.lineTo(20.6, 19.4)
      ctx.lineTo(3.4, 19.4)
      ctx.closePath()
      ctx.fill()
      return
    }

    case "book": {
      // 摊开的书：左右两页
      ctx.beginPath()
      ctx.moveTo(4.2, 6.6)
      ctx.lineTo(11.1, 5.1)
      ctx.lineTo(11.1, 18.3)
      ctx.lineTo(4.2, 19.1)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(12.9, 5.1)
      ctx.lineTo(19.8, 6.6)
      ctx.lineTo(19.8, 19.1)
      ctx.lineTo(12.9, 18.3)
      ctx.closePath()
      ctx.fill()
      return
    }

    case "check": {
      ctx.lineWidth = 3.2
      ctx.beginPath()
      ctx.moveTo(5.6, 12.4)
      ctx.lineTo(10.2, 17)
      ctx.lineTo(18.6, 6.6)
      ctx.stroke()
      return
    }

    case "heart": {
      ctx.beginPath()
      ctx.arc(9, 9.8, 3.7, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(15, 9.8, 3.7, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(5.5, 11.2)
      ctx.lineTo(18.5, 11.2)
      ctx.lineTo(12, 19.6)
      ctx.closePath()
      ctx.fill()
      return
    }

    case "bulb": {
      ctx.beginPath()
      ctx.arc(12, 9.8, 5.8, 0, Math.PI * 2)
      ctx.fill()
      roundRectPath(ctx, 9.2, 16.2, 5.6, 2, 0.8)
      ctx.fill()
      roundRectPath(ctx, 10.3, 18.8, 3.4, 1.8, 0.7)
      ctx.fill()
      return
    }

    case "pin": {
      ctx.beginPath()
      ctx.arc(12, 9, 5.6, 0, Math.PI * 2)
      ctx.fill()
      roundRectPath(ctx, 11, 14.4, 2, 6.4, 1)
      ctx.fill()
      return
    }
  }
}

/**
 * 把一个分类（颜色 + 字形）画到 `size × size` 的画布上。
 * 调用方负责画布本身的 DPR/尺寸设置；本函数只做逻辑绘制。
 */
export function drawCategoryIcon(ctx: Ctx2D, size: number, color: string, glyph: CategoryIcon) {
  const { r, g, b } = normalizeHex(color)
  const lum = relativeLuminance(color)
  ctx.save()
  ctx.scale(size / 24, size / 24)

  roundRectPath(ctx, 1, 1, 22, 22, 5.5)
  ctx.fillStyle = `rgb(${r},${g},${b})`
  ctx.fill()
  ctx.lineWidth = 1.1
  ctx.strokeStyle = lum > 0.75 ? "rgba(0,0,0,0.30)" : "rgba(0,0,0,0.14)"
  ctx.stroke()

  if (glyph !== "none") drawGlyph(ctx, glyph, foregroundFor(color))

  ctx.restore()
}
