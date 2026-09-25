import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

import {
  DEFAULT_HUB_BASE_URL,
  HubApiError,
  addShareRecord,
  buildShareMarkdown,
  getHubBaseUrl,
  getHubSession,
  getShareHistory,
  hubCreateShare,
  hubOriginPattern,
  hubShareUrl,
  normalizeHubBaseUrl,
  parseRecipients,
  removeShareRecord,
  setHubBaseUrl,
  shareMarkdownFileName
} from "../src/services/hub.ts"
import type { Annotation } from "../src/types.ts"

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

describe("normalizeHubBaseUrl", () => {
  it("falls back to the default for empty input", () => {
    assert.equal(normalizeHubBaseUrl(""), DEFAULT_HUB_BASE_URL)
    assert.equal(normalizeHubBaseUrl("   "), DEFAULT_HUB_BASE_URL)
  })

  it("strips trailing slashes", () => {
    assert.equal(normalizeHubBaseUrl("https://h.example///"), "https://h.example")
    assert.equal(normalizeHubBaseUrl("  https://h.example/  "), "https://h.example")
  })

  it("keeps the sub-path prefix intact", () => {
    assert.equal(
      normalizeHubBaseUrl(`${DEFAULT_HUB_BASE_URL}/`),
      DEFAULT_HUB_BASE_URL
    )
  })
})

describe("hubOriginPattern", () => {
  it("derives an origin wildcard from the base url", () => {
    assert.equal(hubOriginPattern(DEFAULT_HUB_BASE_URL), "https://researchranked.eu.org/*")
    assert.equal(hubOriginPattern("http://127.0.0.1:17370"), "http://127.0.0.1:17370/*")
  })

  it("falls back to the default origin on invalid input", () => {
    assert.equal(hubOriginPattern("not a url"), "https://researchranked.eu.org/*")
  })
})

describe("parseRecipients", () => {
  it("splits on comma, semicolon and newline", () => {
    assert.deepEqual(parseRecipients("a, b\nc;d，e；f"), ["a", "b", "c", "d", "e", "f"])
  })

  it("trims, drops empties and de-duplicates", () => {
    assert.deepEqual(parseRecipients(" bob , bob ,, carol "), ["bob", "carol"])
  })

  it("returns an empty array for blank input", () => {
    assert.deepEqual(parseRecipients("  \n , "), [])
  })
})

describe("shareMarkdownFileName", () => {
  it("sanitizes illegal path characters", () => {
    assert.equal(shareMarkdownFileName('a/b:c*d?e"f<g>h|i'), "a_b_c_d_e_f_g_h_i-annotations.md")
  })

  it("falls back for an empty title", () => {
    assert.equal(shareMarkdownFileName(""), "omninotation-annotations.md")
  })

  it("caps the length and always ends with .md", () => {
    const name = shareMarkdownFileName("x".repeat(200))
    assert.ok(name.endsWith("-annotations.md"))
    assert.ok(name.length <= 60 + "-annotations.md".length)
  })
})

describe("buildShareMarkdown", () => {
  it("includes the header, url and annotation count", () => {
    const md = buildShareMarkdown({
      title: "My page",
      url: "https://example.com/p",
      annotations: [ann()]
    })
    assert.match(md, /^# My page/m)
    assert.match(md, /- URL: https:\/\/example\.com\/p/)
    assert.match(md, /- Annotations: 1/)
  })

  it("prefixes quotes with blockquote markers and renders nested replies", () => {
    const md = buildShareMarkdown({
      title: "T",
      url: "",
      annotations: [
        ann({
          quote: "line1\nline2",
          data: { type: "edit", content: "fix this", markStyle: "underline" },
          status: "resolved",
          replies: [
            {
              id: "r1",
              content: "top",
              author: { id: "u2", name: "Bob" },
              createdAt: "2026-01-02T00:00:00.000Z",
              replies: [
                {
                  id: "r2",
                  content: "nested",
                  author: { id: "u3", name: "Cara" },
                  createdAt: "2026-01-03T00:00:00.000Z"
                }
              ]
            }
          ]
        })
      ]
    })
    assert.match(md, /> line1\n> line2/)
    assert.match(md, /## Edit \(underline\) \[resolved\]/)
    assert.match(md, /- Bob: top/)
    assert.match(md, / {2}- Cara: nested/)
  })

  it("always terminates with a trailing rule", () => {
    const md = buildShareMarkdown({ title: "T", url: "", annotations: [ann()] })
    assert.ok(md.trimEnd().endsWith("---"))
  })
})

// ─── 存储 / 会话 ───

describe("hub settings storage", () => {
  it("returns the default base url when unset", async () => {
    assert.equal(await getHubBaseUrl(), DEFAULT_HUB_BASE_URL)
  })

  it("persists and normalizes a custom base url", async () => {
    await setHubBaseUrl("https://custom.example/")
    assert.equal(await getHubBaseUrl(), "https://custom.example")
  })

  it("returns null session when not signed in", async () => {
    assert.equal(await getHubSession(), null)
  })
})

describe("share history", () => {
  it("starts empty", async () => {
    assert.deepEqual(await getShareHistory(), [])
  })

  it("prepends new records and de-duplicates by shareId", async () => {
    const base = {
      title: "T",
      url: "https://p",
      visibility: "link" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      link: "https://hub/#/share/1"
    }
    await addShareRecord({ ...base, shareId: "1" })
    await addShareRecord({ ...base, shareId: "2" })
    await addShareRecord({ ...base, shareId: "1", title: "T2" })

    const list = await getShareHistory()
    assert.equal(list.length, 2)
    assert.equal(list[0].shareId, "1")
    assert.equal(list[0].title, "T2")
  })

  it("removes a record by shareId", async () => {
    const base = {
      title: "T",
      url: "https://p",
      visibility: "link" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      link: "https://hub/#/share/1"
    }
    await addShareRecord({ ...base, shareId: "1" })
    await addShareRecord({ ...base, shareId: "2" })
    await removeShareRecord("1")

    const list = await getShareHistory()
    assert.deepEqual(
      list.map((r) => r.shareId),
      ["2"]
    )
  })
})

describe("hubShareUrl", () => {
  it("builds a hash-route link", async () => {
    assert.equal(await hubShareUrl("abc"), `${DEFAULT_HUB_BASE_URL}/#/share/abc`)
  })
})

// ─── 分享上传（fetch mock） ───

describe("hubCreateShare", () => {
  it("sends the expected multipart fields", async () => {
    let captured: { url: string; init: RequestInit } | null = null
    ;(globalThis as any).fetch = async (url: string, init: RequestInit) => {
      captured = { url, init }
      return new Response(JSON.stringify({ share_id: "s1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    }

    const res = await hubCreateShare({
      title: "T",
      description: "D",
      visibility: "direct",
      annotations: [ann()],
      recipients: ["bob", "carol"],
      itemSnapshot: { url: "https://example.com/p" }
    })

    assert.equal(res.share_id, "s1")
    assert.ok(captured)
    assert.equal(captured!.url, `${DEFAULT_HUB_BASE_URL}/api/shares`)
    assert.equal(captured!.init.method, "POST")

    const fd = captured!.init.body as FormData
    assert.equal(fd.get("title"), "T")
    assert.equal(fd.get("description"), "D")
    assert.equal(fd.get("visibility"), "direct")
    assert.deepEqual(fd.getAll("recipients"), ["bob", "carol"])
    assert.equal(fd.get("files"), null)
    assert.equal(JSON.parse(String(fd.get("annotations"))).length, 1)
    assert.equal(JSON.parse(String(fd.get("item_snapshot"))).url, "https://example.com/p")
  })

  it("attaches a Markdown file when requested", async () => {
    let captured: RequestInit | null = null
    ;(globalThis as any).fetch = async (_url: string, init: RequestInit) => {
      captured = init
      return new Response(JSON.stringify({ share_id: "s2" }), { status: 200 })
    }

    await hubCreateShare({
      title: "Page",
      visibility: "link",
      annotations: [ann()],
      attachMarkdown: true,
      itemSnapshot: { url: "https://example.com/p" }
    })

    const files = (captured!.body as FormData).getAll("files")
    assert.equal(files.length, 1)
    assert.ok(files[0] instanceof File)
    assert.match((files[0] as File).name, /-annotations\.md$/)
  })

  it("omits the Markdown file when there is nothing to attach", async () => {
    let captured: RequestInit | null = null
    ;(globalThis as any).fetch = async (_url: string, init: RequestInit) => {
      captured = init
      return new Response(JSON.stringify({ share_id: "s3" }), { status: 200 })
    }

    await hubCreateShare({
      title: "Empty",
      visibility: "link",
      annotations: [],
      attachMarkdown: true,
      itemSnapshot: {}
    })

    assert.equal((captured!.body as FormData).get("files"), null)
  })

  it("throws HubApiError carrying the server message", async () => {
    ;(globalThis as any).fetch = async () =>
      new Response(JSON.stringify({ error: "bad_request", message: "title is required" }), {
        status: 400
      })

    await assert.rejects(
      () =>
        hubCreateShare({
          title: "T",
          visibility: "link",
          annotations: [ann()],
          itemSnapshot: {}
        }),
      (e: unknown) => {
        assert.ok(e instanceof HubApiError)
        assert.equal((e as HubApiError).status, 400)
        assert.equal((e as HubApiError).message, "title is required")
        return true
      }
    )
  })
})