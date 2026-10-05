import * as textQuote from "dom-anchor-text-quote"
import type { TextQuoteSelector } from "@/types"

export function describeRange(root: Node, range: Range): TextQuoteSelector | null {
  try {
    const selector = textQuote.fromRange(root, range)
    return {
      exact: selector.exact,
      prefix: selector.prefix,
      suffix: selector.suffix
    }
  } catch (e) {
    console.error("[OmniNotation] Failed to describe range:", e)
    return null
  }
}

export function resolveRange(
  root: Node,
  selector: TextQuoteSelector,
  hint?: number
): Range | null {
  try {
    const range = textQuote.toRange(root, selector, hint !== undefined ? { hint } : undefined)
    return range
  } catch (e) {
    console.error("[OmniNotation] Failed to resolve range:", e)
    return null
  }
}

export function getRootElement(configRootSelector?: string): Element {
  if (configRootSelector) {
    const el = document.querySelector(configRootSelector)
    if (el) return el
  }
  return document.body
}
