import { useEffect, useState } from "react"

import * as hub from "@/services/hub"
import { detectLocale, t, type Locale } from "@/services/i18n"

type Feedback = { kind: "ok" | "err"; text: string } | null

/**
 * 侧边栏「设置」里的 KnoWeave 账户区：登录 / 登出，注册在网站上完成。
 *
 * 凭据经 `hub.ts` 直接 POST 到固化的 knoweave.com，access/refresh token 只落 chrome.storage.local；
 * 组件自身不缓存密码。
 */
export function HubAccount({ locale: localeProp }: { locale?: Locale }) {
  const locale = localeProp ?? detectLocale()
  const L = t(locale)

  const [user, setUser] = useState<hub.HubUser | null>(null)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [history, setHistory] = useState<hub.HubShareRecord[]>([])

  useEffect(() => {
    let alive = true
    void (async () => {
      const storedUser = await hub.getHubUser()
      if (!alive) return
      setUser(storedUser)
      // 会话可能已过期：向 /api/auth/me 校验一次（离线时保持本地显示）
      if (storedUser) {
        const fresh = await hub.hubMe()
        if (alive && fresh) setUser(fresh)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    const load = async () => {
      const list = await hub.getShareHistory()
      if (alive) setHistory(list)
    }
    void load()
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === "local" && changes.hub_share_history) void load()
    }
    chrome.storage.onChanged.addListener(listener)
    return () => {
      alive = false
      chrome.storage.onChanged.removeListener(listener)
    }
  }, [])

  const handleLogin = async () => {
    if (busy) return
    const granted = await hub.ensureHubHostPermission()
    if (!granted) {
      setFeedback({ kind: "err", text: L.hubPermissionDenied })
      return
    }
    const name = username.trim()
    if (!name) {
      setFeedback({ kind: "err", text: L.hubAuthFailed(L.hubUsername) })
      return
    }
    if (password.length < 8) {
      setFeedback({ kind: "err", text: L.hubAuthFailed(L.hubPasswordPlaceholder) })
      return
    }
    setBusy(true)
    setFeedback(null)
    try {
      const resp = await hub.hubLogin(name, password)
      setUser(resp.user)
      setPassword("")
      setFeedback({ kind: "ok", text: L.hubLoginSuccess })
    } catch (e) {
      setFeedback({ kind: "err", text: L.hubAuthFailed(e instanceof Error ? e.message : String(e)) })
    } finally {
      setBusy(false)
    }
  }

  const handleLogout = async () => {
    if (busy) return
    setBusy(true)
    try {
      await hub.hubLogout()
      setUser(null)
      setFeedback(null)
    } finally {
      setBusy(false)
    }
  }

  const handleOpenSignup = () => {
    chrome.tabs.create({ url: hub.HUB_SIGNUP_URL }).catch(() => {})
  }

  const handleOpenShare = (record: hub.HubShareRecord) => {
    chrome.tabs.create({ url: record.link }).catch(() => {})
  }

  const handleDeleteShare = async (record: hub.HubShareRecord) => {
    if (busy) return
    if (!window.confirm(L.hubDeleteShareConfirm)) return
    setBusy(true)
    try {
      // 服务端可能已不存在（404），本地记录仍要清掉
      await hub.hubDeleteWebPage(record.pageId)
    } catch {
      // 忽略远端错误，保留本地清理
    } finally {
      await hub.removeShareRecord(record.pageId)
      setHistory((prev) => prev.filter((r) => r.pageId !== record.pageId))
      setFeedback({ kind: "ok", text: L.hubShareDeleted })
      setBusy(false)
    }
  }

  /** 手动触发一次「接收的批注」同步（走后台 service worker）。 */
  const handleSyncNow = async () => {
    if (busy) return
    setBusy(true)
    setFeedback(null)
    try {
      const resp = await chrome.runtime.sendMessage({ type: "HUB_SYNC_NOW" })
      if (resp?.status === "ok") {
        setFeedback({ kind: "ok", text: L.hubSyncDone })
      } else if (resp?.status === "skipped") {
        setFeedback({ kind: "err", text: L.hubNeedLogin })
      } else {
        setFeedback({ kind: "err", text: L.hubSyncFailed(resp?.status || "network") })
      }
    } catch (e) {
      setFeedback({
        kind: "err",
        text: L.hubSyncFailed(e instanceof Error ? e.message : String(e))
      })
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    "w-full text-[11px] border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-300"

  return (
    <div className="mx-3 mt-3 rounded-xl border border-slate-200 bg-white p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-700">{L.hubSectionTitle}</span>
        <span className="text-[10px] text-slate-400">
          {user ? L.hubLoggedInAs(user.username) : L.hubNotLoggedIn}
        </span>
      </div>

      {user ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5">
            <span className="h-6 w-6 shrink-0 rounded-full bg-blue-100 text-blue-700 text-[11px] font-semibold flex items-center justify-center">
              {user.username.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-slate-700 truncate">{user.username}</p>
              <p className="text-[10px] text-slate-400">
                {user.points} · {user.contribution_points}
              </p>
            </div>
          </div>
          <button
            onClick={handleSyncNow}
            disabled={busy}
            title={L.hubSyncNowTitle}
            className="w-full py-1.5 text-[11px] font-medium rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-50 transition-colors">
            {busy ? L.hubSyncing : L.hubSyncNow}
          </button>
          <button
            onClick={handleLogout}
            disabled={busy}
            className="w-full py-1.5 text-[11px] font-medium rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors">
            {L.hubLogout}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] text-slate-400 leading-snug">{L.hubAccountHint}</p>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={L.hubUsernamePlaceholder}
            autoComplete="username"
            className={inputCls}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={L.hubPasswordPlaceholder}
            autoComplete="current-password"
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleLogin()
            }}
            className={inputCls}
          />
          <button
            onClick={handleLogin}
            disabled={busy}
            className="w-full py-1.5 text-[11px] font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {busy ? L.hubSigningIn : L.hubLogin}
          </button>
          <button
            onClick={handleOpenSignup}
            className="w-full py-1 text-[10px] text-blue-600 hover:text-blue-800 hover:underline underline-offset-2">
            {L.hubRegisterOnSite}
          </button>
        </div>
      )}

      <div className="space-y-1 pt-1 border-t border-slate-100">
        <span className="text-[10px] text-slate-400">{L.hubMyShares}</span>
        {history.length === 0 ? (
          <p className="text-[10px] text-slate-300">{L.hubNoShares}</p>
        ) : (
          <ul className="space-y-1">
            {history.map((record) => (
              <li
                key={record.pageId}
                className="flex items-center gap-1 rounded-md border border-slate-100 bg-slate-50/60 px-2 py-1">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-slate-600 truncate" title={record.title}>
                    {record.title}
                  </p>
                  <p className="text-[9px] text-slate-400">
                    {record.visibility} · {new Date(record.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleOpenShare(record)}
                  title={L.hubOpenShare}
                  className="shrink-0 text-[10px] text-slate-400 hover:text-blue-600 px-1">
                  ↗
                </button>
                <button
                  onClick={() => handleDeleteShare(record)}
                  disabled={busy}
                  title={L.hubDeleteShare}
                  className="shrink-0 text-[10px] text-slate-400 hover:text-red-500 px-1 disabled:opacity-40">
                  🗑
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {feedback && (
        <p
          className={`text-[10px] leading-snug ${feedback.kind === "ok" ? "text-green-600" : "text-red-500"}`}>
          {feedback.text}
        </p>
      )}
      <div className="flex items-start gap-2">
        <p className="text-[9px] text-slate-400 leading-snug flex-1">{L.hubPrivacyNote}</p>
        <button
          onClick={() => chrome.tabs.create({ url: hub.PRIVACY_POLICY_URL }).catch(() => {})}
          className="shrink-0 text-[9px] text-blue-500 hover:text-blue-700 hover:underline">
          {L.hubPrivacyPolicy}
        </button>
      </div>
    </div>
  )
}