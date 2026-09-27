// Node 测试运行器的模块解析钩子（node --import ./tests/module-hooks.mjs）。
//
// Node 原生跑 TS 测试只做「类型剥离」，不理解 tsconfig paths，也不接受
// 无 import attribute 的 JSON 导入。hub.test.ts 之所以能直接跑，是因为
// hub.ts 只有 type 导入。这个钩子补齐三件事：
//   1. 把路径别名 @/…、~/…（tsconfig "paths"）映射到 src/ 下；
//   2. 为无扩展名的 TS 相对导入补全 .ts / .tsx / index.ts；
//   3. 把 .json 导入改写为等价的 ESM（export default <json>），
//      规避 `with { type: "json" }` 属性要求（Plasmo/Parcel 编译时不需要它）。
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { registerHooks } from "node:module"

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src")

/** 把别名/相对导入解析为磁盘文件；解析不了返回 null 交回默认链。 */
function resolveLocal(specifier, parentURL) {
  let base = null
  if (specifier.startsWith("@/") || specifier.startsWith("~/")) {
    base = join(srcDir, specifier.slice(2))
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    if (!parentURL) return null
    base = join(dirname(fileURLToPath(parentURL)), specifier)
  } else {
    return null
  }

  // 已带扩展名：存在就直接用；不存在按目录兜底 index。
  if (/\.(ts|tsx|json|js|mjs|css)$/.test(base)) {
    if (existsSync(base)) return base
    return existsSync(join(base, "index.ts")) ? join(base, "index.ts") : null
  }
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    `${base}.json`
  ]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith("node:")) {
      const resolved = resolveLocal(specifier, context.parentURL)
      if (resolved) {
        return { url: pathToFileURL(resolved).href, shortCircuit: true }
      }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".json")) {
      const text = readFileSync(fileURLToPath(url), "utf8")
      return { format: "module", source: `export default ${text}\n`, shortCircuit: true }
    }
    return nextLoad(url, context)
  }
})
