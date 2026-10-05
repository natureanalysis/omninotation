import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

import { installChromeMock } from "./chrome-mock.mjs"
import {
  ASSIGN_NONE,
  assignCategory,
  defaultCategories,
  getCategories,
  getAssignments,
  resolvePageCategory
} from "../src/services/categories.ts"
import { setLocale } from "../src/services/i18n.ts"

const URL = "https://example.com/a"
const KEY = "annotations:" + URL

let store = {}

beforeEach(() => {
  store = installChromeMock()
})

describe("内置分类的语言跟随", () => {
  it("按当前语言播种", async () => {
    await setLocale("zh-CN")
    const cats = await getCategories()
    assert.deepEqual(cats.map((c) => c.name), ["待读", "重要", "已读", "有批注"])
    assert.deepEqual(cats.map((c) => c.id), ["cat-to-read", "cat-important", "cat-read", "cat-annotated"])
  })

  it("切到英文后，没被用户改过名的内置分类跟着翻译", async () => {
    await setLocale("zh-CN")
    await getCategories()
    await setLocale("en")
    const cats = await getCategories()
    assert.deepEqual(cats.map((c) => c.name), ["To read", "Important", "Read", "Has notes"])
    // 落盘的也必须是英文名，否则下次读又会中文
    assert.deepEqual(store["page_categories"].map((c) => c.name), ["To read", "Important", "Read", "Has notes"])
  })

  it("用户自己改过的名字不动", async () => {
    await setLocale("zh-CN")
    await getCategories()
    store["page_categories"] = store["page_categories"].map((c) =>
      c.id === "cat-to-read" ? { ...c, name: "稍后看的" } : c
    )
    await setLocale("en")
    const cats = await getCategories()
    assert.equal(cats.find((c) => c.id === "cat-to-read").name, "稍后看的")
    assert.equal(cats.find((c) => c.id === "cat-important").name, "Important")
  })

  it("用户自建分类不受语言影响", async () => {
    await setLocale("zh-CN")
    await getCategories()
    store["page_categories"] = [...store["page_categories"], { id: "cat-x", name: "论文", color: "#123456", icon: "book", autoRule: null }]
    await setLocale("en")
    const cats = await getCategories()
    assert.equal(cats.find((c) => c.id === "cat-x").name, "论文")
  })

  it("defaultCategories 的语言参数与全局偏好互不干扰", () => {
    assert.equal(defaultCategories("en")[0].name, "To read")
    assert.equal(defaultCategories("zh-CN")[0].name, "待读")
  })
})

describe("页面分类解析", () => {
  it("手动指定优先，且「不标注」会抑制自动规则", async () => {
    await setLocale("en")
    store[KEY] = [{ id: "a1", url: URL, data: { type: "highlight", content: "" }, author: { id: "u", name: "n" }, createdAt: "2026-01-01T00:00:00.000Z" }]

    await assignCategory(URL, "cat-important")
    assert.deepEqual((await resolvePageCategory(URL)).category?.id, "cat-important")

    await assignCategory(URL, ASSIGN_NONE)
    const suppressed = await resolvePageCategory(URL)
    assert.equal(suppressed.category, null)
    assert.equal(suppressed.suppressed, true)

    await assignCategory(URL, null)
    assert.equal(await getAssignments().then((a) => URL in a), false)
    // 回到自动：有批注 → 命中 has-annotations
    assert.deepEqual((await resolvePageCategory(URL)).category?.id, "cat-annotated")
  })

  it("无批注也无指定时不标注", async () => {
    await setLocale("en")
    const resolved = await resolvePageCategory("https://example.com/empty")
    assert.equal(resolved.category, null)
    assert.equal(resolved.source, "none")
  })
})
