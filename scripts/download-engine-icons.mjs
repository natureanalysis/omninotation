#!/usr/bin/env node
/**
 * Download favicon icons for configured search engines into assets/icons/.
 *
 * Usage:
 *   # Download default engines
 *   node scripts/download-engine-icons.mjs
 *
 *   # Download a custom engine
 *   node scripts/download-engine-icons.mjs --id=baidu --name=Baidu --url="https://www.baidu.com/s?wd=%s"
 *
 *   # Download multiple custom engines (JSON array)
 *   node scripts/download-engine-icons.mjs --engines='[{"id":"baidu","urlTemplate":"https://www.baidu.com/s?wd=%s"}]'
 */

import { createWriteStream, readFileSync } from "fs"
import { mkdir, stat } from "fs/promises"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import https from "https"
import http from "http"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ICONS_DIR = join(__dirname, "../assets/icons")

function parseArgs() {
  const args = process.argv.slice(2)
  const result = { engines: [] }

  for (const arg of args) {
    if (arg.startsWith("--id=")) {
      result.id = arg.slice(5)
    } else if (arg.startsWith("--name=")) {
      result.name = arg.slice(7)
    } else if (arg.startsWith("--url=")) {
      result.url = arg.slice(6)
    } else if (arg.startsWith("--engines=")) {
      try {
        result.engines = JSON.parse(arg.slice(10))
      } catch (e) {
        console.error("Invalid --engines JSON:", e.message)
        process.exit(1)
      }
    }
  }

  return result
}

function getDomainSources(urlTemplate) {
  const sources = []
  try {
    const domain = new URL(urlTemplate.replace("{q}", "").replace("%s", "")).hostname
    sources.push(`https://${domain}/favicon.ico`)
    // Fallback to common paths
    sources.push(`https://${domain}/favicon.png`)
    sources.push(`https://${domain}/apple-touch-icon.png`)
  } catch {}
  return sources
}

// Default engines are read from src/services/engines.json
const ENGINES_JSON_PATH = join(__dirname, "../src/services/engines.json")
const DEFAULT_ENGINES = JSON.parse(readFileSync(ENGINES_JSON_PATH, "utf-8"))

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http
    const file = createWriteStream(destPath)
    const req = client.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        download(new URL(res.headers.location, url).href, destPath).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        file.close()
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      res.pipe(file)
      file.on("finish", () => {
        file.close(() => resolve())
      })
    })
    req.on("error", (err) => {
      file.close()
      reject(err)
    })
    req.on("timeout", () => {
      req.destroy()
      file.close()
      reject(new Error("Request timeout"))
    })
  })
}

async function ensureDir(dir) {
  try {
    await mkdir(dir, { recursive: true })
  } catch {}
}

async function main() {
  await ensureDir(ICONS_DIR)

  const args = parseArgs()
  let engines = []

  if (args.engines.length > 0) {
    engines = args.engines
  } else if (args.id && args.url) {
    engines = [{
      id: args.id,
      name: args.name || args.id,
      urlTemplate: args.url,
      sources: getDomainSources(args.url)
    }]
  } else {
    engines = DEFAULT_ENGINES
  }

  let failedCount = 0

  for (const engine of engines) {
    const destPath = join(ICONS_DIR, `${engine.id}.ico`)
    let success = false

    // engines.json 里的空数组是真值，必须按长度判断才会走兜底源
    const sources = engine.sources?.length ? engine.sources : getDomainSources(engine.urlTemplate)

    for (const source of sources) {
      try {
        process.stdout.write(`[${engine.id}] trying ${source} ... `)
        await download(source, destPath)
        const stats = await stat(destPath)
        if (stats.size < 100) {
          throw new Error(`Downloaded file too small (${stats.size} bytes)`)
        }
        console.log(`OK (${stats.size} bytes)`)
        success = true
        break
      } catch (err) {
        console.log(`failed (${err.message})`)
      }
    }

    if (!success) {
      console.error(`[${engine.id}] All sources failed. Please manually place an icon at ${destPath}`)
      failedCount++
    }
  }

  if (failedCount > 0) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
