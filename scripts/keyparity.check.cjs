// i18n 键位一致性校验：zh-CN 块、en 块与 TranslationKeys 接口必须完全一致。
// 任何不一致、锚点丢失或解析出空块都以非零退出码失败，供 npm test 使用。
const fs = require("fs")

const PATH = "src/services/i18n.ts"
const source = fs.readFileSync(PATH, "utf8")

function anchor(mark, from = 0) {
  const index = source.indexOf(mark, from)
  if (index < 0) {
    console.error(`i18n 结构已变化，找不到锚点：${mark}`)
    process.exit(1)
  }
  return index
}

const zhStart = anchor('"zh-CN": {')
const enStart = anchor("  en: {", zhStart)
const ifaceStart = anchor("export interface TranslationKeys")
const typedStart = anchor("const typedTranslations", ifaceStart)

const objectKeys = (block) => [...block.matchAll(/^ {4}(\w+)[:(]/gm)].map((m) => m[1])
const typeKeys = (block) => [...block.matchAll(/^ {2}(\w+)[:(]/gm)].map((m) => m[1])

const zh = objectKeys(source.slice(zhStart, enStart))
const en = objectKeys(source.slice(enStart, ifaceStart))
const ty = typeKeys(source.slice(ifaceStart, typedStart))

const problems = []
if (!zh.length || !en.length || !ty.length) {
  problems.push(`解析出空键块（zh ${zh.length} / en ${en.length} / type ${ty.length}）`)
}
const diff = (a, b) => a.filter((k) => !b.includes(k))
const report = (label, keys) => {
  if (keys.length) problems.push(`${label}: ${keys.join(", ")}`)
}
report("en 有而 zh 缺", diff(en, zh))
report("zh 有而 en 缺", diff(zh, en))
report("代码用到但接口未声明", diff(zh, ty))
report("接口声明了但代码没有", diff(ty, zh))
for (const [name, list] of [["zh", zh], ["en", en], ["type", ty]]) {
  const dup = [...new Set(list.filter((k, i) => list.indexOf(k) !== i))]
  if (dup.length) problems.push(`${name} 重复键: ${dup.join(", ")}`)
}

if (problems.length) {
  console.error("i18n 键位不一致：\n - " + problems.join("\n - "))
  process.exit(1)
}
console.log(`i18n 键位一致：${zh.length} 个键 × (zh-CN / en / 类型)`)
