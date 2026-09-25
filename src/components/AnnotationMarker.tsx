import { useEffect, useRef, useState } from "react"
import type { MountedAnnotation } from "@/hooks/useAnnotations"
import { detectLocale, t } from "@/services/i18n"

interface AnnotationMarkerProps {
  mounted: MountedAnnotation
  onDelete?: (id: string) => void
}

export function AnnotationMarker({ mounted, onDelete }: AnnotationMarkerProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const markerRef = useRef<HTMLSpanElement>(null)
  const L = t(detectLocale())

  useEffect(() => {
    if (!mounted.range) return

    const range = mounted.range
    const rects = Array.from(range.getClientRects())
    if (rects.length === 0) return

    // Use the first rect for marker placement
    const rect = rects[0]
    const marker = markerRef.current
    if (!marker) return

    const scrollX = window.scrollX
    const scrollY = window.scrollY

    marker.style.position = "absolute"
    marker.style.left = `${rect.left + scrollX}px`
    marker.style.top = `${rect.top + scrollY - 6}px`
    marker.style.width = `${rect.width}px`
    marker.style.height = "6px"
    marker.style.backgroundColor = mounted.data.type === "edit" ? "#f59e0b" : "#3b82f6"
    marker.style.cursor = "pointer"
    marker.style.zIndex = "9999"
  }, [mounted])

  if (!mounted.range) return null

  return (
    <span
      ref={markerRef}
      onMouseEnter={() => setTooltipVisible(true)}
      onMouseLeave={() => setTooltipVisible(false)}
      onClick={(e) => {
        e.stopPropagation()
        setTooltipVisible((v) => !v)
      }}>
      {tooltipVisible && (
        <span
          style={{
            position: "absolute",
            bottom: "100%",
            left: "0",
            background: "#1f2937",
            color: "#fff",
            padding: "8px 12px",
            borderRadius: "6px",
            fontSize: "13px",
            whiteSpace: "nowrap",
            zIndex: 10000,
            boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
            marginBottom: "4px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            minWidth: "180px"
          }}>
          <strong style={{ fontSize: "12px", opacity: 0.8 }}>
            {L.annotationBy(
              mounted.data.type === "edit" ? L.filterEdit : L.filterComment,
              mounted.author.name
            )}
          </strong>
          <span style={{ maxWidth: "240px", whiteSpace: "normal", lineHeight: 1.4 }}>
            {mounted.data.content}
          </span>
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete(mounted.id)
              }}
              style={{
                marginTop: "4px",
                alignSelf: "flex-end",
                background: "#ef4444",
                border: "none",
                color: "#fff",
                padding: "2px 8px",
                borderRadius: "4px",
                fontSize: "11px",
                cursor: "pointer"
              }}
              title={L.delete}
              aria-label={L.delete}>
              {L.delete}
            </button>
          )}
        </span>
      )}
    </span>
  )
}
