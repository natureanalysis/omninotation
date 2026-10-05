import { useMemo } from "react"
import { marked } from "marked"
import katex from "katex"
import "katex/dist/katex.min.css"

function highlightInHtml(html: string, terms: string[]): string {
  const parts = html.split(/(<[^>]*>)/)
  for (let i = 0; i < parts.length; i += 2) {
    let text = parts[i]
    for (const term of terms) {
      if (!term) continue
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const regex = new RegExp(`(${escaped})`, "gi")
      text = text.replace(regex, '<mark class="omninotation-search-highlight">$1</mark>')
    }
    parts[i] = text
  }
  return parts.join("")
}

/**
 * 渲染前消毒：批注正文可能来自 Hub 上他人分享或导入文件，marked 默认原样透传 HTML，
 * 而这些内容会在扩展页面（拥有全部扩展权限）里执行，必须先去掉可执行标签、
 * 事件属性与危险协议。
 */
const DROP_TAGS = [
  "script",
  "style",
  "iframe",
  "frame",
  "object",
  "embed",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "svg",
  "math"
].join(",")

const URL_ATTRS = ["href", "src", "xlink:href", "action", "formaction", "poster", "data", "background"]
const SAFE_URL = /^(?:https?:|mailto:|tel:|#|\/|\?|data:image\/(?:png|jpe?g|gif|webp);base64,)/i

function sanitizeHtml(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html")
    doc.body.querySelectorAll(DROP_TAGS).forEach((el) => el.remove())
    doc.body.querySelectorAll("*").forEach((el) => {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase()
        if (name.startsWith("on") || name === "srcdoc") {
          el.removeAttribute(attr.name)
        } else if (URL_ATTRS.includes(name) && !SAFE_URL.test(attr.value.trim())) {
          el.removeAttribute(attr.name)
        }
      }
    })
    return doc.body.innerHTML
  } catch {
    // 页面强制 Trusted Types 时 DOMParser 会抛（内容脚本注入到这类页面就会遇到），
    // 退化为不依赖 DOM 的保守清洗：去掉危险标签、事件属性与危险协议。
    return html
      .replace(/<\/?(?:script|style|iframe|frame|object|embed|link|meta|base|form|input|button|textarea|select|svg|math)[^>]*>/gi, "")
      .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/\b(href|src|xlink:href|action|formaction|poster)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, (match, name: string) =>
        /(?:javascript|vbscript|data):/i.test(match) ? `${name}="about:blank"` : match
      )
  }
}

export function MarkdownContent({ text, highlightTerms }: { text: string; highlightTerms?: string[] }) {
  const html = useMemo(() => {
    const katexCache: { placeholder: string; html: string }[] = []
    let counter = 0

    // Preprocess block-level math formulas $$...$$
    let processed = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, formula) => {
      try {
        const rendered = katex.renderToString(formula.trim(), {
          throwOnError: false,
          displayMode: true
        })
        const placeholder = `{{KATEX_BLOCK_${counter++}}}`
        katexCache.push({ placeholder, html: rendered })
        return placeholder
      } catch {
        return `$$${formula}$$`
      }
    })

    // Preprocess inline math formulas $...$
    processed = processed.replace(/\$([^\$\n]+?)\$/g, (_, formula) => {
      try {
        const rendered = katex.renderToString(formula.trim(), {
          throwOnError: false,
          displayMode: false
        })
        const placeholder = `{{KATEX_INLINE_${counter++}}}`
        katexCache.push({ placeholder, html: rendered })
        return placeholder
      } catch {
        return `$${formula}$`
      }
    })

    // Parse markdown
    let renderedHtml = marked.parse(processed, { breaks: true, gfm: true }) as string

    // Restore KaTeX placeholders
    for (const { placeholder, html: katexHtml } of katexCache) {
      renderedHtml = renderedHtml.replace(placeholder, katexHtml)
    }

    // Post-process: convert video-format <img> to <video>
    renderedHtml = renderedHtml.replace(
      /<img([^>]*)src="([^"]+\.(?:mp4|webm|ogg|mov)(?:\?[^"]*)?)"([^>]*)>/gi,
      (match, _before, src, _after) => {
        const altMatch = match.match(/alt="([^"]*)"/)
        const alt = altMatch ? altMatch[1] : "Video"
        return `<video controls class="max-w-full rounded" style="max-height:300px"><source src="${src}">${alt}</video>`
      }
    )

    // Highlight search terms
    if (highlightTerms?.length) {
      renderedHtml = highlightInHtml(renderedHtml, highlightTerms)
    }

    return sanitizeHtml(renderedHtml)
  }, [text, highlightTerms])

  return (
    <div
      className="markdown-body text-xs text-gray-800 leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
