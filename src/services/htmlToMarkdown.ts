/**
 * Converts an HTML DOM range or node into Markdown text,
 * preserving original formatting (headings, bold, italic, links, lists, etc.)
 */

function isBlockElement(tag: string): boolean {
  return [
    "p", "div", "h1", "h2", "h3", "h4", "h5", "h6",
    "blockquote", "pre", "ul", "ol", "li", "table",
    "thead", "tbody", "tr", "th", "td", "section", "article",
    "header", "footer", "nav", "aside", "figure", "figcaption",
    "hr", "br", "dl", "dt", "dd"
  ].includes(tag.toLowerCase())
}

function processNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || ""
    // Collapse whitespace but keep single spaces
    return text.replace(/\s+/g, " ")
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return ""
  }

  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()

  // Skip script, style, and hidden elements
  if (["script", "style", "noscript"].includes(tag)) return ""
  if (el.style?.display === "none" || el.style?.visibility === "hidden") return ""

  // Recursively process children
  let childrenContent = ""
  for (const child of Array.from(el.childNodes)) {
    childrenContent += processNode(child)
  }

  // Trim content for block elements
  const trimmed = childrenContent.trim()
  if (!trimmed && !["br", "hr", "img"].includes(tag)) return ""

  switch (tag) {
    // Headings
    case "h1":
      return `\n# ${trimmed}\n`
    case "h2":
      return `\n## ${trimmed}\n`
    case "h3":
      return `\n### ${trimmed}\n`
    case "h4":
      return `\n#### ${trimmed}\n`
    case "h5":
      return `\n##### ${trimmed}\n`
    case "h6":
      return `\n###### ${trimmed}\n`

    // Paragraphs and divs
    case "p":
      return `\n${trimmed}\n`
    case "div":
      return `\n${trimmed}\n`
    case "section":
    case "article":
    case "header":
    case "footer":
    case "nav":
    case "aside":
    case "figure":
      return `\n${trimmed}\n`

    // Bold
    case "strong":
    case "b":
      if (!trimmed) return ""
      return `**${trimmed}**`

    // Italic
    case "em":
    case "i":
      if (!trimmed) return ""
      return `*${trimmed}*`

    // Strikethrough
    case "s":
    case "del":
    case "strike":
      if (!trimmed) return ""
      return `~~${trimmed}~~`

    // Inline code
    case "code": {
      if (!trimmed) return ""
      // Check if parent is pre (block code) - handled by pre case
      if (el.parentElement?.tagName.toLowerCase() === "pre") return trimmed
      return `\`${trimmed}\``
    }

    // Code block
    case "pre": {
      // 取原始 textContent：子节点走 processNode 会把换行与缩进折叠成单个空格
      const codeEl = el.querySelector("code")
      const raw = ((codeEl || el).textContent || "").replace(/\s+$/, "")
      if (!raw.trim()) return ""
      let lang = ""
      if (codeEl) {
        const classes = codeEl.className.split(/\s+/)
        for (const cls of classes) {
          const match = cls.match(/^(?:language-|lang-)(.+)$/)
          if (match) {
            lang = match[1]
            break
          }
        }
      }
      return `\n\`\`\`${lang}\n${raw}\n\`\`\`\n`
    }

    // Links
    case "a": {
      if (!trimmed) return ""
      const href = el.getAttribute("href")
      if (href && !href.startsWith("javascript:")) {
        const title = el.getAttribute("title")
        if (title) {
          return `[${trimmed}](${href} "${title}")`
        }
        return `[${trimmed}](${href})`
      }
      return trimmed
    }

    // Images
    case "img": {
      const src = el.getAttribute("src") || ""
      const alt = el.getAttribute("alt") || ""
      if (!src) return ""
      return `![${alt}](${src})`
    }

    // Line break
    case "br":
      return "\n"

    // Horizontal rule
    case "hr":
      return "\n---\n"

    // Unordered list
    case "ul":
      return `\n${trimmed}\n`

    // Ordered list
    case "ol":
      return `\n${trimmed}\n`

    // List item
    case "li": {
      const parent = el.parentElement
      if (parent && parent.tagName.toLowerCase() === "ol") {
        // Find index
        const siblings = Array.from(parent.children).filter(c => c.tagName.toLowerCase() === "li")
        const index = siblings.indexOf(el) + 1
        // Indent nested content
        const indented = trimmed.replace(/\n/g, "\n  ")
        return `${index}. ${indented}\n`
      }
      // Unordered list item
      const indented = trimmed.replace(/\n/g, "\n  ")
      return `- ${indented}\n`
    }

    // Blockquote
    case "blockquote": {
      const lines = trimmed.split("\n")
      return "\n" + lines.map(line => `> ${line}`).join("\n") + "\n"
    }

    // Table
    case "table":
      return `\n${trimmed}\n`
    case "thead":
    case "tbody":
      return trimmed
    case "tr": {
      const cells = Array.from(el.children)
        .filter(c => c.tagName.toLowerCase() === "td" || c.tagName.toLowerCase() === "th")
        .map(c => processNode(c).trim())
      const row = `| ${cells.join(" | ")} |`
      // If this is the first row of thead, add separator
      if (el.parentElement?.tagName.toLowerCase() === "thead") {
        const separator = `| ${cells.map(() => "---").join(" | ")} |`
        return `${row}\n${separator}\n`
      }
      return `${row}\n`
    }
    case "th":
    case "td":
      return trimmed

    // Definition list
    case "dl":
      return `\n${trimmed}\n`
    case "dt":
      return `\n**${trimmed}**\n`
    case "dd":
      return `: ${trimmed}\n`

    // Figure caption
    case "figcaption":
      return `\n*${trimmed}*\n`

    // Superscript and subscript
    case "sup":
      return trimmed ? `^${trimmed}^` : ""
    case "sub":
      return trimmed ? `~${trimmed}~` : ""

    // Underline (no standard markdown, use HTML)
    case "u":
      return trimmed ? `<u>${trimmed}</u>` : ""

    // Mark/highlight
    case "mark":
      return trimmed ? `==${trimmed}==` : ""

    // Default: just return the content
    default:
      return trimmed
  }
}

/**
 * Convert the HTML content of a Range to Markdown.
 */
export function rangeToMarkdown(range: Range): string {
  // Clone the range contents as a document fragment
  const fragment = range.cloneContents()

  // Create a temporary container to process the fragment
  const container = document.createElement("div")
  container.appendChild(fragment)

  const raw = processNode(container)

  // Clean up: collapse multiple blank lines, trim
  return raw
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "")
    .trim()
}

/**
 * Convert an HTML string to Markdown.
 */
export function htmlToMarkdown(html: string): string {
  const container = document.createElement("div")
  container.innerHTML = html
  const raw = processNode(container)
  return raw
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "")
    .trim()
}