import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

import {
  HUB_BASE_URL,
  HUB_ORIGIN_PATTERN,
  HubApiError,
  addShareRecord,
  buildPageMarkdown,
  getHubSession,
  getShareHistory,
  groupHubComments,
  hubCreateWebPage,
  hubPullSubscriptions,
  hubWebPageUrl,
  removeShareRecord,
  stripLocalAnnotationFields
} from "../src/services/hub.ts"
import type { Annotation, Reply } from "../src/types.ts"

// ─── chrome.storage.local mock ───

let store: Record<string, any> = {}

function installChromeMock(): void {
  store = {}
  ;(globalThis as any).chrome = {
    storage: {
      local: {
        get(keys: any, cb: (r: Record<string, any>) => void) {
          if (keys == null) return cb({ ...store })
          const list = Array.isArray(keys) ? keys : [keys]
          const out: Record<string, any> = {}
          for (const k of list) if (k in store) out[k] = store[k]
          cb(out)
        },
        set(items: Record<string, any>, cb?: () => void) {
          Object.assign(store, items)
          cb?.()
        },
        remove(keys: any, cb?: () => void) {
          const list = Array.isArray(keys) ? keys : [keys]
          for (const k of list) delete store[k]
          cb?.()
        }
      },
      onChanged: { addListener() {}, removeListener() {} }
    },
    runtime: { lastError: undefined },
    permissions: { contains: async () => true, request: async () => true }
  }
}

function ann(partial: Partial<Annotation> = {}): Annotation {
  return {
    id: "a1",
    url: "https://example.com/p",
    quote: "quoted text",
    data: { type: "comment", content: "hello" },
    author: { id: "u1", name: "Alice" },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial
  }
}

beforeEach(installChromeMock)

// ─── 纯函数 ───

describe("固化的 KnoWeave 地址", () => {
  it("targets knoweave.com over HTTPS", () => {
    assert.equal(HUB_BASE_URL, "https://knoweave.com")
    assert.ok(HUB_BASE_URL.startsWith("https://"))
  })

  it("declares the origin wildcard that the manifest grants", () => {
    assert.equal(HUB_ORIGIN_PATTERN, "https://knoweave.com/*")
  })
})

describe("buildPageMarkdown", () => {
  it("renders the header line with url, count, author and date", () => {
    const md = buildPageMarkdown({
      title: "My page",
      url: "https://example.com/p",
      authorName: "alice",
      annotations: [ann()]
    })
    assert.match(md, /^# My page/m)
    assert.match(md, /> https:\/\/example\.com\/p · 1 条批注 · alice · \d{4}-\d{2}-\d{2}/)
  })

  it("numbers annotations, truncates long quotes and embeds the full content", () => {
    const long = "x".repeat(300)
    const md = buildPageMarkdown({
      title: "T",
      url: "https://e.com",
      authorName: "a",
      annotations: [
        ann({ quote: long, data: { type: "edit", content: "fix\n\nsecond paragraph" } })
      ]
    })
    assert.match(md, /## 1\. fix/)
    assert.ok(md.includes(`"${"x".repeat(200)}…"`))
    assert.ok(!md.includes("x".repeat(201)))
    // 正文完整嵌入（而非只取首行）
    assert.ok(md.includes("second paragraph"))
  })

  it("renders the reply tree inline as nested quotes", () => {
    const replies: Reply[] = [
      {
        id: "r1",
        content: "top",
        author: { id: "u2", name: "Bob" },
        createdAt: "2026-01-02T00:00:00.000Z",
        replies: [
          { id: "r2", content: "nested", author: { id: "u3", name: "C" }, createdAt: "2026-01-03T00:00:00.000Z" }
        ]
      }
    ]
    const md = buildPageMarkdown({
      title: "T",
      url: "",
      authorName: "a",
      annotations: [ann({ replies })]
    })
    assert.match(md, /> \*\*Bob\*\*：top/)
    assert.match(md, />\s*>\s*\*\*C\*\*：nested/)
  })
})

describe("stripLocalAnnotationFields", () => {
  it("drops replies and origin before upload", () => {
    const input = ann({
      replies: [{ id: "r", content: "c", author: { id: "x", name: "x" }, createdAt: "2026-01-01T00:00:00.000Z" }],
      origin: { pageId: "p", authorId: "u" }
    })
    const out = stripLocalAnnotationFields(input)
    assert.equal(out.replies, undefined)
    assert.equal(out.origin, undefined)
    assert.equal(out.data.content, "hello")
  })
})

// ─── 存储 / 会话 ───

describe("hub session storage", () => {
  it("returns null session when not signed in", async () => {
    assert.equal(await getHubSession(), null)
  })
})

describe("share history", () => {
  const base = {
    title: "T",
    url: "https://p",
    visibility: "link" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    link: "https://hub/#/webpage/1"
  }

  it("starts empty", async () => {
    assert.deepEqual(await getShareHistory(), [])
  })

  it("prepends new records and de-duplicates by pageId", async () => {
    await addShareRecord({ ...base, pageId: "1" })
    await addShareRecord({ ...base, pageId: "2" })
    await addShareRecord({ ...base, pageId: "1", title: "T2" })

    const list = await getShareHistory()
    assert.equal(list.length, 2)
    assert.equal(list[0].pageId, "1")
    assert.equal(list[0].title, "T2")
  })

  it("removes a record by pageId", async () => {
    await addShareRecord({ ...base, pageId: "1" })
    await addShareRecord({ ...base, pageId: "2" })
    await removeShareRecord("1")

    const list = await getShareHistory()
    assert.deepEqual(
      list.map((r) => r.pageId),
      ["2"]
    )
  })

  it("migrates legacy shareId records to pageId on read", async () => {
    store["hub_share_history"] = [{ ...base, shareId: "legacy-1" }]
    const list = await getShareHistory()
    assert.equal(list[0].pageId, "legacy-1")
  })
})

describe("hubWebPageUrl", () => {
  it("builds a hash-route link to the webpage detail page", async () => {
    assert.equal(await hubWebPageUrl("abc"), `${HUB_BASE_URL}/#/webpage/abc`)
  })
})

// ─── 分享上传（fetch mock） ───

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

function mockFetch(handler: (url: string, init: RequestInit) => Promise<Response>): void {
  ;(globalThis as any).fetch = async (url: string, init: RequestInit) => handler(url, init)
}

describe("hubCreateWebPage", () => {
  it("sends the expected multipart fields to /api/webpages", async () => {
    let captured: { url: string; init: RequestInit } | null = null
    mockFetch(async (url, init) => {
      captured = { url, init }
      return jsonResponse({ page_id: "w1" }, 201)
    })

    const res = await hubCreateWebPage({
      url: "https://example.com/p",
      title: "My page",
      visibility: "link",
      annotations: [ann({ replies: [], origin: { pageId: "p0", authorId: "u" } })],
      summaryMd: "# summary",
      pageMd: "# full markdown"
    })

    assert.equal(res.page_id, "w1")
    assert.ok(captured)
    assert.equal(captured!.url, `${HUB_BASE_URL}/api/webpages`)
    assert.equal(captured!.init.method, "POST")

    const fd = captured!.init.body as FormData
    assert.equal(fd.get("url"), "https://example.com/p")
    assert.equal(fd.get("title"), "My page")
    assert.equal(fd.get("visibility"), "link")
    assert.equal(fd.get("summary_md"), "# summary")
    const mdFile = fd.get("page_md") as File
    assert.ok(mdFile, "page_md file must be attached")
    assert.equal(mdFile.name, "page.md")
    assert.equal(await mdFile.text(), "# full markdown")
    const uploaded = JSON.parse(String(fd.get("annotations")))
    assert.equal(uploaded.length, 1)
    assert.equal(uploaded[0].replies, undefined)
    assert.equal(uploaded[0].origin, undefined)
    assert.equal(fd.get("snapshot"), null)
  })

  it("throws HubApiError carrying the server message", async () => {
    mockFetch(async () =>
      jsonResponse({ error: "bad_request", message: "url is required" }, 400)
    )

    await assert.rejects(
      () =>
        hubCreateWebPage({
          url: "",
          title: "T",
          visibility: "link",
          annotations: [ann()]
        }),
      (e: unknown) => {
        assert.ok(e instanceof HubApiError)
        assert.equal((e as HubApiError).status, 400)
        assert.equal((e as HubApiError).message, "url is required")
        return true
      }
    )
  })
})

// ─── 接收同步（fetch mock + 预置会话） ───

async function seedSession(): Promise<void> {
  store["hub_access_token"] = "acc"
  store["hub_refresh_token"] = "ref"
  store["hub_user"] = { user_id: "u1", username: "alice", points: 0, contribution_points: 0, is_admin: false }
}

describe("hubPullSubscriptions", () => {
  it("requests the subscriptions endpoint with since and parses the feed", async () => {
    await seedSession()
    let capturedUrl = ""
    mockFetch(async (url) => {
      capturedUrl = url
      return jsonResponse({
        pages: [
          {
            page_id: "p1",
            url: "https://example.com/a",
            title: "Page A",
            owner_username: "bob",
            accepted_at: "2026-09-26T00:00:00Z",
            updated_at: "2026-09-26T01:00:00Z",
            annotations: [
              {
                annotation_id: "a1",
                author_id: "u-bob",
                author_name: "Bob",
                annotation: ann(),
                content_hash: "deadbeef"
              }
            ]
          }
        ],
        now: "2026-09-26T02:00:00Z"
      })
    })

    const feed = await hubPullSubscriptions("2026-09-25T00:00:00Z")
    assert.ok(capturedUrl.includes("/api/webpages/subscriptions?since=2026-09-25T00%3A00%3A00Z"))
    assert.equal(feed.pages.length, 1)
    assert.equal(feed.pages[0].annotations[0].content_hash, "deadbeef")
    assert.equal(feed.now, "2026-09-26T02:00:00Z")
  })
})

describe("groupHubComments", () => {
  it("groups annotation-level comments into read-only replies and skips page-level ones", () => {
    const grouped = groupHubComments([
      {
        comment_id: 1,
        annotation_id: "a1",
        user_id: "u2",
        username: "Bob",
        content: "nice",
        created_at: "2026-09-26 12:00:00"
      },
      {
        comment_id: 2,
        annotation_id: null,
        user_id: "u3",
        username: "Cara",
        content: "page comment",
        created_at: "2026-09-26 12:01:00"
      }
    ])
    assert.equal(Object.keys(grouped).length, 1)
    const replies = grouped["a1"]
    assert.equal(replies.length, 1)
    assert.equal(replies[0].id, "hub-comment-1")
    assert.equal(replies[0].author.id, "hub:u2")
    assert.equal(replies[0].author.name, "Bob")
    // SQLite datetime('now') → UTC ISO
    assert.equal(replies[0].createdAt, "2026-09-26T12:00:00.000Z")
  })
})
