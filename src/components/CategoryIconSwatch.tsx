import { useEffect, useRef } from "react"

import { drawCategoryIcon } from "@/services/categoryIcon"
import type { CategoryIcon } from "@/types/category"

/** 与扩展工具栏图标使用同一套矢量绘制逻辑的分类图标预览。 */
export function CategoryIconSwatch({
  color,
  glyph,
  size = 18
}: {
  color: string
  glyph: CategoryIcon
  size?: number
}) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.scale(dpr, dpr)
    drawCategoryIcon(ctx, size, color, glyph)
    ctx.restore()
  }, [color, glyph, size])

  return <canvas ref={ref} style={{ width: size, height: size }} className="shrink-0 align-middle" />
}
