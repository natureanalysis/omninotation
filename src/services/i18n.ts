// ========================
// i18n – Bilingual Support (CN / EN)
// ========================

export type Locale = "zh-CN" | "en"

const translations = {
  "zh-CN": {
    // SelectionToolbar
    highlight: "高亮",
    underline: "下划线",
    strikethrough: "删除线",
    squiggly: "波浪线",
    color: "颜色",
    defaultColor: "默认",
    customColor: "自定义",
    addComment: "添加批注",
    copy: "复制",
    copySuccess: "已复制",
    commentPlaceholder: "输入批注内容...",
    back: "返回",
    save: "保存",
    anchorFailed: "定位失败，请尝试选择更多上下文。",
    searchIn: (name: string) => `在 ${name} 搜索`,

    // ActionMenu
    markdownSupported: "支持 Markdown 格式",
    addAnnotationPlaceholder: "添加批注...",
    proposeEditPlaceholder: "提议修改...",
    name: "名称",
    cancel: "取消",

    // Sidebar
    closeSidebar: "关闭侧边栏",
    filterAll: "全部",
    filterComment: "批注",
    filterEdit: "修改",
    noAnnotations: "暂无批注",
    annotationCount: (n: number) => `本页共 ${n} 条批注`,
    delete: "删除",

    // AnnotationCard
    stickyNote: "便签",
    markHighlight: "高亮",
    markUnderline: "下划线",
    markStrikethrough: "删除",
    markSquiggly: "波浪",
    resolved: "已解决",
    markPending: "标记为待处理",
    markResolved: "标记为已解决",
    undo: "撤销",
    resolve: "解决",
    edit: "编辑",
    mdBold: "加粗",
    mdItalic: "斜体",
    mdStrikethrough: "删除线",
    mdHeading: "标题",
    mdBulletList: "无序列表",
    mdOrderedList: "有序列表",
    mdQuote: "引用",
    mdInlineCode: "行内代码",
    mdCodeBlock: "代码块",
    mdLink: "链接",
    mdDivider: "分隔线",
    addCommentMarkdown: "添加评论（支持完整 Markdown）",
    send: "发送",
    addCommentBtn: "添加评论",
    clickToJump: "点击跳转到网页对应位置",
    reply: "回复",

    // ReplyThread
    anonymous: "匿名",
    replyPlaceholder: "回复这条评论...",

    // omninotation.tsx
    extensionReloaded: "扩展已重新加载，请刷新页面以继续使用。",
    stickyModeTooltip: "点击页面任意位置放置便签",

    // sidepanel.tsx
    untitledPage: "未命名页面",
    unselectedPage: "未选择页面",
    tabNotes: "批注",
    tabCategories: "分类",
    tabSettings: "设置",
    categories: "分类",
    pageCategory: "本页分类",
    catAuto: "自动",
    catNone: "无",
    catAutoHint: "按分类的自动规则决定；本页暂无命中的规则。",
    catNoneHint: "本页已设为「不标注」，自动规则不会生效。",
    catManualHint: (name: string) => `已手动指定为「${name}」`,
    catAutoMatched: (name: string) => `命中自动规则，已归入「${name}」`,
    manageCategories: "管理分类",
    catName: "名称",
    catColor: "颜色",
    catIcon: "图标",
    catAutoRule: "自动规则",
    catRuleNone: "不自动",
    catRuleHasAnnotations: "有批注时",
    catRuleHasComments: "有批注内容时",
    addCategory: "添加分类",
    catAnnotatedCount: (n: number) => `本页有 ${n} 条批注`,
    catUntitled: "未命名分类",
    catEmptyHint: "还没有分类，先在下方添加一个。",
    catQuickClassify: "书签分类",
    catSuggested: "建议",
    catApply: "应用",
    catClear: "清除",
    catUnspecified: "未指定",
    openDashboard: "打开仪表盘",
    unbookmark: "取消收藏",
    bookmark: "收藏此页面",
    tagPlaceholder: "标签",
    pagePermission: "页面权限:",
    visibilityPrivate: "仅自己",
    visibilityPublic: "公开",
    visibilityGroup: "群组",
    selectGroup: "选择群组...",
    highlightColor: "高亮颜色:",
    pageNotePlaceholder: "写下你对这个网页的批注（支持完整 Markdown）",
    addNote: "+ 添加批注",
    stickyNoteBtn: "📌 便签",
    searchNotePlaceholder: "搜索批注内容、引用或评论...",
    searchSyntaxHint: "语法: tag:标签 type:comment|edit style:highlight|underline|strikethrough|squiggly status:resolved|open site:域名",
    searchResults: (n: number) => `找到 ${n} 条结果`,
    customSort: "自定义排序",
    positionSort: "按页面位置排序",
    resetToPositionSort: "重置为页面顺序",
    noMatchResults: "无匹配结果",
    noNotesAddPrompt: "暂无批注，点击上方按钮添加",
    selectTabPrompt: "请在浏览器中选择标签页",
    pageNoteCount: (n: number) => `本页共 ${n} 条批注`,
    exportBtn: "📤 导出",
    importBtn: "📥 导入",
    addTag: "＋ 标签",
    cannotCommunicate: "无法与页面通信，请刷新后重试",
    invalidImportError: "文件格式错误：无法识别有效的批注数据",
    importConfirm: "导入将覆盖当前所有数据，确定继续？",
    importSuccess: "导入成功！",
    importFailed: (msg: string) => `导入失败：${msg}`,
    exportPage: "📤 导出本页",
    importPage: "📥 导入到本页",
    importPageSuccess: "本页批注导入成功！",
    importPageFail: "未找到有效的批注数据。",
    importPageConfirm: "导入将覆盖当前页面的批注，确定继续？",

    // options.tsx
    allBookmarks: "所有收藏",
    deleteFolderConfirm: "确定删除此文件夹？其中的收藏将移至根目录。",
    bookmarksTitle: "OmniNotation 收藏夹",
    refresh: "🔄 刷新",
    totalBookmarks: (n: number) => `共 ${n} 个收藏`,
    totalAnnotations: (n: number) => `共 ${n} 条批注`,
    folderCount: (n: number) => `${n} 个文件夹`,
    searchPlaceholder: "搜索批注内容、引用或评论...",
    tagLabel: "标签:",
    newFolder: "＋ 新建",
    allBookmarksFolder: "📂 所有收藏",
    folderNamePlaceholder: "文件夹名称",
    rootDirectory: "根目录",
    create: "创建",
    loading: "加载中...",
    noBookmarks: "暂无收藏",
    open: "打开",
    annotationsCount: (n: number) => `${n} 条批注`,
    jump: "跳转",
    replyCount: (n: number) => `${n} 条回复`,
    uncategorized: "未分类",
    categoryManual: "手动",
    categoryFilter: "分类筛选：",
    foundAnnotations: (n: number) => `找到 ${n} 条批注`,

    // background/index.ts
    contextMenuHighlight: "▌ 高亮",
    contextMenuUnderline: "U̲ 下划线",
    contextMenuStrikethrough: "S̶ 删除线",
    contextMenuSquiggly: "〰 波浪线",
    contextMenuDelete: "删除此批注",

    // GroupManager.tsx
    groupManagement: (n: number) => `群组管理 (${n})`,
    noGroups: "暂无群组",
    newGroupNamePlaceholder: "新群组名称",

    // ToolbarSettings.tsx
    floatingMenuSettings: "🛠️ 浮动菜单设置",
    enableFloatingMenu: "启用浮动菜单",
    triggerMode: "触发方式:",
    triggerSelect: "选中即弹出",
    triggerMiddleClick: "点击中键弹出",
    triggerCtrl: "按住 Ctrl + 选中",
    triggerAlt: "按住 Alt + 选中",
    triggerShift: "按住 Shift + 选中",
    layout: "布局:",
    layoutHorizontal: "水平列表",
    layoutGrid: "网格",
    openMode: "打开方式:",
    openNewTab: "新标签页",
    openNewBackgroundTab: "新后台标签页",
    openCurrent: "当前页面",
    openPinned: "固定标签页",
    showAnnotationButtons: "显示标注按钮",
    showFaviconOnly: "仅显示网站图标",
    autoCloseAfterSearch: "搜索后自动关闭",
    autoCloseDelay: (s: number) => `自动关闭延迟: ${s}秒`,
    appearanceStyle: "外观样式",
    backgroundColor: "背景色",
    textColor: "文字色",
    borderRadius: (v: number) => `圆角 (${v}px)`,
    buttonSize: (v: number) => `按钮大小 (${v}px)`,
    gap: (v: number) => `间距 (${v}px)`,
    padding: (v: number) => `内边距 (${v}px)`,
    shadowCss: "阴影 CSS",
    searchEngines: "搜索引擎",
    moveUp: "上移",
    moveDown: "下移",
    engineNamePlaceholder: "名称",
    engineUrlPlaceholder: "URL (含 %s 或 {POSTARGS})",
    engineIconPlaceholder: "图标 (文字/emoji/URL)",
    add: "添加",
    blacklistWhitelist: "黑白名单",
    blacklist: "黑名单 (每行一个域名，如 example.com)",
    whitelist: "白名单 (留空表示全部允许)",
    applyLists: "应用名单",
    resetToDefault: "恢复默认配置",
    urlMustStartWithHttp: "搜索 URL 必须以 http:// 或 https:// 开头",
    urlMustContainPlaceholder: "搜索 URL 必须包含 %s 或 {POSTARGS}",
    resetConfirm: "确定要重置为默认配置吗？",
    seconds: "秒",
    languageLabel: "语言",

    // MarkdownEditor (adjustable height + live preview)
    livePreview: "实时预览",
    hidePreview: "隐藏预览",
    previewEmpty: "输入内容后，这里会实时显示渲染效果",
    resizeEditor: "拖动调整编辑器高度",
    // ToolbarSettings.tsx
    downloadIcon: "下载图标",
    // author name used when creating annotations/replies
    me: "我",
    // AnnotationMarker.tsx – “Comment by Alice” / “批注 · Alice”
    annotationBy: (kind: string, name: string) => `${kind} · ${name}`,
    // Markdown export (storage.ts)
    exportPageHeader: "页面",
    exportTags: "标签",
    exportReplies: "回复",
    // background/index.ts – context menu on links
    contextMenuCopyLinkName: "复制链接名称"
  },
  en: {
    // SelectionToolbar
    highlight: "Highlight",
    underline: "Underline",
    strikethrough: "Strikethrough",
    squiggly: "Squiggly",
    color: "Color",
    defaultColor: "Default",
    customColor: "Custom",
    addComment: "Add Note",
    copy: "Copy",
    copySuccess: "Copied",
    commentPlaceholder: "Type your note...",
    back: "Back",
    save: "Save",
    anchorFailed: "Anchor failed. Try selecting more context.",
    searchIn: (name: string) => `Search on ${name}`,

    // ActionMenu
    markdownSupported: "Markdown formatting supported",
    addAnnotationPlaceholder: "Add a note...",
    proposeEditPlaceholder: "Suggest an edit...",
    name: "Name",
    cancel: "Cancel",

    // Sidebar
    closeSidebar: "Close sidebar",
    filterAll: "All",
    filterComment: "Notes",
    filterEdit: "Edits",
    noAnnotations: "No annotations yet",
    annotationCount: (n: number) => `${n} annotation${n !== 1 ? "s" : ""} on this page`,
    delete: "Delete",

    // AnnotationCard
    stickyNote: "Sticky",
    markHighlight: "Highlight",
    markUnderline: "Underline",
    markStrikethrough: "Strikethrough",
    markSquiggly: "Squiggly",
    resolved: "Resolved",
    markPending: "Mark as pending",
    markResolved: "Mark as resolved",
    undo: "Undo",
    resolve: "Resolve",
    edit: "Edit",
    mdBold: "Bold",
    mdItalic: "Italic",
    mdStrikethrough: "Strikethrough",
    mdHeading: "Heading",
    mdBulletList: "Bullet list",
    mdOrderedList: "Numbered list",
    mdQuote: "Quote",
    mdInlineCode: "Inline code",
    mdCodeBlock: "Code block",
    mdLink: "Link",
    mdDivider: "Divider",
    addCommentMarkdown: "Add a comment (full Markdown supported)",
    send: "Send",
    addCommentBtn: "Add comment",
    clickToJump: "Click to jump to the highlighted position",
    reply: "Reply",

    // ReplyThread
    anonymous: "Anonymous",
    replyPlaceholder: "Reply to this comment...",

    // omninotation.tsx
    extensionReloaded: "Extension has been reloaded. Please refresh the page to continue.",
    stickyModeTooltip: "Click anywhere on the page to place a sticky note",

    // sidepanel.tsx
    untitledPage: "Untitled Page",
    unselectedPage: "No page selected",
    tabNotes: "Notes",
    tabCategories: "Categories",
    tabSettings: "Settings",
    categories: "Categories",
    pageCategory: "Page category",
    catAuto: "Automatic",
    catNone: "None",
    catAutoHint: "This page has no matching automatic rule yet.",
    catNoneHint: "This page is excluded from automatic rules.",
    catManualHint: (name: string) => `Manually assigned to “${name}”`,
    catAutoMatched: (name: string) => `Matched an automatic rule and assigned to “${name}”`,
    manageCategories: "Manage categories",
    catName: "Name",
    catColor: "Color",
    catIcon: "Icon",
    catAutoRule: "Automatic rule",
    catRuleNone: "No automatic rule",
    catRuleHasAnnotations: "When it has annotations",
    catRuleHasComments: "When it has note content",
    addCategory: "Add category",
    catAnnotatedCount: (n: number) => `${n} annotation${n !== 1 ? "s" : ""} on this page`,
    catUntitled: "Untitled category",
    catEmptyHint: "No categories yet. Add one below.",
    catQuickClassify: "Bookmark category",
    catSuggested: "Suggested",
    catApply: "Apply",
    catClear: "Clear",
    catUnspecified: "Unspecified",
    openDashboard: "Open Dashboard",
    unbookmark: "Remove bookmark",
    bookmark: "Bookmark this page",
    tagPlaceholder: "Tag",
    pagePermission: "Page access:",
    visibilityPrivate: "Private",
    visibilityPublic: "Public",
    visibilityGroup: "Group",
    selectGroup: "Select group...",
    highlightColor: "Highlight color:",
    pageNotePlaceholder: "Write your note for this page (full Markdown supported)",
    addNote: "+ Add Note",
    stickyNoteBtn: "📌 Sticky",
    searchNotePlaceholder: "Search notes, quotes, or comments...",
    searchSyntaxHint: "Syntax: tag:tag-name type:comment|edit style:highlight|underline|strikethrough|squiggly status:resolved|open site:domain",
    searchResults: (n: number) => `Found ${n} result${n !== 1 ? "s" : ""}`,
    customSort: "Custom order",
    positionSort: "By page position",
    resetToPositionSort: "Reset to page order",
    noMatchResults: "No matches found",
    noNotesAddPrompt: "No notes yet. Click above to add one",
    selectTabPrompt: "Please select a tab in the browser",
    pageNoteCount: (n: number) => `${n} note${n !== 1 ? "s" : ""} on this page`,
    exportBtn: "📤 Export",
    importBtn: "📥 Import",
    addTag: "+ Tag",
    cannotCommunicate: "Cannot communicate with page. Please refresh and try again.",
    invalidImportError: "Invalid file format: cannot recognize valid annotation data",
    importConfirm: "Import will overwrite all current data. Continue?",
    importSuccess: "Import successful!",
    importFailed: (msg: string) => `Import failed: ${msg}`,
    exportPage: "📤 Export page",
    importPage: "📥 Import to page",
    importPageSuccess: "Page annotations imported successfully!",
    importPageFail: "No valid annotation data found.",
    importPageConfirm: "Import will overwrite this page's annotations. Continue?",

    // options.tsx
    allBookmarks: "All Bookmarks",
    deleteFolderConfirm: "Delete this folder? Bookmarks inside will be moved to root.",
    bookmarksTitle: "OmniNotation Bookmarks",
    refresh: "🔄 Refresh",
    totalBookmarks: (n: number) => `${n} bookmark${n !== 1 ? "s" : ""}`,
    totalAnnotations: (n: number) => `${n} annotation${n !== 1 ? "s" : ""}`,
    folderCount: (n: number) => `${n} folder${n !== 1 ? "s" : ""}`,
    searchPlaceholder: "Search notes, quotes, or comments...",
    tagLabel: "Tag:",
    newFolder: "+ New",
    allBookmarksFolder: "📂 All Bookmarks",
    folderNamePlaceholder: "Folder name",
    rootDirectory: "Root",
    create: "Create",
    loading: "Loading...",
    noBookmarks: "No bookmarks yet",
    open: "Open",
    annotationsCount: (n: number) => `${n} annotation${n !== 1 ? "s" : ""}`,
    jump: "Jump",
    replyCount: (n: number) => `${n} repl${n !== 1 ? "ies" : "y"}`,
    uncategorized: "Uncategorized",
    categoryManual: "Manual",
    categoryFilter: "Category filter:",
    foundAnnotations: (n: number) => `Found ${n} annotation${n !== 1 ? "s" : ""}`,

    // background/index.ts
    contextMenuHighlight: "▌ Highlight",
    contextMenuUnderline: "U̲ Underline",
    contextMenuStrikethrough: "S̶ Strikethrough",
    contextMenuSquiggly: "〰 Squiggly",
    contextMenuDelete: "Delete this annotation",

    // GroupManager.tsx
    groupManagement: (n: number) => `Groups (${n})`,
    noGroups: "No groups",
    newGroupNamePlaceholder: "New group name",

    // ToolbarSettings.tsx
    floatingMenuSettings: "🛠️ Floating Menu Settings",
    enableFloatingMenu: "Enable floating menu",
    triggerMode: "Trigger:",
    triggerSelect: "On select",
    triggerMiddleClick: "Middle click",
    triggerCtrl: "Ctrl + select",
    triggerAlt: "Alt + select",
    triggerShift: "Shift + select",
    layout: "Layout:",
    layoutHorizontal: "Horizontal",
    layoutGrid: "Grid",
    openMode: "Open mode:",
    openNewTab: "New tab",
    openNewBackgroundTab: "New background tab",
    openCurrent: "Current tab",
    openPinned: "Pinned tab",
    showAnnotationButtons: "Show annotation buttons",
    showFaviconOnly: "Show favicon only",
    autoCloseAfterSearch: "Auto-close after search",
    autoCloseDelay: (s: number) => `Auto-close delay: ${s}s`,
    appearanceStyle: "Appearance",
    backgroundColor: "Background",
    textColor: "Text color",
    borderRadius: (v: number) => `Radius (${v}px)`,
    buttonSize: (v: number) => `Button size (${v}px)`,
    gap: (v: number) => `Gap (${v}px)`,
    padding: (v: number) => `Padding (${v}px)`,
    shadowCss: "Shadow CSS",
    searchEngines: "Search Engines",
    moveUp: "Move up",
    moveDown: "Move down",
    engineNamePlaceholder: "Name",
    engineUrlPlaceholder: "URL (with %s or {POSTARGS})",
    engineIconPlaceholder: "Icon (char/emoji/URL)",
    add: "Add",
    blacklistWhitelist: "Blacklist / Whitelist",
    blacklist: "Blacklist (one domain per line, e.g. example.com)",
    whitelist: "Whitelist (leave empty to allow all)",
    applyLists: "Apply",
    resetToDefault: "Reset to default",
    urlMustStartWithHttp: "URL must start with http:// or https://",
    urlMustContainPlaceholder: "URL must contain %s or {POSTARGS}",
    resetConfirm: "Reset to default configuration?",
    seconds: "s",
    languageLabel: "Language",

    // MarkdownEditor (adjustable height + live preview)
    livePreview: "Live preview",
    hidePreview: "Hide preview",
    previewEmpty: "Rendered preview will appear here as you type",
    resizeEditor: "Drag to resize the editor",
    // ToolbarSettings.tsx
    downloadIcon: "Download icon",
    // author name used when creating annotations/replies
    me: "Me",
    // AnnotationMarker.tsx – “Comment by Alice” / “批注 · Alice”
    annotationBy: (kind: string, name: string) => `${kind} by ${name}`,
    // Markdown export (storage.ts)
    exportPageHeader: "Page",
    exportTags: "Tags",
    exportReplies: "Replies",
    // background/index.ts – context menu on links
    contextMenuCopyLinkName: "Copy Link Name"
  }
}

export interface TranslationKeys {
  highlight: string
  underline: string
  strikethrough: string
  squiggly: string
  color: string
  defaultColor: string
  customColor: string
  addComment: string
  commentPlaceholder: string
  back: string
  save: string
  anchorFailed: string
  searchIn: (name: string) => string
  markdownSupported: string
  addAnnotationPlaceholder: string
  proposeEditPlaceholder: string
  name: string
  cancel: string
  closeSidebar: string
  filterAll: string
  filterComment: string
  filterEdit: string
  noAnnotations: string
  annotationCount: (n: number) => string
  copy: string
  copySuccess: string
  delete: string
  stickyNote: string
  markHighlight: string
  markUnderline: string
  markStrikethrough: string
  markSquiggly: string
  resolved: string
  markPending: string
  markResolved: string
  undo: string
  resolve: string
  edit: string
  addCommentMarkdown: string
  mdBold: string
  mdItalic: string
  mdStrikethrough: string
  mdHeading: string
  mdBulletList: string
  mdOrderedList: string
  mdQuote: string
  mdInlineCode: string
  mdCodeBlock: string
  mdLink: string
  mdDivider: string
  send: string
  addCommentBtn: string
  clickToJump: string
  reply: string
  anonymous: string
  replyPlaceholder: string
  extensionReloaded: string
  stickyModeTooltip: string
  // sidepanel
  untitledPage: string
  unselectedPage: string
  tabNotes: string
  tabCategories: string
  tabSettings: string
  categories: string
  pageCategory: string
  catAuto: string
  catNone: string
  catAutoHint: string
  catNoneHint: string
  catManualHint: (name: string) => string
  catAutoMatched: (name: string) => string
  manageCategories: string
  catName: string
  catColor: string
  catIcon: string
  catAutoRule: string
  catRuleNone: string
  catRuleHasAnnotations: string
  catRuleHasComments: string
  addCategory: string
  catAnnotatedCount: (n: number) => string
  catUntitled: string
  catEmptyHint: string
  catQuickClassify: string
  catSuggested: string
  catApply: string
  catClear: string
  catUnspecified: string
  openDashboard: string
  unbookmark: string
  bookmark: string
  tagPlaceholder: string
  pagePermission: string
  visibilityPrivate: string
  visibilityPublic: string
  visibilityGroup: string
  selectGroup: string
  highlightColor: string
  pageNotePlaceholder: string
  addNote: string
  stickyNoteBtn: string
  searchNotePlaceholder: string
  searchSyntaxHint: string
  searchResults: (n: number) => string
  customSort: string
  positionSort: string
  resetToPositionSort: string
  noMatchResults: string
  noNotesAddPrompt: string
  selectTabPrompt: string
  pageNoteCount: (n: number) => string
  exportBtn: string
  importBtn: string
  addTag: string
  cannotCommunicate: string
  invalidImportError: string
  importConfirm: string
  importSuccess: string
  importFailed: (msg: string) => string
  exportPage: string
  importPage: string
  importPageSuccess: string
  importPageFail: string
  importPageConfirm: string
  // options
  allBookmarks: string
  deleteFolderConfirm: string
  bookmarksTitle: string
  refresh: string
  totalBookmarks: (n: number) => string
  totalAnnotations: (n: number) => string
  folderCount: (n: number) => string
  searchPlaceholder: string
  tagLabel: string
  newFolder: string
  allBookmarksFolder: string
  folderNamePlaceholder: string
  rootDirectory: string
  create: string
  loading: string
  noBookmarks: string
  open: string
  annotationsCount: (n: number) => string
  jump: string
  replyCount: (n: number) => string
  foundAnnotations: (n: number) => string
  uncategorized: string
  categoryManual: string
  categoryFilter: string
  // background
  contextMenuHighlight: string
  contextMenuUnderline: string
  contextMenuStrikethrough: string
  contextMenuSquiggly: string
  contextMenuDelete: string
  // GroupManager
  groupManagement: (n: number) => string
  noGroups: string
  newGroupNamePlaceholder: string
  // ToolbarSettings
  floatingMenuSettings: string
  enableFloatingMenu: string
  triggerMode: string
  triggerSelect: string
  triggerMiddleClick: string
  triggerCtrl: string
  triggerAlt: string
  triggerShift: string
  layout: string
  layoutHorizontal: string
  layoutGrid: string
  openMode: string
  openNewTab: string
  openNewBackgroundTab: string
  openCurrent: string
  openPinned: string
  showAnnotationButtons: string
  showFaviconOnly: string
  autoCloseAfterSearch: string
  autoCloseDelay: (s: number) => string
  appearanceStyle: string
  backgroundColor: string
  textColor: string
  borderRadius: (v: number) => string
  buttonSize: (v: number) => string
  gap: (v: number) => string
  padding: (v: number) => string
  shadowCss: string
  searchEngines: string
  moveUp: string
  moveDown: string
  engineNamePlaceholder: string
  engineUrlPlaceholder: string
  engineIconPlaceholder: string
  add: string
  blacklistWhitelist: string
  blacklist: string
  whitelist: string
  applyLists: string
  resetToDefault: string
  urlMustStartWithHttp: string
  urlMustContainPlaceholder: string
  resetConfirm: string
  seconds: string
  languageLabel: string
  // MarkdownEditor (adjustable height + live preview)
  livePreview: string
  hidePreview: string
  previewEmpty: string
  resizeEditor: string
  // ToolbarSettings.tsx
  downloadIcon: string
  // author name used when creating annotations/replies
  me: string
  // AnnotationMarker.tsx
  annotationBy: (kind: string, name: string) => string
  // Markdown export (storage.ts)
  exportPageHeader: string
  exportTags: string
  exportReplies: string
  // background/index.ts
  contextMenuCopyLinkName: string
}

const typedTranslations: Record<Locale, TranslationKeys> = translations

// Cached locale for in-memory usage (set by initLocale / setLocale)
let _currentLocale: Locale | null = null

export function detectLocale(): Locale {
  if (_currentLocale) return _currentLocale
  const lang = (typeof navigator !== "undefined" && navigator.language) || ""
  return lang.startsWith("zh") ? "zh-CN" : "en"
}

/**
 * Initialize locale from chrome.storage (call once at startup).
 * Falls back to browser language if no preference stored.
 */
export async function initLocale(): Promise<Locale> {
  try {
    const result = await new Promise<any>((resolve) => {
      chrome.storage.local.get("locale_pref", resolve)
    })
    if (result?.locale_pref === "zh-CN" || result?.locale_pref === "en") {
      _currentLocale = result.locale_pref
    } else {
      _currentLocale = detectLocale()
    }
  } catch {
    _currentLocale = detectLocale()
  }
  return _currentLocale
}

/**
 * Set and persist the locale preference.
 */
export async function setLocale(locale: Locale): Promise<void> {
  _currentLocale = locale
  try {
    await chrome.storage.local.set({ locale_pref: locale })
  } catch { /* ignore */ }
}

/**
 * Get the current locale synchronously.
 */
export function getLocale(): Locale {
  return _currentLocale || detectLocale()
}

/**
 * Resolve the locale from services (storage seeding, migration, ...).
 * Reads the persisted preference once when it has not been initialized yet,
 * so callers do not depend on a UI effect having run first.
 */
export async function ensureLocale(): Promise<Locale> {
  if (_currentLocale) return _currentLocale
  try {
    return await initLocale()
  } catch {
    return detectLocale()
  }
}

export function t(locale: Locale): TranslationKeys {
  return typedTranslations[locale]
}
