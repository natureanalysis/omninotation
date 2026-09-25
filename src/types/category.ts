// ========================
// Axiom Capture: 网页分类（页面标注）
// 每个网页可标注一个分类；分类由「自定义名称 + 颜色 + 图标」定义。
// 打开属于某分类的网页时，工具栏图标会切换为该分类的颜色/图标。
// ========================

/** 工具栏图标内绘制的矢量字形。`none` 表示只显示纯色圆角方块。 */
export type CategoryIcon =
  | "none"
  | "comment"
  | "note"
  | "star"
  | "bookmark"
  | "flag"
  | "folder"
  | "book"
  | "check"
  | "heart"
  | "bulb"
  | "pin"

/** 自动归类规则：命中条件时无需手动指定即套用该分类。 */
export type CategoryAutoRule = "has-annotations" | "has-comments"

export interface PageCategory {
  id: string
  /** 自定义分类名称。 */
  name: string
  /** 十六进制颜色（#rrggbb）。 */
  color: string
  icon: CategoryIcon
  /** 自动规则；`null` 表示仅手动指定。 */
  autoRule: CategoryAutoRule | null
}

/** 本页分类的解析结果。 */
export interface ResolvedCategory {
  category: PageCategory | null
  /** manual = 手动指定；auto = 命中自动规则；none = 未标注。 */
  source: "manual" | "auto" | "none"
  /** 手动指定为「不标注」时为 true（会抑制自动规则）。 */
  suppressed: boolean
}

/** 页面批注统计，用于自动规则与 UI 提示。 */
export interface AnnotationStats {
  total: number
  withContent: number
}
