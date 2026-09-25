import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { pageKey } from "../src/services/categories"
import { getKey } from "../src/services/storage"

describe("page identity", () => {
  it("normalizes equivalent URLs to the same storage key", () => {
    const raw = "https://EXAMPLE.com/path?x=1#top"
    const canonical = "https://example.com/path?x=1"

    assert.equal(pageKey(raw), pageKey(canonical))
    assert.equal(getKey(raw), getKey(canonical))
  })
})
