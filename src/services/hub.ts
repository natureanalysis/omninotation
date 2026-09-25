/**
 * Axiom Hub 客户端。
 *
 * 对接 axiom-hub 后端（Rust/axum）的鉴权与分享接口：
 *   - POST /api/auth/login     登录（返回 access JWT + refresh token）
 *   - POST /api/auth/register  注册
 *   - POST /api/auth/refresh   refresh 旋转续期
 *   - POST /api/auth/logout    吊销会话
 *   - GET  /api/auth/me        当前用户
 *   - POST /api/shares         上传分享（multipart：title/description/visibility/item_snapshot/annotations）
 *
 * 合规要点（对齐 Chrome Web Store 政策）：
 *   - 凭据只存 chrome.storage.local（MV3 service worker 无 localStorage），不明文落盘密码；
 *   - 所有请求走 HTTPS，且只访问用户在设置里确认过的 Hub 源（最小权限）；
 *   - 数据外发由用户主动点击「分享」触发，符合 axiom-hub「显式授权」红线。
 */

import type { Annotation } from "@/types"

/** 生产 Hub 站点根（nginx 子路径反代，API 前缀随之）。 */
export const DEFAULT_HUB_BASE_URL = "https://researchranked.eu.org/Axiom-hub"

const HUB_BASE_KEY = "hub_base_url"
const HUB_ACCESS_KEY = "hub_access_token"
const HUB_REFRESH_KEY = "hub_refresh_token"
const HUB_USER_KEY = "hub_user"

/** axiom-hub `PublicUser`（见 src/auth.rs）。 */
export interface HubUser {
  user_id: string
  username: string
  points: number
  contribution_points: number
  is_admin: boolean
  bio?: string | null
  avatar_url?: string | null
}

/** `POST /api/auth/login|register|refresh` 的响应体。 */
export interface HubAuthResponse {
  access_token: string
  refresh_token: string
  user: HubUser
}

export type HubVisibility = "public" | "link" | "followers" | "direct"

export interface HubShareInput {
  title: string
  description?: string
  visibility: HubVisibility
  /** 批注数组，原样序列化为 `annotations` 字段（服务端存任意 JSON）。 */
  annotations: Annotation[]
  /** 页面/条目快照，序列化为 `item_snapshot` 字段。 */
  itemSnapshot: Record<string, unknown>
  /** 定向分享（visibility=direct）的收件人，用户名或 user_id。 */
  recipients?: string[]
}

export interface HubShareResult {
  share_id: string
}

export interface HubSession {
  accessToken: string
  refreshToken: string
  user: HubUser | null
}

/** 带 HTTP 状态码的 Hub 错误，便于 UI 区分 401/402/403 等。 */
export class HubApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "HubApiError"
    this.status = status
  }
}

// ========================
// chrome.storage 读写（回调风格与 storage.ts 保持一致）
// ========================

function storageGet(keys: string | string[]): Promise<Record<string, any>> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          console.warn("[OmniNotation] hub storage get error:", chrome.runtime.lastError.message)
          resolve({})
        } else {
          resolve(result)
        }
      })
    } catch (e) {
      console.warn("[OmniNotation] hub storage get exception:", e)
      resolve({})
    }
  })
}

function storageSet(items: Record<string, any>): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(items, () => {
        if (chrome.runtime.lastError) {
          console.warn("[OmniNotation] hub storage set error:", chrome.runtime.lastError.message)
        }
        resolve()
      })
    } catch (e) {
      console.warn("[OmniNotation] hub storage set exception:", e)
      resolve()
    }
  })
}

function storageRemove(keys: string | string[]): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.remove(keys, () => resolve())
    } catch (e) {
      console.warn("[OmniNotation] hub storage remove exception:", e)
      resolve()
    }
  })
}

// ========================
// 基址配置
// ========================

export function normalizeHubBaseUrl(url: string): string {
  const trimmed = (url || "").trim()
  if (!trimmed) return DEFAULT_HUB_BASE_URL
  return trimmed.replace(/\/+$/, "")
}

export async function getHubBaseUrl(): Promise<string> {
  const result = await storageGet(HUB_BASE_KEY)
  const stored = result[HUB_BASE_KEY] as string | undefined
  return stored ? normalizeHubBaseUrl(stored) : DEFAULT_HUB_BASE_URL
}

export async function setHubBaseUrl(url: string): Promise<void> {
  await storageSet({ [HUB_BASE_KEY]: normalizeHubBaseUrl(url) })
}

/** 把基址折算成 chrome 权限通配符（如 `https://host/*`）。 */
export function hubOriginPattern(baseUrl: string): string {
  try {
    const u = new URL(normalizeHubBaseUrl(baseUrl))
    return `${u.protocol}//${u.host}/*`
  } catch {
    return "https://researchranked.eu.org/*"
  }
}

/**
 * 确认已获得目标 Hub 源的访问权限（默认域名已在 manifest 声明，通常直接通过）。
 * 自定义基址时需要用户在点击手势中授权，故应在按钮 onClick 内尽早调用。
 */
export async function ensureHubHostPermission(baseUrl?: string): Promise<boolean> {
  const base = baseUrl ?? (await getHubBaseUrl())
  const origin = hubOriginPattern(base)
  try {
    const has = await chrome.permissions.contains({ origins: [origin] })
    if (has) return true
    return await chrome.permissions.request({ origins: [origin] })
  } catch (e) {
    console.warn("[OmniNotation] hub permission request failed:", e)
    return false
  }
}

// ========================
// 会话（token）读写
// ========================

export async function getHubSession(): Promise<HubSession | null> {
  const result = await storageGet([HUB_ACCESS_KEY, HUB_REFRESH_KEY, HUB_USER_KEY])
  const accessToken = result[HUB_ACCESS_KEY] as string | undefined
  const refreshToken = result[HUB_REFRESH_KEY] as string | undefined
  if (!accessToken || !refreshToken) return null
  return {
    accessToken,
    refreshToken,
    user: (result[HUB_USER_KEY] as HubUser | undefined) ?? null
  }
}

export async function getHubUser(): Promise<HubUser | null> {
  const session = await getHubSession()
  return session?.user ?? null
}

async function saveHubSession(resp: HubAuthResponse): Promise<void> {
  await storageSet({
    [HUB_ACCESS_KEY]: resp.access_token,
    [HUB_REFRESH_KEY]: resp.refresh_token,
    [HUB_USER_KEY]: resp.user
  })
}

export async function clearHubSession(): Promise<void> {
  await storageRemove([HUB_ACCESS_KEY, HUB_REFRESH_KEY, HUB_USER_KEY])
}

// ========================
// 底层请求
// ========================

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json()
    return body?.message || body?.error || `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

/** refresh 单飞：并发的 401 只触发一次续期（refresh token 是旋转式的，并发会互相作废）。 */
let refreshInFlight: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = (async (): Promise<string | null> => {
    const session = await getHubSession()
    if (!session?.refreshToken) return null
    try {
      const base = await getHubBaseUrl()
      const res = await fetch(`${base}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: session.refreshToken })
      })
      if (!res.ok) {
        // refresh 失效（过期/被吊销）→ 清空本地会话，回到未登录态
        await clearHubSession()
        return null
      }
      const data = (await res.json()) as HubAuthResponse
      await saveHubSession(data)
      return data.access_token
    } catch {
      return null
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

/** 带 Bearer 的请求；401 时静默续期并重试一次。 */
async function authFetch(path: string, init: RequestInit = {}, allowRetry = true): Promise<Response> {
  const base = await getHubBaseUrl()
  const session = await getHubSession()
  const headers = new Headers(init.headers)
  if (session?.accessToken) headers.set("Authorization", `Bearer ${session.accessToken}`)
  const res = await fetch(`${base}${path}`, { ...init, headers })
  if (res.status === 401 && allowRetry) {
    const token = await refreshAccessToken()
    if (token) {
      const retryHeaders = new Headers(init.headers)
      retryHeaders.set("Authorization", `Bearer ${token}`)
      return fetch(`${base}${path}`, { ...init, headers: retryHeaders })
    }
  }
  return res
}

// ========================
// 鉴权
// ========================

export async function hubLogin(username: string, password: string): Promise<HubAuthResponse> {
  const base = await getHubBaseUrl()
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  })
  if (!res.ok) throw new HubApiError(res.status, await readErrorMessage(res))
  const data = (await res.json()) as HubAuthResponse
  await saveHubSession(data)
  return data
}

export async function hubRegister(
  username: string,
  password: string,
  invitationCode?: string
): Promise<HubAuthResponse> {
  const base = await getHubBaseUrl()
  const payload: Record<string, string> = { username, password }
  const code = invitationCode?.trim()
  if (code) payload.invitation_code = code
  const res = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new HubApiError(res.status, await readErrorMessage(res))
  const data = (await res.json()) as HubAuthResponse
  await saveHubSession(data)
  return data
}

export async function hubLogout(): Promise<void> {
  const session = await getHubSession()
  await clearHubSession()
  if (session?.accessToken && session.refreshToken) {
    try {
      const base = await getHubBaseUrl()
      await fetch(`${base}/api/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`
        },
        body: JSON.stringify({ refresh_token: session.refreshToken })
      })
    } catch {
      // 网络失败不影响本地登出
    }
  }
}

/** 拉取当前用户；会话失效时返回 null。 */
export async function hubMe(): Promise<HubUser | null> {
  const res = await authFetch("/api/auth/me")
  if (!res.ok) return null
  return (await res.json()) as HubUser
}

// ========================
// 分享
// ========================

export async function hubCreateShare(input: HubShareInput): Promise<HubShareResult> {
  const title = input.title.trim().slice(0, 200) || "OmniNotation"
  const fd = new FormData()
  fd.append("title", title)
  if (input.description?.trim()) fd.append("description", input.description.trim())
  fd.append("visibility", input.visibility)
  fd.append("item_snapshot", JSON.stringify(input.itemSnapshot))
  fd.append("annotations", JSON.stringify(input.annotations))
  for (const r of input.recipients ?? []) {
    if (r.trim()) fd.append("recipients", r.trim())
  }
  // 不显式设置 Content-Type，交给浏览器补 multipart boundary
  const res = await authFetch("/api/shares", { method: "POST", body: fd })
  if (!res.ok) throw new HubApiError(res.status, await readErrorMessage(res))
  return (await res.json()) as HubShareResult
}

/** 分享详情页链接（Hub 前端为 hash 路由 `#/share/:id`）。 */
export async function hubShareUrl(shareId: string): Promise<string> {
  const base = await getHubBaseUrl()
  return `${base}/#/share/${shareId}`
}