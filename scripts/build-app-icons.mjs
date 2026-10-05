// 从 assets/icon.png 导出扩展图标各尺寸到 assets/app-icon/。
//
// 为什么不交给 Plasmo 自动派生：Plasmo 只认 assets/icon.png，自己决定 16/32/48/64/128
// 的缩放算法，实测产出的 16px 只剩上半部形状、alpha 均值 19（同批 32/48/128 正常），
// 而标准 DPI 下 Chrome 工具栏用的正是 16px。这里用面积平均 + 预乘 alpha 自己导出，
// 并在 package.json 的 manifest.icons / action.default_icon 显式引用。
//
// 用法：node scripts/build-app-icons.mjs（prebuild / prepackage 已挂上）

import { inflateSync, deflateSync } from "node:zlib"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const SIZES = [16, 32, 48, 64, 128]
const SOURCE = path.resolve("assets/icon.png")
const OUT_DIR = path.resolve("assets/app-icon")
/** 降采样后的最低可读性门槛：低于此值说明该尺寸下图形已糊掉，直接让构建失败。 */
const MIN_ALPHA_MEAN = 60

const PNG_SIGNATURE = "89504e470d0a1a0a"

// ─── PNG 读取 ───

function decodePng(file) {
  const buf = readFileSync(file)
  if (buf.slice(0, 8).toString("hex") !== PNG_SIGNATURE) throw new Error(`不是 PNG：${file}`)

  let offset = 8
  let ihdr = null
  const idat = []
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset)
    const type = buf.slice(offset + 4, offset + 8).toString("ascii")
    const data = buf.slice(offset + 8, offset + 8 + length)
    if (type === "IHDR") {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12]
      }
    } else if (type === "IDAT") {
      idat.push(data)
    } else if (type === "IEND") {
      break
    }
    offset += 12 + length
  }

  if (!ihdr) throw new Error(`缺 IHDR：${file}`)
  if (ihdr.bitDepth !== 8) throw new Error(`只支持 8bit，实际 ${ihdr.bitDepth}bit：${file}`)
  if (ihdr.interlace !== 0) throw new Error(`不支持隔行扫描：${file}`)
  if (![0, 2, 4, 6].includes(ihdr.colorType)) throw new Error(`不支持的颜色类型 ${ihdr.colorType}：${file}`)

  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[ihdr.colorType]
  const raw = inflateSync(Buffer.concat(idat))
  const stride = ihdr.width * channels
  const pixels = Buffer.alloc(ihdr.height * stride)
  let previous = Buffer.alloc(stride)

  for (let y = 0; y < ihdr.height; y++) {
    const lineStart = y * (stride + 1)
    const filter = raw[lineStart]
    const line = raw.slice(lineStart + 1, lineStart + 1 + stride)
    const current = Buffer.alloc(stride)
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? current[x - channels] : 0
      const up = previous[x]
      const upLeft = x >= channels ? previous[x - channels] : 0
      let value = line[x]
      switch (filter) {
        case 0:
          break
        case 1:
          value = value + left
          break
        case 2:
          value = value + up
          break
        case 3:
          value = value + ((left + up) >> 1)
          break
        case 4: {
          const p = left + up - upLeft
          const pa = Math.abs(p - left)
          const pb = Math.abs(p - up)
          const pc = Math.abs(p - upLeft)
          value = value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)
          break
        }
        default:
          throw new Error(`未知过滤器 ${filter}：${file}`)
      }
      current[x] = value & 0xff
    }
    current.copy(pixels, y * stride)
    previous = current
  }

  return { ...ihdr, channels, pixels }
}

function toRgba(image) {
  const { width, height, channels, pixels } = image
  const out = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const s = i * channels
    const gray = pixels[s]
    const grayAlpha = channels === 2 ? pixels[s + 1] : 255
    switch (channels) {
      case 1:
        out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = gray
        out[i * 4 + 3] = 255
        break
      case 2:
        out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = gray
        out[i * 4 + 3] = grayAlpha
        break
      case 3:
        out[i * 4] = gray
        out[i * 4 + 1] = pixels[s + 1]
        out[i * 4 + 2] = pixels[s + 2]
        out[i * 4 + 3] = 255
        break
      default:
        out[i * 4] = gray
        out[i * 4 + 1] = pixels[s + 1]
        out[i * 4 + 2] = pixels[s + 2]
        out[i * 4 + 3] = pixels[s + 3]
    }
  }
  return out
}

// ─── 面积平均降采样（预乘 alpha，支持非整数比例）───

function downscale(rgba, srcW, srcH, destSize) {
  const ratioX = srcW / destSize
  const ratioY = srcH / destSize
  const out = Buffer.alloc(destSize * destSize * 4)

  for (let dy = 0; dy < destSize; dy++) {
    const y0 = dy * ratioY
    const y1 = Math.min(srcH, y0 + ratioY)
    const syStart = Math.floor(y0)
    const syEnd = Math.min(srcH, Math.ceil(y1))
    for (let dx = 0; dx < destSize; dx++) {
      const x0 = dx * ratioX
      const x1 = Math.min(srcW, x0 + ratioX)

      let coverage = 0
      let sumA = 0
      let sumR = 0
      let sumG = 0
      let sumB = 0

      for (let sy = syStart; sy < syEnd; sy++) {
        const coverY = Math.min(sy + 1, y1) - Math.max(sy, y0)
        if (coverY <= 0) continue
        const sxStart = Math.floor(x0)
        const sxEnd = Math.min(srcW, Math.ceil(x1))
        for (let sx = sxStart; sx < sxEnd; sx++) {
          const coverX = Math.min(sx + 1, x1) - Math.max(sx, x0)
          if (coverX <= 0) continue
          const weight = coverX * coverY
          const i = (sy * srcW + sx) * 4
          const a = rgba[i + 3]
          coverage += weight
          sumA += a * weight
          // 预乘累加：透明像素不往颜色里灌值
          sumR += rgba[i] * (a / 255) * weight
          sumG += rgba[i + 1] * (a / 255) * weight
          sumB += rgba[i + 2] * (a / 255) * weight
        }
      }

      const o = (dy * destSize + dx) * 4
      const alpha = coverage > 0 ? sumA / coverage : 0
      out[o + 3] = Math.round(Math.min(255, Math.max(0, alpha)))
      if (sumA > 0) {
        const divisor = sumA / 255
        out[o] = Math.round(Math.min(255, Math.max(0, sumR / divisor)))
        out[o + 1] = Math.round(Math.min(255, Math.max(0, sumG / divisor)))
        out[o + 2] = Math.round(Math.min(255, Math.max(0, sumB / divisor)))
      } else {
        out[o] = out[o + 1] = out[o + 2] = 0
      }
    }
  }
  return out
}

// ─── PNG 写出 ───

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, "ascii")
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(Buffer.concat([head.slice(4), data])), 0)
  return Buffer.concat([head, data, tail])
}

function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0 // 非隔行

  const stride = size * 4
  const scanlines = Buffer.alloc(size * (stride + 1))
  for (let y = 0; y < size; y++) {
    scanlines[y * (stride + 1)] = 0 // filter: None
    rgba.copy(scanlines, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from(PNG_SIGNATURE, "hex"),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(scanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ])
}

// ─── 主流程 ───

function alphaMean(rgba, size) {
  let sum = 0
  for (let i = 0; i < size * size; i++) sum += rgba[i * 4 + 3]
  return sum / (size * size)
}

function main() {
  const source = decodePng(SOURCE)
  if (source.width !== source.height) {
    throw new Error(`assets/icon.png 必须是正方形，实际 ${source.width}x${source.height}`)
  }
  const rgba = toRgba(source)
  mkdirSync(OUT_DIR, { recursive: true })

  const summary = []
  for (const size of SIZES) {
    const scaled = downscale(rgba, source.width, source.height, size)
    const mean = alphaMean(scaled, size)
    if (mean < MIN_ALPHA_MEAN) {
      throw new Error(
        `${size}px 图标 alpha 均值仅 ${mean.toFixed(0)}（门槛 ${MIN_ALPHA_MEAN}）：` +
          `源图在该尺寸下已糊掉，请为该尺寸单独准备补偿版图形`
      )
    }
    writeFileSync(path.join(OUT_DIR, `${size}.png`), encodePng(scaled, size))
    summary.push(`${size}px alpha均值 ${mean.toFixed(0)}`)
  }
  console.log(`应用图标已导出 assets/app-icon/：${summary.join("，")}`)
}

main()
