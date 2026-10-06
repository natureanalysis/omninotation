import { useEffect, useState } from "react"

import { hasPageAccess, requestPageAccess } from "@/services/access"
import { detectLocale, t, type Locale } from "@/services/i18n"

/**
 * 侧边栏「设置」里的页面批注权限卡片。
 * 授权入口必须留在这里（有用户手势的扩展页面），后台 service worker 里申请必被拒。
 */
export function PageAccess({ locale: localeProp }: { locale?: Locale }) {
  const locale = localeProp ?? detectLocale()
  const L = t(locale)
  const [granted, setGranted] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const sync = () => {
      void hasPageAccess().then((has) => {
        if (alive) setGranted(has)
      })
    }
    sync()
    // @types/chrome 的 PermissionsAddedEvent 只声明了 addListener，实际两个方法都在
    type PermEvent = { addListener(fn: () => void): void; removeListener(fn: () => void): void }
    const added = chrome.permissions.onAdded as unknown as PermEvent | undefined
    const removed = chrome.permissions.onRemoved as unknown as PermEvent | undefined
    added?.addListener(sync)
    removed?.addListener(sync)
    return () => {
      alive = false
      added?.removeListener(sync)
      removed?.removeListener(sync)
    }
  }, [])

  const handleEnable = async () => {
    setFeedback(null)
    const ok = await requestPageAccess()
    setGranted(ok)
    setFeedback(ok ? L.accessReloadNote : L.accessDeniedNote)
  }

  return (
    <div className="mx-3 mt-3 rounded-xl border border-slate-200 bg-white p-3 space-y-2">
      <span className="block text-[11px] font-semibold text-slate-700">{L.accessSectionTitle}</span>
      <p className="text-[10px] text-slate-400 leading-snug">
        {granted ? L.accessGrantedNote : L.accessMissingNote}
      </p>
      {!granted && (
        <button
          onClick={handleEnable}
          className="w-full py-1.5 text-[11px] font-medium rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors">
          {L.accessEnable}
        </button>
      )}
      {feedback && <p className="text-[10px] text-slate-400 leading-snug">{feedback}</p>}
    </div>
  )
}
