# OmniNotation

<p align="center">
  <img src="assets/icon.png" width="96" alt="OmniNotation Logo">
</p>

<p align="center">
  <b>Universal Web Page Annotation & Bookmark Manager</b>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#development">Development</a> •
  <a href="#changelog">Changelog</a> •
  <a href="https://knoweave.com/tools/omninotation/">Website</a>
</p>

---

**English** | [中文](#中文介绍)

> **Latest Update** — See what's new in the [Changelog](#changelog).


## Overview

OmniNotation is a Chrome browser extension that turns any web page into an annotatable canvas with a powerful bookmark manager. Using Chrome's native Side Panel, it provides a seamless annotation experience without injecting intrusive UI elements into the page.

Key highlights:
- 📝 **Native Side Panel** — Uses Chrome's official `sidePanel` API for a first-class experience
- 🎯 **Persistent Text Highlights** — Anchors selections using `dom-anchor-text-quote` for robust text quote resolution across page reloads
- 🔄 **Bidirectional Navigation** — Click a highlight to open the side panel & jump to its annotation; click an annotation card to scroll to its highlight
- 🎨 **4 Highlight Styles + Per-Annotation Color** — Highlight, underline, strikethrough, squiggly underline; each annotation can have its own color
- 🌙 **Dark Mode Aware** — Highlight colors automatically deepen when the system prefers dark mode
- 📁 **Nested Bookmark Folders** — Multi-level folder organization for your annotated pages
- 🔖 **Auto-Bookmark** — Pages with annotations are automatically bookmarked
- 🏷️ **Page-Level Tags & Visibility** — Tag and control access per page, not per annotation
- 💬 **Hierarchical Replies** — Nested comment threads with full Markdown + KaTeX support
- 🧭 **SPA-Aware** — Automatically re-renders highlights on dynamic SPA navigation
- 🔍 **Smart Floating Toolbar** — Select text to pop up a toolbar with annotate, copy, and multi-engine search

## Features

| Feature | Description |
|---------|-------------|
| **Text Highlighting** | Select any text and annotate with 4 mark styles. Highlights persist across reloads using text-quote anchoring. |
| **Context Menu** | Right-click selected text to instantly highlight with your preferred style (highlight / underline / strikethrough / squiggly). |
| **Sticky Notes** | Place sticky notes anywhere on the page with a single click. |
| **Side Panel UI** | Chrome native side panel showing all annotations for the current page with Markdown & KaTeX rendering. |
| **Per-Annotation Color** | Override the global highlight color for any individual annotation. |
| **Dark Mode Adaptation** | Detects `prefers-color-scheme: dark` and automatically deepens highlight opacity for comfortable reading. |
| **Click Highlight → Open Panel** | Click any mark on the page to automatically open the side panel and scroll to the corresponding annotation. |
| **Drag & Drop Sorting** | Annotations sorted by page Y-position by default. Drag to reorder manually. Reset anytime. |
| **Nested Replies** | Reply to any comment, and reply to replies — fully hierarchical thread support. |
| **Color Picker** | 6 highlight colors (yellow/blue/green/red/purple/orange). Broadcasts to all tabs instantly. |
| **Page Tags** | Add tags to bookmarked pages for quick categorization and filtering. |
| **Bookmark Folders** | Organize bookmarked pages into nested folders via the Options dashboard. |
| **Global Search** | Search across all annotations, quotes, replies, and tags from the bookmark dashboard. |
| **SPA Support** | MutationObserver with smart re-rendering — only re-renders when highlight count mismatch is detected. |
| **Selection Toolbar** | Select text on any page to pop up a floating toolbar with annotate, **copy**, and multi-engine search options. |
| **Multi-Engine Search** | Search selected text via Google, Google Scholar, PubMed, Wikipedia, [KnoWeave](https://knoweave.com) and custom engines. Supports new-tab control and offline icon caching. |
| **Copy Selection** | One-click copy selected text from the floating toolbar. |
| **Engine Icon Management** | Search engine icons are downloaded to `assets/icons/` for offline use. Custom engines auto-download icons; manual download button available in settings. Emoji or Chinese characters can also be used as icons. |
| **Export / Import (Markdown)** | Backup and restore all your data as Markdown files. |

## Installation

### From Chrome Web Store

> _Coming soon — the extension is currently in development._

### Developer Mode (Local Install)

1. Clone this repository:
   ```bash
   git clone https://github.com/natureanalysis/omninotation.git
   cd omninotation
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   pnpm install
   ```

3. Download search engine icons:
   ```bash
   node scripts/download-engine-icons.mjs
   ```

4. Build the extension:
   ```bash
   npm run build
   # or
   pnpm build
   ```

5. Open Chrome and navigate to `chrome://extensions/`

6. Enable **Developer mode** (toggle in the top right)

7. Click **Load unpacked** and select the `build/chrome-mv3-prod` folder

8. The extension icon should appear in your toolbar. Click it to open the Side Panel.

## Usage

### Adding an Annotation

1. **Via context menu**: Select text → right-click → choose a mark style (▌ Highlight / U̲ Underline / S̶ Strikethrough / 〰 Squiggly). The side panel will open automatically.
2. **Via sticky note**: Click the "📌 Sticky" button in the side panel → click anywhere on the page to place a note.
3. **Via side panel**: Click "+ Add Annotation" to add a page-level note without text selection.

### Managing Annotations

- **Scroll to highlight**: Click any annotation card in the side panel to smoothly scroll to the corresponding text on the page.
- **Click highlight**: Click any highlighted text (`<mark>`) on the page to automatically open the side panel and scroll its card into view.
- **Reply**: Click 💬 under any annotation to add a reply. Reply to replies for nested threads.
- **Edit**: Click "Edit" on any annotation or reply to modify its content.
- **Status**: Toggle "✓ Resolved" to mark an annotation as done.
- **Color**: Click 🎨 on any annotation card to set a custom color for that specific annotation.
- **Reorder**: Drag and drop cards to customize order. Click "Reset to Page Order" to restore default sorting.

### Selection Toolbar

When you select text on any page, a floating toolbar appears near the selection:

- **Annotate**: Choose a mark style to save the selection as an annotation.
- **Copy**: One-click copy the selected text to clipboard.
- **Search**: Click any search engine icon to search the selected text. Icons are loaded from local storage for instant display.
- **Hover to keep open**: The toolbar auto-closes after a delay, but hovering over it or the selected text keeps it open.

### Search Engine Settings

Open the side panel → **Floating Menu Settings** to manage search engines:

- **Add custom engine**: Provide a name and URL template with `%s` as the query placeholder.
- **Edit engine**: Click ✎ to modify an existing engine's name, URL, or icon.
- **Download icon**: Click ⬇ to download the engine's favicon to local storage. If it fails, set a custom icon URL or use an emoji/character.
- **Reorder**: Use ↑ ↓ to change the engine order.
- **Toggle**: Check/uncheck to enable or disable an engine.

### Tags & Categories

- **Page Tags**: Click "＋ Tag" in the side panel header to add tags to the current page.
- **Page Categories**: Pick a category in the side panel's Categories tab; the toolbar icon follows the category color.
- **Sharing**: Sign in to [KnoWeave](https://knoweave.com) in the Settings tab, then share selected annotations (accounts are created on the website).

### Bookmark Dashboard

Click the 📊 button in the side panel header (or go to `chrome://extensions` → OmniNotation → Extension options) to open the Bookmark Manager:

- **Nested Folders**: Create multi-level folders to organize your bookmarked pages.
- **Move to Folder**: Use the dropdown on each bookmark to move it between folders.
- **Global Search**: Search across all annotations, quotes, replies, and tags.
- **Tag Filter**: Click tag badges to filter bookmarks by tag.
- **Jump**: Click "Jump" on any annotation to open the page and auto-scroll to the highlight.

### Backup

In the side panel footer:

- **Export Page**: Download a Markdown backup of the current page's annotations.
- **Import Page**: Restore a page's annotations from a Markdown file.
- **Export All**: Download a Markdown backup of all your data.
- **Import All**: Restore everything from a Markdown backup file.

## Development

```bash
# Download default search engine icons
node scripts/download-engine-icons.mjs

# Start development server with hot reload
npm run dev
# or
pnpm dev

# Build for production
npm run build
# or
pnpm build

# Package as a zip for distribution
npm run package
# or
pnpm package
```

> **Dev Caveat**: The extension auto-reloads on save when using `plasmo dev`. Open pages must be refreshed for the content script to be reinjected. If you see "Extension context invalidated", refresh the page.

## Project Structure

```
omninotation/
├── src/
│   ├── background/
│   │   └── index.ts              # Service worker: context menu, icon tinting, side panel open
│   ├── contents/
│   │   └── omninotation.tsx      # Content script: highlight injection, SPA observer, sticky notes
│   ├── components/
│   │   ├── AnnotationCard.tsx    # Single annotation card (side panel)
│   │   ├── MarkdownContent.tsx   # Markdown + KaTeX renderer (sanitized before insert)
│   │   ├── MarkdownEditor.tsx    # Markdown editor with optional live preview
│   │   ├── CategoryPanel.tsx     # Page categories: pick, manage, auto rules
│   │   ├── CategoryIconSwatch.tsx# Canvas preview sharing the toolbar icon renderer
│   │   ├── HubAccount.tsx        # KnoWeave sign-in / shares / sync
│   │   ├── HubShareDialog.tsx    # Select annotations and upload a share
│   │   ├── SelectionToolbar.tsx  # Floating toolbar on text selection (annotate / copy / search)
│   │   └── ToolbarSettings.tsx   # Floating toolbar settings (engines, style, triggers)
│   ├── services/
│   │   ├── storage.ts            # Chrome storage abstraction
│   │   ├── anchor.ts             # dom-anchor-text-quote wrapper
│   │   ├── highlights.ts         # DOM highlight rendering & lifecycle
│   │   ├── color.ts              # Color presets, dark mode, engine icon mapping
│   │   ├── config.ts             # Domain-specific config
│   │   └── engines.json          # Default search engine definitions
│   ├── types/
│   │   └── index.ts              # TypeScript interfaces
│   ├── sidepanel.tsx             # Chrome native side panel UI
│   ├── options.tsx               # Bookmark manager / dashboard
│   └── style.css                 # Tailwind + custom styles
├── assets/
│   ├── icon.png                  # Extension icon
│   └── icons/                    # Downloaded search engine favicons
├── scripts/
│   └── download-engine-icons.mjs # Download default engine favicons to assets/icons/
├── build/                        # Build output
└── package.json
```

## Tech Stack

- [Plasmo](https://www.plasmo.com/) — Browser extension framework
- [React 18](https://react.dev/) — UI library
- [TypeScript](https://www.typescriptlang.org/) — Type safety
- [Tailwind CSS](https://tailwindcss.com/) — Utility-first CSS
- [marked](https://marked.js.org/) — Markdown rendering
- [KaTeX](https://katex.org/) — Math formula rendering
- [dom-anchor-text-quote](https://github.com/tilgovi/dom-anchor-text-quote) — Robust text anchoring

## License

MIT License © OmniNotation Team

---

<a name="中文介绍"></a>

## 中文介绍

OmniNotation 是一款 Chrome 浏览器扩展，将任意网页变成可批注的画布，并内置多级文件夹收藏夹管理器。它使用 Chrome 原生 Side Panel，提供不侵入页面的无缝批注体验。

### 核心功能

| 功能 | 说明 |
|------|------|
| **文本高亮** | 选中任意文本即可添加批注，支持 4 种标记样式。使用文本锚索技术持久化，刷新后仍可恢复 |
| **右键菜单** | 右键选中文字，直接选择高亮/下划线/删除线/波浪线样式保存 |
| **便签** | 点击侧边栏"📌 便签" → 在页面任意位置单击即可放置便签 |
| **原生侧边栏** | 使用 Chrome 官方 `sidePanel` API，布局紧凑高效 |
| **点击高亮打开侧边栏** | 点击页面上的高亮标记，自动打开侧边栏并定位到对应批注 |
| **双向导航** | 点击批注卡片 → 页面滚动到高亮处；点击高亮 → 侧边栏打开并定位 |
| **层级回复** | 支持评论嵌套，可回复任意层级的评论 |
| **拖拽排序** | 默认按文本在页面中的出现位置排序，也支持手动拖拽自定义顺序 |
| **4 种标记样式** | 高亮、下划线、删除线、波浪线 |
| **单个批注颜色** | 每个批注可独立设置颜色，覆盖全局高亮色 |
| **6 种高亮颜色** | 黄/蓝/绿/红/紫/橙，实时同步到所有标签页 |
| **暗色模式适配** | 检测系统暗色模式，高亮颜色自动加深，保护视力 |
| **页面标签** | 为收藏页面添加标签，便于分类检索 |
| **多级收藏夹** | 在选项页中用文件夹组织收藏页面，支持无限嵌套 |
| **全局搜索** | 在收藏夹中跨页面搜索批注内容、引用、回复和标签 |
| **浮动工具栏** | 选中文字弹出工具栏，支持标注、复制、多引擎搜索 |
| **搜索引擎管理** | 内置 Google、Google Scholar、PubMed、维基百科、[KnoWeave](https://knoweave.com) 等引擎，支持自定义，图标自动下载到本地，也可用 Emoji/汉字替代 |
| **导出/导入 (Markdown)** | Markdown 格式备份与恢复，便于阅读和版本控制 |
| **SPA 适配** | 智能检测单页应用导航，仅在必要时重新渲染高亮 |

### 快速开始

```bash
git clone https://github.com/natureanalysis/omninotation.git
cd omninotation
npm install
node scripts/download-engine-icons.mjs
npm run build
```

然后在 Chrome 中加载 `build/chrome-mv3-prod` 目录。

### 使用说明

**添加批注**：
- 选中网页文字 → 右键选择标记样式 → 自动保存并打开侧边栏
- 或点击侧边栏"📌 便签" → 在页面任意位置单击放置
- 或在侧边栏点击 "+ 添加批注" 添加页面级笔记

**管理批注**：
- 点击侧边栏中的批注卡片 → 页面自动滚动到对应高亮文字
- 点击页面上的高亮/下划线等标记 → 自动打开侧边栏并定位到该批注
- 点击 💬 可添加评论，支持回复嵌套评论
- 点击 🎨 可为单个批注设置独立颜色
- 拖拽卡片可自定义排序，点击"重置为页面顺序"恢复默认

**浮动工具栏**：
- 选中文字后，工具栏自动出现在选区附近
- 点击标注样式保存选区；点击 📋 一键复制；点击搜索引擎图标跳转搜索
- 鼠标悬停在工具栏或选区上可阻止自动关闭

**搜索引擎设置**：
- 打开侧边栏 →「浮动菜单设置」
- 支持添加、编辑、删除、排序搜索引擎
- 点击 ⬇ 下载图标到本地；失败时可手动设置图标 URL 或使用 Emoji/汉字

**标签与分类**：
- 点击"＋ 标签"为当前页面添加标签
- 在侧边栏「分类」页选择页面分类，工具栏图标随之变色
- 在「设置」里登录 [KnoWeave](https://knoweave.com) 后可勾选分享批注（注册账号在网站上完成）

**收藏夹仪表盘**：
- 点击侧边栏 📊 按钮打开收藏夹管理器
- 左侧可创建多级文件夹，右侧可将收藏移动到指定文件夹
- 支持按标签、关键词、可见性筛选
- 点击批注的"跳转"可打开网页并自动滚动到对应位置

**备份**：
- 侧边栏底部「导出页面/导出全部」下载 Markdown 备份
-「导入页面/导入全部」从 Markdown 文件恢复数据

### 技术栈

Plasmo + React 18 + TypeScript + Tailwind CSS + marked + KaTeX + dom-anchor-text-quote

---

<a name="changelog"></a>

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for full release notes.

### v0.2.0 — 浮动工具栏 & 标注增强

- **SelectionToolbar 全面增强**：新增复制按钮、搜索引擎图标本地优先、Favicon 内存缓存、图标自动下载、文字图标替代、允许修改已有引擎、新增 PubMed & 江南知识库。
- **单个批注颜色**：支持为每个批注独立设置颜色。
- **暗色模式**：检测系统 `prefers-color-scheme`，高亮颜色自动加深。
- **侧边栏 UI 优化**：更紧凑的头部、智能标签区、精简颜色选择器、整合搜索与添加区、sticky 列表头、简化 Footer。
- **导入导出**：从 JSON 改为 Markdown 格式。
- **代码质量**：清理调试语句，引擎配置统一化。

### v0.1.0 — 初始版本

- 支持文本高亮、下划线、删除线、波浪线四种标注样式。
- 支持 Chrome 原生 Side Panel、上下文菜单、便签、层级回复。
- 支持多引擎搜索浮动工具栏、书签文件夹管理、全局搜索。
