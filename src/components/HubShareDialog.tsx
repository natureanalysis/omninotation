import { useEffect, useState } from "react"

import * as hub from "@/services/hub"
import { detectLocale, t, type Locale } from "@/services/i18n"
import type { Annotation } from "@/types"

type Feedback = { kind: "ok" | "err"; text: string } | null

/**
 * 分享对话框：把选中的批注上传为一次网页批注分享（KnoWeave `/api/webpages`）。
 *
 * 上传字段（multipart）：url / title / summary_md / visibility /
 * annotations（JSON 数组）/ page_md（完整批注 Markdown 文件，Hub 直接渲染）/
 * snapshot（可选视口截图）。
 * 公开可见性需 Hub 管理员审核通过后才会真正发布（review_status: pending → approved）。
 * 幂等键 (owner, url_hash)：同页重分享 = 整页覆盖，不会出现两个页面。
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
  // 批注勾选（默认全选）
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(annotations.map((a) => a.id))
  )
  const [withSnapshot, setWithSnapshot] = useState(true)
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
  const selected = annotations.filter((a) => selectedIds.has(a.id))
  const defaultTitle = pageTitle?.trim() || url

  const toggleAnnotation = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** 捕获当前视口截图（需 host/activeTab 权限；失败 → 降级纯文本分享）。 */
  const captureSnapshot = async (): Promise<string | null> => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.windowId) return null
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: "jpeg",
        quality: 85
      })
      return dataUrl || null
    } catch {
      return null
    }
  }

  const handleSubmit = async () => {
    if (busy || selected.length === 0) return
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
      let snapshotDataUrl: string | undefined
      if (withSnapshot) {
        snapshotDataUrl = (await captureSnapshot()) ?? undefined
        if (!snapshotDataUrl) {
          // 静默降级：截图失败不阻塞分享（hub-share-plan §5.3）
          setFeedback({ kind: "ok", text: L.hubSnapshotUnavailable })
        }
      }
      const md = hub.buildPageMarkdown({
        title: defaultTitle,
        url,
        authorName: user.username,
        annotations: selected
      })
      const { page_id } = await hub.hubCreateWebPage({
        url,
        title: defaultTitle,
        visibility,
        annotations: selected,
        summaryMd: md,
        pageMd: md,
        snapshotDataUrl
      })
      const link = await hub.hubWebPageUrl(page_id)
      await hub.addShareRecord({
        pageId: page_id,
        title: defaultTitle,
        url,
        visibility,
        createdAt: new Date().toISOString(),
        link
      })
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
        className="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl border border-slate-200 p-4 space-y-3"
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
            {/* 批注勾选（默认全选） */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-slate-400">{L.hubSharePickAnnotations}</label>
                <button
                  onClick={() =>
                    setSelectedIds((prev) =>
                      prev.size === annotations.length
                        ? new Set<string>()
                        : new Set(annotations.map((a) => a.id))
                    )
                  }
                  className="text-[10px] text-blue-600 hover:text-blue-800">
                  {selectedIds.size === annotations.length ? L.hubShareDeselectAll : L.hubShareSelectAll}
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto rounded-md border border-slate-100 divide-y divide-slate-100">
                {annotations.map((ann) => (
                  <label
                    key={ann.id}
                    className="flex items-start gap-2 px-2 py-1.5 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(ann.id)}
                      onChange={() => toggleAnnotation(ann.id)}
                      className="mt-0.5 accent-blue-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] text-slate-600 leading-snug line-clamp-2">
                        {ann.quote
                          ? `"${ann.quote.replace(/\s+/g, " ").slice(0, 80)}${ann.quote.length > 80 ? "…" : ""}"`
                          : ann.data.content
                          ? ann.data.content.replace(/\s+/g, " ").slice(0, 80)
                          : L.hubShareUntitledAnnotation}
                      </span>
                      <span className="block text-[9px] text-slate-400">
                        {ann.author.name} · {new Date(ann.createdAt).toLocaleDateString()}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-slate-400">
                {L.hubShareSelectedCount(selectedIds.size, annotations.length)}
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-slate-400">{L.hubShareVisibility}</label>
              <div className="grid grid-cols-3 gap-1">
                {visibilities.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setVisibility(key)}
                    className={`py-1 text-[10px] rounded-md border transition-colors ${
                      visibility === key
                        ? "border-blue-200 bg-blue-50 text-blue-700 font-medium"
                        : "border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {visibility === "public" && (
              <p className="text-[9px] leading-snug text-amber-600">{L.hubVisPublicNote}</p>
            )}

            <label className="flex items-center gap-1.5 text-[10px] text-slate-500 cursor-pointer">
              <input
                type="checkbox"
                checked={withSnapshot}
                onChange={(e) => setWithSnapshot(e.target.checked)}
                className="accent-blue-600"
              />
              {L.hubShareWithSnapshot}
            </label>

            <button
              onClick={handleSubmit}
              disabled={busy || selected.length === 0 || !user}
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
