/**
 * Axiom Hub 客户端。
 *
 * 对接 axiom-hub 后端（Rust/axum）的鉴权与网页批注分享接口：
 *   - POST /api/auth/login              登录（返回 access JWT + refresh token）
 *   - POST /api/auth/register           注册
 *   - POST /api/auth/refresh            refresh 旋转续期
 *   - POST /api/auth/logout             吊销会话
 *   - GET  /api/auth/me                 当前用户
 *   - POST /api/webpages                创建/整页覆盖分享（multipart，幂等键 (owner, url_hash)）；
 *                                       同时附带 page_md（完整批注 Markdown 文件，Hub 详情页直接渲染并可下载）
 *   - DELETE /api/webpages/:id          撤回分享
 *   - GET  /api/webpages/subscriptions  插件拉取口（我接收的页面 + 全部批注）
 *   - GET  /api/webpages/:id/comments   页面评论（同步到本地作只读展示）
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
const HUB_SYNC_CURSOR_KEY = "hub_sync_since"

/** 视口截图上限（与 hub 端 `webpages.rs::MAX_SNAPSHOT_BYTES` 一致）。 */
export const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024

/** 附带 Markdown 文件上限（与 hub 端 `webpages.rs::MAX_PAGE_MD_BYTES` 一致）。 */
export const MAX_PAGE_MD_BYTES = 2 * 1024 * 1024

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

export type HubVisibility = "public" | "link" | "followers"

export interface HubSession {
  accessToken: string
  refreshToken: string
  user: HubUser | null
}

/** 本地保存的一条分享记录（用于「我的分享」列表与删除）。 */
export interface HubShareRecord {
  /** Hub 页面 id（`hub_web_pages.page_id`）。 */
  pageId: string
  title: string
  url: string
  visibility: HubVisibility
  createdAt: string
  link: string
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

/** 带 Bearer 的请求；401 时静默续期并重试一次（MV3 唤醒后 token 可能已过期）。 */
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
// 网页批注分享（POST /api/webpages）
// ========================

export interface HubWebPageInput {
  /** 原始页面 URL（Hub 端负责归一化为幂等键 url_hash）。 */
  url: string
  title: string
  visibility: HubVisibility
  annotations: Annotation[]
  /** 分享时生成的 Markdown 摘要（Hub 详情页展示用）。 */
  summaryMd?: string
  /** 完整批注 Markdown 文档（multipart 文件 `page_md` 上传，Hub 端可直接渲染与下载）。 */
  pageMd?: string
  /** 可选视口截图的 data URL（captureVisibleTab 产物，png/jpeg）。 */
  snapshotDataUrl?: string
}

export interface HubWebPageResult {
  page_id: string
}

/** 剥离上传批注里的本地态字段：评论归 Hub、origin 是接收端标记，均不应外发。 */
export function stripLocalAnnotationFields(ann: Annotation): Annotation {
  const { replies: _replies, origin: _origin, ...rest } = ann
  return rest
}

/** data URL → Blob（截图走 multipart `snapshot` 字段上传）。 */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

export async function hubCreateWebPage(input: HubWebPageInput): Promise<HubWebPageResult> {
  const title = input.title.trim().slice(0, 300) || "OmniNotation"
  const fd = new FormData()
  fd.append("url", input.url)
  fd.append("title", title)
  fd.append("visibility", input.visibility)
  if (input.summaryMd) fd.append("summary_md", input.summaryMd)
  if (input.pageMd) {
    const mdBlob = new Blob([input.pageMd], { type: "text/markdown" })
    if (mdBlob.size > 0 && mdBlob.size <= MAX_PAGE_MD_BYTES) {
      fd.append("page_md", mdBlob, "page.md")
    }
  }
  fd.append("annotations", JSON.stringify(input.annotations.map(stripLocalAnnotationFields)))
  if (input.snapshotDataUrl) {
    const blob = await dataUrlToBlob(input.snapshotDataUrl)
    if (blob.size > 0 && blob.size <= MAX_SNAPSHOT_BYTES) {
      fd.append("snapshot", blob, "snapshot.jpeg")
    }
  }
  // 不显式设置 Content-Type，交给浏览器补 multipart boundary
  const res = await authFetch("/api/webpages", { method: "POST", body: fd })
  if (!res.ok) throw new HubApiError(res.status, await readErrorMessage(res))
  return (await res.json()) as HubWebPageResult
}

/** 撤回一个网页分享（仅属主可删，服务端回收截图配额并级联清理）。 */
export async function hubDeleteWebPage(pageId: string): Promise<void> {
  const res = await authFetch(`/api/webpages/${encodeURIComponent(pageId)}`, { method: "DELETE" })
  if (!res.ok) throw new HubApiError(res.status, await readErrorMessage(res))
}

/** 网页分享详情页链接（Hub 前端为 hash 路由 `#/webpage/:id`）。 */
export async function hubWebPageUrl(pageId: string): Promise<string> {
  const base = await getHubBaseUrl()
  return `${base}/#/webpage/${pageId}`
}

// ========================
// Markdown 文档（分享物料：summary_md 字段 + page_md 文件，Hub 详情页直接渲染）
// ========================

/** 递归渲染回复树为嵌套引用块（depth 0 = 一级回复）。 */
function renderRepliesMd(replies: Reply[], depth: number): string[] {
  const out: string[] = []
  for (const r of replies) {
    const pad = "> ".repeat(depth + 1)
    out.push(`${pad}**${r.author.name}**：${r.content.replace(/\s+/g, " ").trim()}`)
    out.push("")
    if (r.replies?.length) out.push(...renderRepliesMd(r.replies, depth + 1))
  }
  return out
}

/**
 * 由页面批注生成完整 Markdown 文档（分享时上传为 `summary_md` 字段与
 * `page_md` 文件）。批注正文原样嵌入（正文本身是 Markdown），回复树渲染为
 * 嵌套引用。刻意不依赖 UI/i18n，保证纯函数、可单测。
 */
export function buildPageMarkdown(input: {
  title: string
  url: string
  authorName: string
  annotations: Annotation[]
}): string {
  const lines: string[] = []
  const date = new Date().toISOString().slice(0, 10)
  lines.push(`# ${input.title}`)
  lines.push("")
  lines.push(`> ${input.url} · ${input.annotations.length} 条批注 · ${input.authorName} · ${date}`)
  lines.push("")
  input.annotations.forEach((ann, i) => {
    const firstLine =
      ann.data.content.trim().split("\n")[0] ||
      (ann.data.type === "edit" ? "Edit" : "Comment")
    lines.push(`## ${i + 1}. ${firstLine}`)
    lines.push("")
    if (ann.quote) {
      const quote = ann.quote.replace(/\s+/g, " ").trim()
      const truncated = quote.length > 200 ? `${quote.slice(0, 200)}…` : quote
      lines.push(`> "${truncated}"`)
      lines.push("")
    }
    const content = ann.data.content.trim()
    if (content) {
      lines.push(content)
      lines.push("")
    }
    if (ann.replies?.length) {
      lines.push(...renderRepliesMd(ann.replies, 0))
      lines.push("")
    }
  })
  return lines.join("\n")
}

// ========================
// 接收：订阅拉取（GET /api/webpages/subscriptions）
// ========================

/** Hub 下发的一条批注（`WebAnnotationOut`）。`annotation` 与插件 Annotation 同构。 */
export interface HubRemoteAnnotation {
  annotation_id: string
  author_id: string
  author_name: string
  annotation: Annotation
  content_hash: string
}

/** 拉取口返回的一个页面（`WebPageSubscriptionItem`）。 */
export interface HubWebPageSubscription {
  page_id: string
  url: string
  title: string
  owner_username: string
  accepted_at: string
  updated_at: string
  annotations: HubRemoteAnnotation[]
}

export interface HubWebPageSubscriptionFeed {
  pages: HubWebPageSubscription[]
  /** 本次响应计算的「下次 since」游标（RFC3339）。 */
  now: string
}

/** 拉取我接收的页面与全部批注；`since`（RFC3339）缺省 = 全量。 */
export async function hubPullSubscriptions(since?: string): Promise<HubWebPageSubscriptionFeed> {
  const qs = since ? `?since=${encodeURIComponent(since)}` : ""
  const res = await authFetch(`/api/webpages/subscriptions${qs}`)
  if (!res.ok) throw new HubApiError(res.status, await readErrorMessage(res))
  return (await res.json()) as HubWebPageSubscriptionFeed
}

/** Hub 页面评论（`WebPageCommentOut`）；`annotation_id` 为 null = 对整页。 */
export interface HubWebPageComment {
  comment_id: number
  annotation_id: string | null
  user_id: string
  username: string
  content: string
  created_at: string
}

export async function hubListWebPageComments(pageId: string): Promise<HubWebPageComment[]> {
  const res = await authFetch(`/api/webpages/${encodeURIComponent(pageId)}/comments`)
  if (!res.ok) throw new HubApiError(res.status, await readErrorMessage(res))
  return (await res.json()) as HubWebPageComment[]
}

/** Hub 评论落库时间是 SQLite `datetime('now')`（UTC、空格分隔），折算成 ISO。 */
function hubTimeToIso(value: string): string {
  if (value.includes("T")) return value
  const isoish = value.replace(" ", "T")
  const d = new Date(`${isoish}Z`)
  return Number.isNaN(d.getTime()) ? value : d.toISOString()
}

/**
 * 把 Hub 评论按 `annotation_id` 分组成只读 `Reply[]`（页面级评论不落批注卡片）。
 */
export function groupHubComments(comments: HubWebPageComment[]): Record<string, Reply[]> {
  const out: Record<string, Reply[]> = {}
  for (const c of comments) {
    if (!c.annotation_id) continue
    const list = out[c.annotation_id] ?? []
    list.push({
      id: `hub-comment-${c.comment_id}`,
      content: c.content,
      author: { id: `hub:${c.user_id}`, name: c.username },
      createdAt: hubTimeToIso(c.created_at)
    })
    out[c.annotation_id] = list
  }
  return out
}

/** 增量拉取游标（MV3 service worker 会被杀，必须落盘）。 */
export async function getHubSyncCursor(): Promise<string | null> {
  const result = await storageGet(HUB_SYNC_CURSOR_KEY)
  return (result[HUB_SYNC_CURSOR_KEY] as string | undefined) ?? null
}

export async function setHubSyncCursor(rfc3339: string): Promise<void> {
  await storageSet({ [HUB_SYNC_CURSOR_KEY]: rfc3339 })
}

// ========================
// 分享历史（本地记录，离线可用）
// ========================

const HUB_SHARE_HISTORY_KEY = "hub_share_history"
const MAX_SHARE_HISTORY = 100

export async function getShareHistory(): Promise<HubShareRecord[]> {
  const result = await storageGet(HUB_SHARE_HISTORY_KEY)
  const list = result[HUB_SHARE_HISTORY_KEY] as any[] | undefined
  if (!Array.isArray(list)) return []
  // 兼容旧版 /api/shares 记录（shareId 字段）→ 统一映射为 pageId
  return list.map((r) =>
    r && typeof r === "object" && "shareId" in r && !("pageId" in r)
      ? { ...r, pageId: String(r.shareId) }
      : r
  ) as HubShareRecord[]
}

export async function addShareRecord(record: HubShareRecord): Promise<void> {
  const list = await getShareHistory()
  const next = [record, ...list.filter((r) => r.pageId !== record.pageId)].slice(
    0,
    MAX_SHARE_HISTORY
  )
  await storageSet({ [HUB_SHARE_HISTORY_KEY]: next })
}

export async function removeShareRecord(pageId: string): Promise<void> {
  const list = await getShareHistory()
  await storageSet({ [HUB_SHARE_HISTORY_KEY]: list.filter((r) => r.pageId !== pageId) })
}
