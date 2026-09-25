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

import type { Annotation, Reply } from "@/types"

/** 生产 Hub 站点根（nginx 子路径反代，API 前缀随之）。 */
export const DEFAULT_HUB_BASE_URL = "https://researchranked.eu.org/Axiom-hub"

/** 公开隐私政策地址（Chrome 商店「隐私规范」页需填写同一 URL）。 */
export const PRIVACY_POLICY_URL =
  "https://github.com/natureanalysis/omninotation/blob/main/PRIVACY.md"

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

/** 解析用户输入的收件人（逗号/分号/换行分隔），去空去重。 */
export function parseRecipients(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(/[\n,，;；]/)) {
    const name = part.trim()
    if (name && !seen.has(name)) {
      seen.add(name)
      out.push(name)
    }
  }
  return out
}

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
  /** 是否同时附带一份由批注生成的 Markdown 文件（作为 `files[]` 上传）。 */
  attachMarkdown?: boolean
}

export interface HubShareResult {
  share_id: string
}

/** 本地保存的一条分享记录（用于「我的分享」列表与删除）。 */
export interface HubShareRecord {
  shareId: string
  title: string
  url: string
  visibility: HubVisibility
  createdAt: string
  link: string
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

function renderRepliesMd(replies: Reply[], depth: number): string[] {
  const out: string[] = []
  const indent = "  ".repeat(depth)
  for (const r of replies) {
    out.push(`${indent}- ${r.author?.name || "Anonymous"}: ${r.content}`)
    if (r.replies?.length) out.push(...renderRepliesMd(r.replies, depth + 1))
  }
  return out
}

/**
 * 把一批批注渲染为独立 Markdown 文本（分享时可作为附件上传）。
 * 刻意不依赖 UI/i18n，保证纯函数、可单测。
 */
export function buildShareMarkdown(input: {
  title: string
  url: string
  annotations: Annotation[]
}): string {
  const lines: string[] = []
  lines.push(`# ${input.title}`)
  lines.push("")
  if (input.url) lines.push(`- URL: ${input.url}`)
  lines.push(`- Exported: ${new Date().toISOString()}`)
  lines.push(`- Annotations: ${input.annotations.length}`)
  lines.push("")
  lines.push("---")
  lines.push("")

  for (const ann of input.annotations) {
    const kind = ann.data.type === "edit" ? "Edit" : "Comment"
    const style = ann.data.markStyle ? ` (${ann.data.markStyle})` : ""
    const resolved = ann.status === "resolved" ? " [resolved]" : ""
    lines.push(`## ${kind}${style}${resolved}`)
    lines.push("")
    if (ann.quote) {
      lines.push(ann.quote.split("\n").map((line) => `> ${line}`).join("\n"))
      lines.push("")
    }
    if (ann.data.content) {
      lines.push(ann.data.content)
      lines.push("")
    }
    if (ann.author?.name) {
      lines.push(`— ${ann.author.name}, ${ann.createdAt}`)
      lines.push("")
    }
    if (ann.replies?.length) {
      lines.push("Replies:")
      lines.push("")
      lines.push(...renderRepliesMd(ann.replies, 0))
      lines.push("")
    }
    lines.push("---")
    lines.push("")
  }

  return lines.join("\n")
}

/** 由标题派生一个安全的 `.md` 附件名（服务端白名单含 md）。 */
export function shareMarkdownFileName(title: string): string {
  const base = (title || "omninotation")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
  return `${base || "omninotation"}-annotations.md`
}

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
  if (input.attachMarkdown && input.annotations.length > 0) {
    const pageUrl = typeof input.itemSnapshot.url === "string" ? input.itemSnapshot.url : ""
    const markdown = buildShareMarkdown({ title, url: pageUrl, annotations: input.annotations })
    const fileName = shareMarkdownFileName(title)
    fd.append("files", new File([markdown], fileName, { type: "text/markdown" }), fileName)
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
/** 删除一个分享（仅属主可删，服务端会回收配额并清理 blob）。 */
export async function hubDeleteShare(shareId: string): Promise<void> {
  const res = await authFetch(`/api/shares/${encodeURIComponent(shareId)}`, { method: "DELETE" })
  if (!res.ok) throw new HubApiError(res.status, await readErrorMessage(res))
}

// ========================
// 分享历史（本地记录，离线可用）
// ========================

const HUB_SHARE_HISTORY_KEY = "hub_share_history"
const MAX_SHARE_HISTORY = 100

export async function getShareHistory(): Promise<HubShareRecord[]> {
  const result = await storageGet(HUB_SHARE_HISTORY_KEY)
  const list = result[HUB_SHARE_HISTORY_KEY] as HubShareRecord[] | undefined
  return Array.isArray(list) ? list : []
}

export async function addShareRecord(record: HubShareRecord): Promise<void> {
  const list = await getShareHistory()
  const next = [record, ...list.filter((r) => r.shareId !== record.shareId)].slice(
    0,
    MAX_SHARE_HISTORY
  )
  await storageSet({ [HUB_SHARE_HISTORY_KEY]: next })
}

export async function removeShareRecord(shareId: string): Promise<void> {
  const list = await getShareHistory()
  await storageSet({ [HUB_SHARE_HISTORY_KEY]: list.filter((r) => r.shareId !== shareId) })
}