import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  darkenForDarkMode,
  flattenColor,
  hexToRgba,
  isPresetColor,
  parseRgba,
  rgbaToHex,
  sameRgb,
  withAlpha
} from "../src/services/color.ts"

describe("parseRgba", () => {
  it("读得懂 #rgb、#rrggbb 与 rgb()/rgba()", () => {
    assert.deepEqual(parseRgba("#f59e0b"), { r: 245, g: 158, b: 11, a: 1 })
    assert.deepEqual(parseRgba("#abc"), { r: 170, g: 187, b: 204, a: 1 })
    assert.deepEqual(parseRgba("rgb(12, 34, 56)"), { r: 12, g: 34, b: 56, a: 1 })
    assert.deepEqual(parseRgba("rgba(12, 34, 56, 0.25)"), { r: 12, g: 34, b: 56, a: 0.25 })
  })

  it("坏输入返回 null 而不是 NaN", () => {
    assert.equal(parseRgba(""), null)
    assert.equal(parseRgba("#12"), null)
    assert.equal(parseRgba("not-a-color"), null)
    assert.equal(parseRgba("rgba(x, y, z)"), null)
  })
})

describe("hex 与 alpha 换算", () => {
  it("rgbaToHex 对无法识别的值给默认黄", () => {
    assert.equal(rgbaToHex("rgba(250, 204, 21, 0.3)"), "#facc15")
    assert.equal(rgbaToHex("#000000"), "#000000")
    assert.equal(rgbaToHex("<script>"), "#facc15")
  })

  it("withAlpha 保留 RGB 并把 alpha 夹在 0..1", () => {
    assert.equal(withAlpha("#f59e0b", 0.5), "rgba(245, 158, 11, 0.5)")
    assert.equal(withAlpha("rgba(1, 2, 3, 0.3)", 7), "rgba(1, 2, 3, 1)")
    assert.equal(withAlpha("rgba(1, 2, 3, 0.3)", -2), "rgba(1, 2, 3, 0)")
    // 解析不出来时原样返回，别把用户颜色变成 NaN
    assert.equal(withAlpha("transparent", 0.5), "transparent")
  })

  it("hexToRgba 拼出可用的 CSS 值", () => {
    assert.equal(hexToRgba("#ff8800", 0.4), "rgba(255, 136, 0, 0.4)")
  })

  it("sameRgb 忽略 alpha 比较", () => {
    assert.ok(sameRgb("rgba(250, 204, 21, 0.3)", "rgba(250, 204, 21, 0.9)"))
    assert.ok(!sameRgb("rgba(250, 204, 21, 0.3)", "#000000"))
    assert.ok(!sameRgb("garbage", "#000000"))
  })

  it("isPresetColor 只认预设值", () => {
    assert.ok(isPresetColor("rgba(250, 204, 21, 0.3)"))
    assert.ok(!isPresetColor("rgba(250, 204, 21, 0.31)"))
  })
})

describe("darkenForDarkMode", () => {
  it("暗色下 alpha 减半", () => {
    assert.equal(darkenForDarkMode("rgba(250, 204, 21, 0.3)"), "rgba(250, 204, 21, 0.15)")
  })

  it("再暗也留 0.06 的底，避免高亮看不见", () => {
    assert.equal(darkenForDarkMode("rgba(9, 9, 9, 0.02)"), "rgba(9, 9, 9, 0.06)")
  })

  it("非 rgba 的值原样通过", () => {
    assert.equal(darkenForDarkMode("#ff0000"), "#ff0000")
  })
})

describe("flattenColor", () => {
  it("半透明批注色摊到白底上，得到同色的实心淡底", () => {
    assert.equal(flattenColor("rgba(250, 204, 21, 0.3)", "#ffffff"), "rgb(254, 240, 185)")
  })

  it("alpha 夹在 0.25～0.4：太淡看不出颜色，太浓压住正文", () => {
    assert.equal(flattenColor("rgba(59, 130, 246, 0.05)", "#ffffff"), "rgb(206, 224, 253)")
    assert.equal(flattenColor("rgba(59, 130, 246, 1)", "#ffffff"), "rgb(177, 205, 251)")
  })

  it("认不出的颜色退回底色，坏输入不会变 NaN", () => {
    assert.equal(flattenColor("not-a-color", "rgb(255, 255, 255)"), "rgb(255, 255, 255)")
  })
})
