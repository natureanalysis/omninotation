import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { pageKey } from "../src/services/categories"
import { getKey, normalizePageUrl } from "../src/services/storage"

describe("page identity", () => {
  it("normalizes equivalent URLs to the same storage key", () => {
    const raw = "https://EXAMPLE.com/path?x=1#top"
    const canonical = "https://example.com/path?x=1"

    assert.equal(pageKey(raw), pageKey(canonical))
    assert.equal(getKey(raw), getKey(canonical))
  })

  it("keeps SPA routing hashes (#/) as part of the page identity", () => {
    // knoweave.com is a hash-routed site: #/a/<slug> IS the page.
    // Before v0.2.3 every hash-routed page collapsed into one storage key.
    const a = "https://knoweave.com/#/a/nature-reviews-molecular-cell-biology"
    const b = "https://knoweave.com/#/a/another-article"
    assert.notEqual(normalizePageUrl(a), normalizePageUrl(b))
    assert.equal(normalizePageUrl(a), "https://knoweave.com/#/a/nature-reviews-molecular-cell-biology")

    // host case + trailing-slash rules still apply around the route hash
    assert.equal(
      normalizePageUrl("https://Knoweave.com/#/a/slug"),
      normalizePageUrl("https://knoweave.com/#/a/slug"),
    )
  })

  it("still strips pure anchor hashes", () => {
    assert.equal(normalizePageUrl("https://example.com/doc#top"), "https://example.com/doc")
    assert.equal(normalizePageUrl("https://example.com/doc#section-2"), "https://example.com/doc")
    // a hash that only *looks* like a route but isn't (#/ needs the slash)
    assert.equal(normalizePageUrl("https://example.com/doc#top/"), "https://example.com/doc")
  })

  it("route hash combines with query rules", () => {
    // query keeps the trailing slash; route hash preserved
    assert.equal(
      normalizePageUrl("https://knoweave.com/#/wiki/journal?cat=x"),
      "https://knoweave.com/#/wiki/journal?cat=x",
    )
  })
})
