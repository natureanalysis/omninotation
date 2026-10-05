// Node 单测用的最小 chrome.storage.local 模拟。
// 真实 API 同时支持回调和 Promise 两种调用方式，这里两者都给；
// 只实现回调的话，`get(key)` 的 Promise 调用方会拿到 undefined，
// 而业务代码里的 try/catch 会把这种「读不到」伪装成空数据。
// delayMs 故意把读写拉成异步交叉，用来暴露「读-改-写」竞态。
export function installChromeMock({ initial = {}, delayMs = 0 } = {}) {
  const store = { ...initial }

  const tick = () => (delayMs ? new Promise((r) => setTimeout(r, delayMs)) : Promise.resolve())

  const pick = (keys) => {
    if (keys == null) return { ...store }
    const list = Array.isArray(keys) ? keys : [keys]
    const out = {}
    for (const k of list) if (k in store) out[k] = store[k]
    return out
  }

  globalThis.chrome = {
    storage: {
      local: {
        async get(keys, cb) {
          await tick()
          const out = pick(keys)
          if (typeof cb === "function") cb(out)
          return out
        },
        async set(items, cb) {
          await tick()
          Object.assign(store, items)
          cb?.()
        },
        async remove(keys, cb) {
          await tick()
          const list = Array.isArray(keys) ? keys : [keys]
          for (const k of list) delete store[k]
          cb?.()
        }
      },
      onChanged: { addListener() {}, removeListener() {} }
    },
    runtime: { lastError: undefined }
  }

  return store
}
