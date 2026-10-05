# OmniNotation 隐私政策 / Privacy Policy

最后更新：2026-10-05

OmniNotation（以下简称"本扩展"）是一个网页批注工具。本政策说明本扩展处理哪些数据、如何使用、存储在哪里，以及你可以如何控制。

OmniNotation is a web annotation extension. This policy explains what data it handles, how it is used, where it is stored, and how you stay in control.

**核心承诺**：批注默认只留在你自己的浏览器里。本扩展不包含遥测、统计或广告 SDK，不会在后台上传数据；只有在你主动登录 KnoWeave 或点击"分享"之后，才会有数据离开本机。

**Core promise:** annotations stay in your own browser by default. There is no telemetry, analytics or advertising SDK, and nothing is uploaded in the background. Data leaves your device only after you explicitly sign in to KnoWeave or click "Share".

---

## 1. 我们收集与处理的数据 / Data We Handle

| 数据类型 | 产生时机 | 是否离开你的设备 |
|---|---|---|
| 批注内容、引用文本、批注颜色/样式、回复、状态 | 你主动创建批注时 | 默认**否**，仅在你点击"分享"时发送到 KnoWeave |
| 页面 URL 与标题、书签、标签、分类 | 你标注/收藏/分类页面时 | 默认**否**，仅随分享一起发送 |
| 页面截图（可选） | 分享时勾选"附带页面截图" | **否**，除非你勾选并点击分享 |
| KnoWeave 用户名与密码 | 你在"设置"中登录时 | 密码仅用于向 KnoWeave 换取访问令牌，**不会**保存在本地 |
| KnoWeave access / refresh 令牌 | 登录成功后 | 仅保存在本机扩展存储，用于后续请求鉴权 |
| 你订阅（接收）的他人批注 | 登录后自动同步 | 仅下载到你本机，不外发 |
| 扩展设置（语言、工具栏、搜索引擎等） | 你修改设置时 | **否** |

本扩展不收集：浏览历史（除你主动标注的页面 URL）、按键记录、位置信息、通讯录、健康数据、个人身份信息（除你自行填写的 KnoWeave 用户名）。

This extension does not collect browsing history (beyond the URLs you annotate), keystrokes, location, contacts, health data or personally identifying information (beyond the KnoWeave username you choose).

## 2. 数据用途 / How We Use Data

- **提供核心功能**：在你标注的页面上保存、展示、检索与导出批注。
- **账户与分享（可选）**：登录 KnoWeave 后，你可以把某页面的批注分享到该站点，供他人浏览；你也可以接收他人分享的批注。
- **不做他用**：我们不会将你的数据用于广告、画像、信用评估，也**不会出售**你的数据。

## 3. 数据存储位置 / Where Data Is Stored

- **本地**：批注、书签、分类、设置以及（登录后）访问令牌，均保存在浏览器的扩展存储（`chrome.storage.local`）中。卸载扩展即清除。
- **KnoWeave 服务器**：服务地址固定为 `https://knoweave.com`，仅使用 HTTPS 通信，本扩展不再支持填写自建或其它实例地址。
- **外发内容**：只有在你主动点击"分享"时，扩展才会上传该页面的批注、页面标题与网址，以及你勾选的 Markdown 文件与页面截图。登录后，扩展还会定期从 KnoWeave 拉取你已接收页面的批注（下行同步）。
- 账号注册在 knoweave.com 网站上完成，扩展内只提供登录；扩展不收集邮箱或手机号。

## 4. 数据共享 / Data Sharing

- 你分享到 KnoWeave 的内容，可见范围由你在分享时选择：**公开**、**持链接可见**、**关注者**或**定向**（仅指定收件人）。请据此判断是否包含敏感信息；公开分享需站点管理员审核通过后才会出现在公开列表。
- 我们不会向广告商、数据经纪商或其它第三方出售或共享你的数据。
- 除法律要求外，我们不会主动向第三方披露你的数据。

## 5. 数据保留与删除 / Retention & Deletion

- **本地数据**：卸载扩展，或在扩展内删除批注/书签即可清除；也可用"导出/导入"自行备份与迁移。
- **令牌**：在"设置 → KnoWeave 账户"中点击"退出登录"，即从本机清除访问令牌，并请求服务端吊销会话。
- **已分享内容**：可在"设置 → 我的分享"中删除，删除会同时请求 KnoWeave 移除该分享；也可直接在 KnoWeave 账户页面删除。

## 6. 用户控制 / Your Controls

- 是否登录、是否分享完全由你决定；不登录时本扩展的全部标注功能照常可用。
- 分享前可在弹窗中确认内容范围与可见性，可逐条勾选要分享的批注。
- 可随时退出登录、删除本地数据或已分享内容。

## 7. 儿童隐私 / Children's Privacy

本扩展不面向 13 岁以下儿童，也不会主动收集儿童的个人信息。

## 8. 第三方服务 / Third-Party Services

- **KnoWeave（`https://knoweave.com`）**：本扩展配套的社区分享站点，唯一的服务器端依赖；其数据处理实践由该站点的运营方负责。
- 本扩展**不加载任何远程代码**，所有逻辑均随扩展包分发。
- 除 KnoWeave 外，扩展不会主动连接其它服务；你在"多引擎搜索"中点击某个搜索引擎时，由你决定是否发起该次搜索请求。

## 9. 政策变更 / Changes

本政策如有更新，将修改本文件顶部的"最后更新"日期，并在仓库提交记录中体现。

## 10. 联系方式 / Contact

如有隐私相关问题，请通过本扩展的代码仓库提交 Issue：
<https://github.com/natureanalysis/omninotation/issues>

---

## 附：Chrome 开发者后台「隐私规范」填写要点

在 Chrome Web Store 开发者后台的 **Privacy practices（隐私规范）** 页，可按下表填写：

- **单一用途说明（Single purpose）**：为网页提供批注、标注与可选分享。
- **数据用途勾选（Data usage）**：
  - `Website content`（网站内容）— 用于核心功能（保存/展示/分享你创建的批注）。
  - `User activity`（用户活动）— 用于核心功能（记录你标注的页面）。
  - `Authentication information`（认证信息）— 仅在你登录 KnoWeave 时，用于账户鉴权。
- **声明**：勾选以下三项承诺
  - 不出售或转让用户数据给第三方（用于与核心功能无关的用途）；
  - 不将数据用于判定信用度或借贷；
  - 不将数据用于与单一用途无关的目的。
- **隐私政策 URL**：填写本文件的公开链接
  `https://github.com/natureanalysis/omninotation/blob/main/PRIVACY.md`
- **权限说明（Permission justification）**：
  - `storage`：在本地保存批注、书签与设置。
  - `activeTab` / `contextMenus` / `sidePanel`：在当前页面创建批注并提供侧边栏界面（点击工具栏图标开合侧边栏）。
  - `alarms`：登录后按周期拉取你已接收页面的批注。
  - 主机权限 `https://knoweave.com/*`：仅在用户主动登录或分享时与 KnoWeave 通信。
  - 可选主机权限 `https://*/*`、`http://*/*`：在你标注网页时按需申请，用于读写该页面的批注层。
