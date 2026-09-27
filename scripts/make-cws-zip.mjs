// 从解包目录重新打包出最大兼容性的 Chrome Web Store zip：
//   - 普通方式写本地文件头：CRC32 / 压缩与未压缩大小都在头里，不使用流式数据描述符
//     （plasmo 自带 package 走 archiver 流式压缩，GP 标志 bit3 置位，个别情况下会被
//      CWS 上传校验器判为「包无效」）
//   - 条目名一律正斜杠、不含目录项、manifest.json 在 zip 根
// 用法：node scripts/make-cws-zip.mjs [输出文件名]
import { deflateRawSync } from "node:zlib"
import { crc32 } from "node:zlib"
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join, relative, sep } from "node:path"

const SRC = "build/chrome-mv3-prod"
const OUT = process.argv[2] || "build/omninotation-cws.zip"

function walk(dir, base = SRC) {
  const out = []
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p, base))
    else out.push(p)
  }
  return out
}

const entries = []
let offset = 0
const chunks = []

function u16(n) { return Buffer.from([n & 0xff, (n >> 8) & 0xff]) }
function u32(n) { return Buffer.from([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]) }

for (const file of walk(SRC)) {
  const name = relative(SRC, file).split(sep).join("/")
  const data = readFileSync(file)
  const comp = deflateRawSync(data, { level: 9 })
  const useDeflate = comp.length < data.length
  const body = useDeflate ? comp : data
  const crc = crc32(data) >>> 0

  const local = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]), u16(20), u16(0), // GP 标志全 0：非流式
    u16(useDeflate ? 8 : 0), u16(0), u16(0x2821),
    u32(crc), u32(body.length), u32(data.length),
    u16(name.length), u16(0), Buffer.from(name, "utf8"), body
  ])

  const central = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x01, 0x02]), u16(20), u16(20), u16(0),
    u16(useDeflate ? 8 : 0), u16(0), u16(0x2821),
    u32(crc), u32(body.length), u32(data.length),
    u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset),
    Buffer.from(name, "utf8")
  ])

  entries.push(central)
  chunks.push(local)
  offset += local.length
}

const cdStart = offset
const cd = Buffer.concat(entries)
const eocd = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x05, 0x06]), u16(0), u16(0),
  u16(entries.length), u16(entries.length), u32(cd.length), u32(cdStart), u16(0)
])

writeFileSync(OUT, Buffer.concat([...chunks, cd, eocd]))
console.log(`${OUT}: ${entries.length} entries, ${ (cdStart + cd.length + 22) / 1024 | 0} KB`)
