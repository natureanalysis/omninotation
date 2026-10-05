export type AnnotationType = "comment" | "edit"
export type Visibility = "private" | "public" | "group"
export type AnchorStrategy = "text-quote" | "css-selector" | "xpath"
export type MarkStyle = "highlight" | "underline" | "strikethrough" | "squiggly"
export type AnnotationStatus = "open" | "resolved"

export interface Author {
  id: string
  name: string
}

export interface TextQuoteSelector {
  exact: string
  prefix?: string
  suffix?: string
}

export interface Reply {
  id: string
  content: string
  author: Author
  parentId?: string
  createdAt: string
  replies?: Reply[]
}

export interface PositionSelector {
  x: number
  y: number
}

export interface Annotation {
  id: string
  url: string
  title?: string
  selector?: TextQuoteSelector
  position?: PositionSelector
  quote?: string
  data: {
    type: AnnotationType
    content: string
    markStyle?: MarkStyle
    color?: string
  }
  status?: AnnotationStatus
  author: Author
  createdAt: string
  updatedAt?: string
  replies?: Reply[]
  /** 来自 KnoWeave 的远程批注标识（本地自建批注无此字段）。 */
  origin?: AnnotationOrigin
}

/** 远程批注来源（见 hub-share-plan §3.3 同步语义）。 */
export interface AnnotationOrigin {
  /** Hub 页面 id（hub_web_pages.page_id）。 */
  pageId: string
  /** Hub 分享者 user_id。 */
  authorId: string
  /** Hub 端内容哈希（content_hash 变更检测）。 */
  contentHash?: string
  /** 本地 fork：用户改过内容/颜色/状态后，远端更新不再覆盖。 */
  forked?: boolean
}

export interface AnnotationEntry {
  url: string
  annotations: Annotation[]
}

export interface Group {
  id: string
  name: string
  members: Author[]
  createdAt: string
}

export interface UserProfile {
  id: string
  name: string
  avatar?: string
  createdAt: string
}

export interface DomainConfig {
  pattern: RegExp | string
  anchorStrategy: AnchorStrategy
  priority: number
  rootSelector?: string
}

export interface AnnotationPatch {
  url: string
  annotations: Annotation[]
}

export interface User {
  id: string
  name: string
  email?: string
}

export interface Tenant {
  id: string
  name: string
  domain: string
}

export interface BookmarkFolder {
  id: string
  name: string
  parentId?: string
  createdAt: string
}

export interface PageCategory {
  id: string
  name: string
  icon: string
  color: string
  description?: string
}

export interface Bookmark {
  id: string
  url: string
  title: string
  tags?: string[]
  folderId?: string
  visibility?: Visibility
  groupId?: string
  categoryId?: string
  createdAt: string
}

// ========================
// Selection Toolbar
// ========================

export type ToolbarTriggerMode = "select" | "middle-click" | "ctrl" | "alt" | "shift"
export type ToolbarLayout = "horizontal" | "grid"
export type TabOpenMode = "current" | "new-tab" | "new-background-tab" | "pinned"

export interface ToolbarSearchEngine {
  id: string
  name: string
  urlTemplate: string
  method?: "GET" | "POST"
  postArgs?: string
  favicon?: string
  enabled: boolean
}

export interface ToolbarStyle {
  backgroundColor: string
  textColor: string
  borderRadius: number
  padding: number
  buttonSize: number
  gap: number
  shadow: string
}

export interface ToolbarConfig {
  enabled: boolean
  triggerMode: ToolbarTriggerMode
  engines: ToolbarSearchEngine[]
  layout: ToolbarLayout
  showAnnotations: boolean
  showFaviconOnly: boolean
  tabOpenMode: TabOpenMode
  autoClose: boolean
  autoCloseDelay: number
  style: ToolbarStyle
  blacklist: string[]
  whitelist: string[]
}
