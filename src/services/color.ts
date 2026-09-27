// ========================
// Color utilities for annotations & UI
// ========================

import { EMBEDDED_ENGINE_ICONS } from "./engineIcons.generated"

export const DEFAULT_ANNOTATION_COLOR = "rgba(250, 204, 21, 0.3)"

export const COLOR_PRESETS = [
  { c: "rgba(250, 204, 21, 0.3)", cls: "bg-yellow-400" },
  { c: "rgba(59, 130, 246, 0.3)", cls: "bg-blue-400" },
  { c: "rgba(34, 197, 94, 0.3)", cls: "bg-green-400" },
  { c: "rgba(239, 68, 68, 0.3)", cls: "bg-red-400" },
  { c: "rgba(168, 85, 247, 0.3)", cls: "bg-purple-400" },
  { c: "rgba(249, 115, 22, 0.3)", cls: "bg-orange-400" }
]

export function hexToRgba(hex: string, alpha: number = 0.3): string {
  const clean = hex.replace("#", "")
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function isPresetColor(color: string): boolean {
  return COLOR_PRESETS.some((p) => p.c === color)
}

export interface RgbaColor {
  r: number
  g: number
  b: number
  a: number
}

/**
 * Parse a `#rgb` / `#rrggbb` / `rgb()` / `rgba()` string into RGBA components.
 * Returns null when the value cannot be recognised.
 */
export function parseRgba(color: string): RgbaColor | null {
  if (!color) return null
  const value = color.trim()

  if (value.startsWith("#")) {
    const clean = value.slice(1)
    if (clean.length === 3) {
      return {
        r: parseInt(clean[0] + clean[0], 16),
        g: parseInt(clean[1] + clean[1], 16),
        b: parseInt(clean[2] + clean[2], 16),
        a: 1
      }
    }
    if (clean.length >= 6) {
      return {
        r: parseInt(clean.slice(0, 2), 16),
        g: parseInt(clean.slice(2, 4), 16),
        b: parseInt(clean.slice(4, 6), 16),
        a: 1
      }
    }
    return null
  }

  const match = value.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i
  )
  if (!match) return null
  return {
    r: Math.round(Number(match[1])),
    g: Math.round(Number(match[2])),
    b: Math.round(Number(match[3])),
    a: match[4] !== undefined ? Number(match[4]) : 1
  }
}

/** Convert any supported color string to a `#rrggbb` hex value (for `<input type="color">`). */
export function rgbaToHex(color: string): string {
  const parsed = parseRgba(color)
  if (!parsed) return "#facc15"
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")
  return `#${toHex(parsed.r)}${toHex(parsed.g)}${toHex(parsed.b)}`
}

/** Return a copy of the color with a new alpha channel, keeping RGB untouched. */
export function withAlpha(color: string, alpha: number): string {
  const parsed = parseRgba(color)
  if (!parsed) return color
  const a = Math.max(0, Math.min(1, alpha))
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${a})`
}

/** Compare two colors ignoring their alpha channel. */
export function sameRgb(a: string, b: string): boolean {
  const pa = parseRgba(a)
  const pb = parseRgba(b)
  if (!pa || !pb) return false
  return pa.r === pb.r && pa.g === pb.g && pa.b === pb.b
}

// ========================
// Dark mode adaptation
// ========================

export function isDarkMode(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
}

/**
 * Darken a color for dark mode by reducing its alpha channel.
 * e.g. rgba(250, 204, 21, 0.3) → rgba(250, 204, 21, 0.15)
 */
export function darkenForDarkMode(rgba: string): string {
  return rgba.replace(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/, (_, r, g, b, a) => {
    const alpha = parseFloat(a)
    return `rgba(${r}, ${g}, ${b}, ${Math.max(alpha * 0.5, 0.06)})`
  })
}

// ========================
// Engine icon mapping
// ========================

export const LOCAL_ICON_MAP: Record<string, string> = {
  // 自定义映射：引擎 id -> 内联图标名（assets/icons/<name>.ico）
  "google": "google",
  "wikipedia": "wikipedia-en",
  "wikipedia-zh": "wikipedia-zh",
  "youdao": "youdao",
  "zdic": "zdic",
  "google-scholar": "google",
  "pubmed": "pubmed"
}

/** 取随扩展内联打包的引擎图标（构建期 base64，见 scripts/embed-engine-icons.mjs）；无则返回 null。 */
export function getEngineIconDataUrl(engineId: string): string | null {
  const fileName = LOCAL_ICON_MAP[engineId] || engineId
  return EMBEDDED_ENGINE_ICONS[fileName] ?? null
}
