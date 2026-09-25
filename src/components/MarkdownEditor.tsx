import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { detectLocale, t, type Locale } from "@/services/i18n"
import { MarkdownContent } from "./MarkdownContent"

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  autoFocus?: boolean
  locale?: Locale
  textareaClassName?: string
}

type ToolbarAction = {
  key: string
  label: string
  icon: string
  apply: (ctx: {
    value: string
    start: number
    end: number
  }) => { next: string; selStart: number; selEnd: number }
}

function wrapSelection(value: string, start: number, end: number, before: string, after: string, fallback = "") {
  const selected = value.slice(start, end) || fallback
  const next = value.slice(0, start) + before + selected + after + value.slice(end)
  return { next, selStart: start + before.length, selEnd: start + before.length + selected.length }
}

function prefixLines(value: string, start: number, end: number, prefix: string, togglePattern?: RegExp) {
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1
  const lineEndIdx = value.indexOf("\n", end)
  const blockEnd = lineEndIdx === -1 ? value.length : lineEndIdx
  const block = value.slice(lineStart, blockEnd)
  const lines = block.split("\n")
  const allPrefixed = togglePattern ? lines.every((l) => (l.trim() === "" ? true : togglePattern.test(l))) : false
  const nextLines = lines.map((line) => {
    if (line.trim() === "") return line
    if (togglePattern && allPrefixed) return line.replace(togglePattern, "")
    if (togglePattern && togglePattern.test(line)) return line
    return prefix + line
  })
  const newBlock = nextLines.join("\n")
  const next = value.slice(0, lineStart) + newBlock + value.slice(blockEnd)
  return {
    next,
    selStart: lineStart,
    selEnd: lineStart + newBlock.length
  }
}

const EDITOR_HEIGHT_KEY = "omninotation.markdown-editor-height"
const EDITOR_PREVIEW_KEY = "omninotation.markdown-editor-preview"
const MIN_EDITOR_HEIGHT = 96
const MAX_EDITOR_HEIGHT = 720

function clampHeight(value: number) {
  return Math.min(MAX_EDITOR_HEIGHT, Math.max(MIN_EDITOR_HEIGHT, Math.round(value)))
}

function loadEditorHeight(rows: number): number {
  try {
    const stored = localStorage.getItem(EDITOR_HEIGHT_KEY)
    if (stored) {
      const parsed = Number(stored)
      if (Number.isFinite(parsed)) return clampHeight(parsed)
    }
  } catch {
    // localStorage unavailable – fall back to rows-based height
  }
  return clampHeight(rows * 18 + 24)
}

function loadPreviewEnabled(): boolean {
  try {
    // Live preview is on by default (Obsidian-style); only an explicit
    // opt-out ("0") persists as disabled.
    return localStorage.getItem(EDITOR_PREVIEW_KEY) !== "0"
  } catch {
    return true
  }
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 3,
  autoFocus,
  locale,
  textareaClassName
}: MarkdownEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const L = t(locale ?? detectLocale())
  const [editorHeight, setEditorHeight] = useState(() => loadEditorHeight(rows))
  const [showPreview, setShowPreview] = useState(loadPreviewEnabled)
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)

  const handleDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startY: e.clientY, startHeight: editorHeight }
  }

  const handleDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    setEditorHeight(clampHeight(drag.startHeight + (e.clientY - drag.startY)))
  }

  const handleDragEnd = () => {
    if (!dragRef.current) return
    dragRef.current = null
    try {
      localStorage.setItem(EDITOR_HEIGHT_KEY, String(editorHeight))
    } catch {
      // ignore persistence failures
    }
  }

  const handleDragDoubleClick = () => {
    const next = clampHeight(rows * 18 + 24)
    setEditorHeight(next)
    try {
      localStorage.setItem(EDITOR_HEIGHT_KEY, String(next))
    } catch {
      // ignore persistence failures
    }
  }

  const togglePreview = () => {
    const next = !showPreview
    setShowPreview(next)
    try {
      localStorage.setItem(EDITOR_PREVIEW_KEY, next ? "1" : "0")
    } catch {
      // ignore persistence failures
    }
  }

  const apply = useCallback(
    (fn: ToolbarAction["apply"]) => {
      const el = ref.current
      const start = el?.selectionStart ?? value.length
      const end = el?.selectionEnd ?? value.length
      const { next, selStart, selEnd } = fn({ value, start, end })
      onChange(next)
      requestAnimationFrame(() => {
        const node = ref.current
        if (!node) return
        node.focus()
        node.setSelectionRange(selStart, selEnd)
      })
    },
    [value, onChange]
  )

  const actions: ToolbarAction[] = [
    {
      key: "bold",
      label: L.mdBold,
      icon: "B",
      apply: ({ value, start, end }) => wrapSelection(value, start, end, "**", "**")
    },
    {
      key: "italic",
      label: L.mdItalic,
      icon: "I",
      apply: ({ value, start, end }) => wrapSelection(value, start, end, "*", "*")
    },
    {
      key: "strikethrough",
      label: L.mdStrikethrough,
      icon: "S̶",
      apply: ({ value, start, end }) => wrapSelection(value, start, end, "~~", "~~")
    },
    {
      key: "heading",
      label: L.mdHeading,
      icon: "H",
      apply: ({ value, start, end }) => prefixLines(value, start, end, "## ", /^#{1,6}\s/)
    },
    {
      key: "bulletList",
      label: L.mdBulletList,
      icon: "•",
      apply: ({ value, start, end }) => prefixLines(value, start, end, "- ", /^[-*+]\s/)
    },
    {
      key: "orderedList",
      label: L.mdOrderedList,
      icon: "1.",
      apply: ({ value, start, end }) => prefixLines(value, start, end, "1. ", /^\d+\.\s/)
    },
    {
      key: "quote",
      label: L.mdQuote,
      icon: "❝",
      apply: ({ value, start, end }) => prefixLines(value, start, end, "> ", /^>\s/)
    },
    {
      key: "inlineCode",
      label: L.mdInlineCode,
      icon: "‹›",
      apply: ({ value, start, end }) => wrapSelection(value, start, end, "`", "`")
    },
    {
      key: "codeBlock",
      label: L.mdCodeBlock,
      icon: "▤",
      apply: ({ value, start, end }) => wrapSelection(value, start, end, "\n```\n", "\n```\n", "")
    },
    {
      key: "link",
      label: L.mdLink,
      icon: "🔗",
      apply: ({ value, start, end }) => wrapSelection(value, start, end, "[", "](https://)")
    },
    {
      key: "divider",
      label: L.mdDivider,
      icon: "―",
      apply: ({ value, start, end }) => {
        const needsLeading = start > 0 && value[start - 1] !== "\n"
        const insert = `${needsLeading ? "\n" : ""}\n---\n`
        const next = value.slice(0, start) + insert + value.slice(end)
        const pos = start + insert.length
        return { next, selStart: pos, selEnd: pos }
      }
    }
  ]

  const previewLabel = showPreview ? L.hidePreview : L.livePreview

  return (
    <div className="markdown-editor">
      <div className="flex flex-wrap items-center gap-0.5 mb-1 rounded border border-gray-200 bg-gray-50 px-1 py-0.5">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            title={action.label}
            aria-label={action.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply(action.apply)}
            className="min-w-6 h-6 px-1 text-[11px] leading-none text-gray-600 rounded hover:bg-blue-50 hover:text-blue-700 transition-colors">
            {action.icon}
          </button>
        ))}
        <button
          type="button"
          title={previewLabel}
          aria-label={previewLabel}
          aria-pressed={showPreview}
          onMouseDown={(e) => e.preventDefault()}
          onClick={togglePreview}
          className={`ml-auto flex items-center min-w-6 h-6 px-1 rounded transition-colors ${
            showPreview
              ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
              : "text-gray-600 hover:bg-blue-50 hover:text-blue-700"
          }`}>
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true">
            {showPreview ? (
              <>
                <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                <line x1="2" x2="22" y1="2" y2="22" />
              </>
            ) : (
              <>
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
        </button>
      </div>
      <div
        className={`markdown-editor-body${showPreview ? " has-preview" : ""}`}
        style={{ "--md-editor-h": `${editorHeight}px` } as React.CSSProperties}>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          autoFocus={autoFocus}
          className={
            textareaClassName ??
            "w-full text-xs border border-gray-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          }
        />
        {showPreview && (
          <div className="markdown-editor-preview">
            {value.trim() ? (
              <MarkdownContent text={value} />
            ) : (
              <p className="text-xs italic text-gray-400">{L.previewEmpty}</p>
            )}
          </div>
        )}
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={L.resizeEditor}
        title={L.resizeEditor}
        className="markdown-editor-resize"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        onDoubleClick={handleDragDoubleClick}>
        <svg
          width="14"
          height="6"
          viewBox="0 0 14 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden="true">
          <path d="M1 1h12M1 5h12" />
        </svg>
      </div>
    </div>
  )
}