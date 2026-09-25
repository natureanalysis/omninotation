import { useState } from "react"
import type { Reply } from "@/types"
import { detectLocale, t, type Locale } from "@/services/i18n"
import { MarkdownContent } from "./MarkdownContent"

export function ReplyThread({
  reply,
  depth = 0,
  locale: localeProp,
  onDelete,
  onEdit,
  onReply
}: {
  reply: Reply
  depth?: number
  locale?: Locale
  onDelete: (replyId: string) => void
  onEdit: (replyId: string, content: string) => void
  onReply: (parentReplyId: string, content: string) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(reply.content)
  const [showReplyBox, setShowReplyBox] = useState(false)
  const [replyText, setReplyText] = useState("")
  // Follow the shell locale (propagated from the side panel) so nested
  // replies re-render on language switch.
  const locale = localeProp ?? detectLocale()
  const L = t(locale)

  const handleSave = () => {
    const trimmed = editText.trim()
    if (trimmed && trimmed !== reply.content) {
      onEdit(reply.id, trimmed)
    }
    setIsEditing(false)
  }

  const handleReply = () => {
    const trimmed = replyText.trim()
    if (!trimmed) return
    onReply(reply.id, trimmed)
    setReplyText("")
    setShowReplyBox(false)
  }

  const indentClass = depth > 0 ? "ml-3 pl-3 border-l-2 border-gray-100" : ""

  return (
    <div className={`${indentClass}`}>
      <div className="bg-white rounded border border-gray-100 p-2">
        {isEditing ? (
          <div className="space-y-1">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              rows={2}
              autoFocus
            />
            <div className="flex gap-1 justify-end">
              <button
                onClick={() => { setIsEditing(false); setEditText(reply.content) }}
                className="px-1.5 py-0.5 text-[10px] text-gray-500 hover:text-gray-700 rounded border border-gray-200 hover:bg-gray-50">
                {L.cancel}
              </button>
              <button
                onClick={handleSave}
                disabled={!editText.trim()}
                className="px-1.5 py-0.5 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {L.save}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] font-medium text-gray-600">{reply.author?.name || L.anonymous}</span>
              <span className="text-[9px] text-gray-300">·</span>
              <span className="text-[10px] text-gray-400">
                {new Date(reply.createdAt).toLocaleString(locale === "zh-CN" ? "zh-CN" : "en-US")}
              </span>
            </div>
            <MarkdownContent text={reply.content} />
            <div className="flex items-center gap-3 mt-1">
              <button
                onClick={() => setShowReplyBox((v) => !v)}
                className="text-[10px] text-gray-400 hover:text-blue-600 hover:underline">
                {L.reply}
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="text-[10px] text-gray-400 hover:text-gray-600 hover:underline">
                {L.edit}
              </button>
              <button
                onClick={() => onDelete(reply.id)}
                className="text-[10px] text-red-400 hover:text-red-600 hover:underline">
                {L.delete}
              </button>
            </div>
          </>
        )}

        {showReplyBox && (
          <div className="mt-2 space-y-1">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={L.replyPlaceholder}
              className="w-full text-xs border border-gray-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              rows={2}
              autoFocus
            />
            <div className="flex gap-1 justify-end">
              <button
                onClick={() => { setShowReplyBox(false); setReplyText("") }}
                className="px-1.5 py-0.5 text-[10px] text-gray-500 hover:text-gray-700 rounded border border-gray-200 hover:bg-gray-50">
                {L.cancel}
              </button>
              <button
                onClick={handleReply}
                disabled={!replyText.trim()}
                className="px-1.5 py-0.5 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {L.send}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Nested replies */}
      {reply.replies && reply.replies.length > 0 && (
        <div className="mt-2 space-y-2">
          {reply.replies.map((child) => (
            <ReplyThread
              key={child.id}
              reply={child}
              depth={depth + 1}
              locale={locale}
              onDelete={onDelete}
              onEdit={onEdit}
              onReply={onReply}
            />
          ))}
        </div>
      )}
    </div>
  )
}
