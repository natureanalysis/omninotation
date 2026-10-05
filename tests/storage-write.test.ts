import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

import { installChromeMock } from "./chrome-mock.mjs"
import {
  getAnnotations,
  getBookmarks,
  getKey,
  mergeRemoteAnnotations,
  saveAnnotation,
  updateAnnotationContent
} from "../src/services/storage.ts"
import type { RemotePageFeed } from "../src/services/storage.ts"
import type { Annotation } from "../src/types.ts"

const URL_A = "https://example.com/race"
const KEY = getKey(URL_A)

// delayMs 让每次读写都真的交叉起来：没有按 key 串行化时下面的断言必挂。
let store: Record<string, any> = {}

beforeEach(() => {
  store = installChromeMock({ delayMs: 2 })
})

function ann(id: string, partial: Partial<Annotation> = {}): Annotation {
  return {
    id,
    url: URL_A,
    quote: "quoted " + id,
    data: { type: "highlight", content: "" },
    author: { id: "u1", name: "Alice" },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial
  }
}

function remoteItem(id: string, content: string): any {
  return {
    annotation_id: id,
    author_id: "u9",
    author_name: "Bob",
    annotation: ann(id, { data: { type: "highlight", content } }),
    content_hash: "h-" + id
  }
}

describe("annotations:<url> 的并发写", () => {
  it("并行保存不同批注不会互相覆盖", async () => {
    const ids = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"]
    await Promise.all(ids.map((id) => saveAnnotation(ann(id))))

    const saved = await getAnnotations(URL_A)
    assert.deepEqual(
      saved.map((a) => a.id).sort(),
      [...ids].sort()
    )
  })

  it("自动书签在并发下也只落一条", async () => {
    await Promise.all(["a1", "a2", "a3"].map((id) => saveAnnotation(ann(id))))
    const bookmarks = await getBookmarks()
    assert.equal(bookmarks.length, 1)
    assert.equal(bookmarks[0].url, URL_A)
  })

  it("后台合并与本地编辑交叉时两边改动都保留", async () => {
    await saveAnnotation(ann("local1"))

    const feed: RemotePageFeed = {
      pageId: "page-1",
      annotations: [remoteItem("r1", "remote body"), remoteItem("r2", "remote body 2")]
    }

    await Promise.all([
      mergeRemoteAnnotations(URL_A, feed),
      saveAnnotation(ann("local2")),
      updateAnnotationContent(URL_A, "local1", "user edited")
    ])

    const saved = await getAnnotations(URL_A)
    const byId = new Map(saved.map((a) => [a.id, a]))
    assert.equal(saved.length, 4)
    assert.equal(byId.get("local1")?.data.content, "user edited")
    assert.ok(byId.has("local2"))
    assert.ok(byId.has("r1"))
    assert.ok(byId.has("r2"))
  })

  it("远程合并与本地同 id 自建批注交叉：本地后写覆盖远程，其他远程条目不丢", async () => {
    const feed: RemotePageFeed = {
      pageId: "page-1",
      annotations: [remoteItem("dup", "remote"), remoteItem("r9", "remote 9")]
    }

    // 合并先读到空快照，本地自建批注随后写入同一个 key
    await Promise.all([mergeRemoteAnnotations(URL_A, feed), saveAnnotation(ann("dup"))])

    const saved = await getAnnotations(URL_A)
    const byId = new Map(saved.map((a) => [a.id, a]))
    assert.ok(byId.has("r9"))
    assert.equal(byId.get("dup")?.origin, undefined)
    assert.equal(byId.get("dup")?.data.content, "")
  })

  it("串行化后写入仍落在同一个 key 上", async () => {
    await Promise.all([saveAnnotation(ann("a1")), saveAnnotation(ann("a2", { url: URL_A + "/" }))])
    assert.equal(store[KEY].length, 2)
  })
})
