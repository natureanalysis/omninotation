// ========================
// 页面批注权限：可选 host 权限（https://*/* + http://*/*）
// 只能在有用户手势的扩展页面里申请：service worker 里 `permissions.request()`
// 总会被拒（“This function must be called during a user gesture”）。
// ========================

export const PAGE_ACCESS_ORIGINS = ["https://*/*", "http://*/*"]

/** 是否已获得在所有网站上批注的权限。 */
export async function hasPageAccess(): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: PAGE_ACCESS_ORIGINS })
  } catch {
    return false
  }
}

/**
 * 弹出授权框。必须在点击回调的同步调用栈里第一个 await 它——
 * 前面任何一次 await 都会让手势失效，请求被直接拒掉。
 */
export async function requestPageAccess(): Promise<boolean> {
  try {
    return await chrome.permissions.request({ origins: PAGE_ACCESS_ORIGINS })
  } catch {
    return false
  }
}
