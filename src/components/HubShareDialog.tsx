import { useEffect, useState } from "react"

import * as hub from "@/services/hub"
import { detectLocale, t, type Locale } from "@/services/i18n"
import type { Annotation } from "@/types"

type Feedback = { kind: "ok" | "err"; text: string } | null

/**
 * 分享对话框：把一批批注（整页或单条）作为一次 share 上传到 Axiom Hub。
 *
 * 上传字段对齐 `POST /api/shares`（multipart）：title / description / visibility /
 * item_snapshot / annotations。不含附件，故不涉及 files / file_meta。
 */
export function HubShareDialog({
  url,
  pageTitle,
  annotations,
  locale: localeProp,
  onClose
}: {
  url: string
  pageTitle?: string
  annotations: Annotation[]
  locale?: Locale
  onClose: () => void
}) {
  const locale = localeProp ?? detectLocale()
  const L = t(locale)

  const [user, setUser] = useState<hub.HubUser | null>(null)
  const [ready, setReady] = useState(false)
  const [visibility, setVisibility] = useState<hub.HubVisibility>("link")
  const [description, setDescription] = useState("")
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [shareLink, setShareLink] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const u = await hub.getHubUser()
      if (!alive) return
      setUser(u)
      setReady(true)
    })()
    return () => {
      alive = false
    }
  }, [])

  const isEmpty = annotations.length === 0
  const defaultTitle = pageTitle?.trim() || url

  const handleSubmit = async () => {
    if (busy || isEmpty) return
    if (!user) {
      setFeedback({ kind: "err", text: L.hubNeedLogin })
      return
    }
    const granted = await hub.ensureHubHostPermission()
    if (!granted) {
      setFeedback({ kind: "err", text: L.hubPermissionDenied })
      return
    }
    setBusy(true)
    setFeedback(null)
    try {
      const { share_id } = await hub.hubCreateShare({
        title: defaultTitle,
        description,
        visibility,
        annotations,
        itemSnapshot: {
          url,
          title: defaultTitle,
          annotationCount: annotations.length,
          exportedAt: new Date().toISOString(),
          source: "omninotation"
        }
      })
      const link = await hub.hubShareUrl(share_id)
      setShareLink(link)
      setFeedback({ kind: "ok", text: L.hubShareSuccess })
    } catch (e) {
      setFeedback({ kind: "err", text: L.hubShareFailed(e instanceof Error ? e.message : String(e)) })
    } finally {
      setBusy(false)
    }
  }

  const handleCopy = () => {
    if (!shareLink) return
    navigator.clipboard.writeText(shareLink).catch(() => {})
  }

  const handleOpen = () => {
    if (!shareLink) return
    chrome.tabs.create({ url: shareLink }).catch(() => {})
  }

  const visibilities: { key: hub.HubVisibility; label: string }[] = [
    { key: "public", label: L.hubVisPublic },
    { key: "link", label: L.hubVisLink },
    { key: "followers", label: L.hubVisFollowers }
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4"
      onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl bg-white shadow-xl border border-slate-200 p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">{L.hubShareDialogTitle}</h3>
          <button
            onClick={onClose}
            aria-label={L.hubClose}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none">
            ×
          </button>
        </div>

        <p className="text-[11px] text-slate-500 leading-snug truncate" title={defaultTitle}>
          {defaultTitle}
        </p>
        <p className="text-[10px] text-slate-400">
          {annotations.length} × {L.tabNotes}
        </p>

        {ready && !user && (
          <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5">
            {L.hubNeedLogin}
          </p>
        )}

        {shareLink ? (
          <div className="space-y-2">
            <div className="flex gap-1">
              <input
                readOnly
                value={shareLink}
                className="flex-1 text-[10px] border border-slate-200 rounded-md px-2 py-1.5 bg-slate-50"
              />
              <button
                onClick={handleCopy}
                className="shrink-0 px-2 py-1 text-[10px] rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">
                {L.hubCopyShareLink}
              </button>
            </div>
            <button
              onClick={handleOpen}
              className="w-full py-1.5 text-[11px] font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
              {L.hubOpenShare}
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400">{L.hubShareVisibility}</label>
              <div className="flex gap-1">
                {visibilities.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setVisibility(key)}
                    className={`flex-1 py-1 text-[10px] rounded-md border transition-colors ${
                      visibility === key
                        ? "border-blue-200 bg-blue-50 text-blue-700 font-medium"
                        : "border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={L.hubShareDescription}
              rows={2}
              className="w-full text-[11px] border border-slate-200 rounded-md px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
            />

            {isEmpty && <p className="text-[10px] text-slate-400">{L.hubShareEmpty}</p>}

            <button
              onClick={handleSubmit}
              disabled={busy || isEmpty || !user}
              className="w-full py-1.5 text-[11px] font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {busy ? L.hubSharing : L.hubShareSubmit}
            </button>
          </>
        )}

        {feedback && (
          <p
            className={`text-[10px] leading-snug ${
              feedback.kind === "ok" ? "text-green-600" : "text-red-500"
            }`}>
            {feedback.text}
          </p>
        )}
        <p className="text-[9px] text-slate-400 leading-snug">{L.hubPrivacyNote}</p>
      </div>
    </div>
  )
}