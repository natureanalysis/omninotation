import { useEffect, useRef, useState } from "react"
import * as storage from "@/services/storage"
import { COLOR_PRESETS, hexToRgba } from "@/services/color"
import { detectLocale, t, type Locale } from "@/services/i18n"
import type { Annotation, Reply } from "@/types"
import { MarkdownContent } from "./MarkdownContent"
import { MarkdownEditor } from "./MarkdownEditor"
import { ReplyThread } from "./ReplyThread"

export function AnnotationCard({
  ann,
  url,
  highlightTerms,
  onDelete,
  onReplyAdded,
  onReplyDeleted,
  onReplyEdited,
  onNestedReplyAdded,
  onEdit,
  onStatusToggle,
  onColorChange,
  autoEdit,
  draggable,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  locale: localeProp
}: {
  ann: Annotation
  url: string
  highlightTerms?: string[]
  onDelete: (id: string) => void
  onReplyAdded: (annId: string, reply: Reply) => void
  onReplyDeleted: (annId: string, replyId: string) => void
  onReplyEdited: (annId: string, replyId: string, content: string) => void
  onNestedReplyAdded: (annId: string, parentReplyId: string, reply: Reply) => void
  onEdit: (annId: string, content: string) => void
  onStatusToggle: (annId: string) => void
  onColorChange?: (annId: string, color: string | undefined) => void
  autoEdit?: boolean
  draggable?: boolean
  isDragging?: boolean
  isDragOver?: boolean
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void
  onDragLeave?: (e: React.DragEvent<HTMLDivElement>) => void
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void
  onDragEnd?: (e: React.DragEvent<HTMLDivElement>) => void
  locale?: Locale
}) {
  const [replyText, setReplyText] = useState("")
  const [showReply, setShowReply] = useState(false)
  // Follow the locale passed down from the shell (side panel) so a language
  // switch re-renders every card; fall back to the detected locale.
  const locale = localeProp ?? detectLocale()
  const L = t(locale)
  const initialAutoEditRef = useRef(autoEdit)
  const [isEditing, setIsEditing] = useState(() => initialAutoEditRef.current || false)
  const [editText, setEditText] = useState(ann.data.content)

  // 侧边栏外部触发（例如页面选区「添加批注」）时，即使卡片已挂载也要进入编辑态
  useEffect(() => {
    if (autoEdit) {
      setIsEditing(true)
      setEditText(ann.data.content)
    }
  }, [autoEdit, ann.data.content])
  const [showColorPicker, setShowColorPicker] = useState(false)
  const handleAddReply = async () => {
    if (!replyText.trim() || !url) return
    const reply: Reply = {
      id: crypto.randomUUID(),
      content: replyText.trim(),
      author: { id: "local-user", name: L.me },
      createdAt: new Date().toISOString()
    }
    await storage.addReply(url, ann.id, reply)
    onReplyAdded(ann.id, reply)
    setReplyText("")
  }

  const handleDeleteReply = async (replyId: string) => {
    if (!url) return
    await storage.deleteReply(url, ann.id, replyId)
    onReplyDeleted(ann.id, replyId)
  }

  const handleEditReply = async (replyId: string, content: string) => {
    if (!url) return
    await storage.updateReplyContent(url, ann.id, replyId, content)
    onReplyEdited(ann.id, replyId, content)
  }

  const handleNestedReply = async (parentReplyId: string, content: string) => {
    if (!url) return
    const reply: Reply = {
      id: crypto.randomUUID(),
      content,
      author: { id: "local-user", name: L.me },
      parentId: parentReplyId,
      createdAt: new Date().toISOString()
    }
    await storage.addNestedReply(url, ann.id, parentReplyId, reply)
    onNestedReplyAdded(ann.id, parentReplyId, reply)
  }

  const handleSaveEdit = () => {
    const trimmed = editText.trim()
    if (trimmed && trimmed !== ann.data.content) {
      onEdit(ann.id, trimmed)
    }
    setIsEditing(false)
  }

  const scrollToHighlight = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: "SCROLL_TO_HIGHLIGHT",
        annotationId: ann.id
      }).catch(() => {})
    }
  }

  return (
    <div
      data-annotation-id={ann.id}
      onClick={scrollToHighlight}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`rounded-xl border p-3.5 cursor-pointer transition-all duration-200 ${
        isDragging
          ? "opacity-50 border-dashed border-blue-300 bg-blue-50"
          : isDragOver
          ? "border-blue-400 bg-blue-50 shadow-lg shadow-blue-100/60"
          : "border-slate-200/80 bg-white hover:border-blue-200 hover:bg-blue-50/30 hover:shadow-md hover:shadow-slate-200/50"
      }`}
      title={L.clickToJump}>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
            {ann.position ? `📌 ${L.stickyNote}` : ann.data.markStyle === "underline" ? `U̲ ${L.markUnderline}` : ann.data.markStyle === "strikethrough" ? `S̶ ${L.markStrikethrough}` : ann.data.markStyle === "squiggly" ? `〰 ${L.markSquiggly}` : `▌ ${L.markHighlight}`}
          </span>
          {ann.data.color && (
            <span
              className="w-3 h-3 rounded-full border border-gray-300"
              style={{ backgroundColor: ann.data.color }}
              title={ann.data.color}
            />
          )}
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
        <div className="flex gap-2 items-center">
          {onColorChange && (
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowColorPicker((v) => !v) }}
                className="text-xs text-gray-400 hover:text-gray-600"
                title={L.color}
              >
                🎨
              </button>
              {showColorPicker && (
                <div className="absolute right-0 top-5 z-20 bg-white border border-gray-200 rounded shadow-lg p-1 flex gap-1 items-center">
                  {COLOR_PRESETS.map(({ c, cls }) => (
                    <button
                      key={c}
                      onClick={(e) => { e.stopPropagation(); onColorChange(ann.id, c); setShowColorPicker(false) }}
                      className={`w-4 h-4 rounded-full ${cls} border-2 ${ann.data.color === c ? "border-gray-800" : "border-transparent hover:border-gray-400"}`}
                    />
                  ))}
                  <label className="relative w-4 h-4 rounded-full border-2 border-gray-300 hover:border-gray-500 cursor-pointer flex items-center justify-center overflow-hidden" title={L.customColor}>
                    <input
                      type="color"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={(e) => { onColorChange(ann.id, hexToRgba(e.target.value)); setShowColorPicker(false) }}
                    />
                    <span className="text-[8px] text-gray-500">+</span>
                  </label>
                  {ann.data.color && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onColorChange(ann.id, undefined); setShowColorPicker(false) }}
                      className="text-[10px] text-gray-400 hover:text-gray-600 px-1"
                    >
                      {L.defaultColor}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onStatusToggle(ann.id)
            }}
            title={ann.status === "resolved" ? L.markPending : L.markResolved}
            aria-label={ann.status === "resolved" ? L.markPending : L.markResolved}
            className={`p-1 rounded transition-colors ${
              ann.status === "resolved"
                ? "text-green-500 hover:bg-green-50 hover:text-green-700"
                : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            }`}>
            {ann.status === "resolved" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7v6h6" />
                <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            )}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setIsEditing(true)
            }}
            title={L.edit}
            aria-label={L.edit}
            className="p-1 rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <path d="m15 5 4 4" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(ann.id)
            }}
            title={L.delete}
            aria-label={L.delete}
            className="p-1 rounded text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" x2="10" y1="11" y2="17" />
              <line x1="14" x2="14" y1="11" y2="17" />
            </svg>
          </button>
        </div>
      </div>

      {/* Quote (selected text rendered as markdown) */}
      {ann.quote && (
        <div className="mb-2">
          <div className="relative group">
            <div className="quote-content max-h-48 overflow-y-auto">
              <MarkdownContent text={ann.quote} highlightTerms={highlightTerms} />
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                navigator.clipboard.writeText(ann.quote || "").catch(() => {})
              }}
              className="absolute top-0 right-0 text-[10px] text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity px-1 py-0.5 bg-white/80 rounded"
              title={L.copy}>
              📋
            </button>
          </div>
        </div>
      )}

      {/* User comment (if any) */}
      {(ann.data.content || isEditing) && (
        <div className="mb-2" onClick={(e) => e.stopPropagation()}>
          {isEditing ? (
            <div className="space-y-1">
              <MarkdownEditor
                value={editText}
                onChange={setEditText}
                placeholder={L.addCommentMarkdown}
                rows={3}
                autoFocus
                locale={locale}
              />
              <div className="flex gap-1 justify-end">
                <button
                  onClick={() => { setIsEditing(false); setEditText(ann.data.content) }}
                  className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 rounded border border-gray-200 hover:bg-gray-50">
                  {L.cancel}
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={!editText.trim()}
                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  {L.save}
                </button>
              </div>
            </div>
          ) : (
            <MarkdownContent text={ann.data.content} highlightTerms={highlightTerms} />
          )}
        </div>
      )}

      {/* Replies */}
      {ann.replies && ann.replies.length > 0 && (
        <div className="mt-2 space-y-2 border-t border-gray-200 pt-2">
          {ann.replies.map((reply) => (
            <ReplyThread
              key={reply.id}
              reply={reply}
              locale={locale}
              onDelete={(id) => handleDeleteReply(id)}
              onEdit={(id, content) => handleEditReply(id, content)}
              onReply={(id, content) => handleNestedReply(id, content)}
            />
          ))}
        </div>
      )}

      {/* Reply input */}
      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
        {showReply ? (
          <div className="space-y-1">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={L.addCommentMarkdown}
              className="w-full text-xs border border-gray-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              rows={3}
            />
            <div className="flex gap-1 justify-end">
              <button
                onClick={() => {
                  setShowReply(false)
                  setReplyText("")
                }}
                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 rounded border border-gray-200 hover:bg-gray-50">
                {L.cancel}
              </button>
              <button
                onClick={handleAddReply}
                disabled={!replyText.trim()}
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {L.send}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowReply(true)}
            className="text-xs text-blue-600 hover:text-blue-800 hover:underline">
            💬 {L.addCommentBtn}
          </button>
        )}
      </div>
    </div>
  )
}
