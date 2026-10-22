import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'resources')
mkdirSync(outDir, { recursive: true })

const SIZE = 256

function blend(x, y, color, cover) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
  const i = (y * SIZE + x) * 4
  const a = color[3] * cover
  const ia = a / 255
  bitmap[i] = Math.round(color[0] * ia + bitmap[i] * (1 - ia))
  bitmap[i + 1] = Math.round(color[1] * ia + bitmap[i + 1] * (1 - ia))
  bitmap[i + 2] = Math.round(color[2] * ia + bitmap[i + 2] * (1 - ia))
  bitmap[i + 3] = Math.min(255, Math.round(bitmap[i + 3] + a * (1 - bitmap[i + 3] / 255)))
}

function fillRoundRect(x0, y0, x1, y1, r, color) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x
      const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y
      const dx = x - cx
      const dy = y - cy
      const d = Math.sqrt(dx * dx + dy * dy)
      if (x >= x0 + r && x < x1 - r) blend(x, y, color, 1)
      else if (y >= y0 + r && y < y1 - r) blend(x, y, color, 1)
      else if (d <= r) blend(x, y, color, 1)
      else if (d < r + 1) blend(x, y, color, r + 1 - d)
    }
  }
}

// Same mint tile and five rounded signal bars as docs/logo.svg.
const bitmap = Buffer.alloc(SIZE * SIZE * 4)
fillRoundRect(0, 0, SIZE, SIZE, 80, [165, 230, 206, 255])
for (const [x, y0, y1] of [
  [20, 38, 44],
  [30, 26, 56],
  [40, 18, 62],
  [50, 28, 52],
  [60, 38, 44]
]) {
  const scale = SIZE / 80
  fillRoundRect(
    Math.round((x - 3) * scale),
    Math.round((y0 - 3) * scale),
    Math.round((x + 3) * scale),
    Math.round((y1 + 3) * scale),
    Math.round(3 * scale),
    [18, 44, 36, 255]
  )
}

function crc32(buf) {
  let crc = ~0
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return ~crc >>> 0
}

function chunk(tag, data) {
  const header = Buffer.alloc(8)
  header.writeUInt32BE(data.length, 0)
  header.write(tag, 4)
  const crcSrc = Buffer.concat([Buffer.from(tag), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(crcSrc), 0)
  return Buffer.concat([header, data, crc])
}

function encodePng(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function scale(src, from, to) {
  const out = Buffer.alloc(to * to * 4)
  const ratio = from / to
  for (let y = 0; y < to; y++)
    for (let x = 0; x < to; x++) {
      const sums = [0, 0, 0, 0]
      let weight = 0
      for (let sy = Math.floor(y * ratio); sy < Math.ceil((y + 1) * ratio); sy++)
        for (let sx = Math.floor(x * ratio); sx < Math.ceil((x + 1) * ratio); sx++) {
          const w =
            (Math.min(sx + 1, (x + 1) * ratio) - Math.max(sx, x * ratio)) *
            (Math.min(sy + 1, (y + 1) * ratio) - Math.max(sy, y * ratio))
          const i = (sy * from + sx) * 4
          for (let c = 0; c < 4; c++) sums[c] += src[i + c] * w
          weight += w
        }
      for (let c = 0; c < 4; c++) out[(y * to + x) * 4 + c] = Math.round(sums[c] / weight)
    }
  return out
}

const sizes = [16, 24, 32, 48, 64, 128, 256]
const images = sizes.map((size) =>
  encodePng(size, size === SIZE ? bitmap : scale(bitmap, SIZE, size))
)
writeFileSync(join(outDir, 'icon.png'), images.at(-1))
writeFileSync(join(outDir, 'icon-32.png'), images[2])
const header = Buffer.alloc(6)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(sizes.length, 4)
let offset = 6 + sizes.length * 16
const entries = images.map((png, index) => {
  const entry = Buffer.alloc(16)
  entry[0] = entry[1] = sizes[index] === 256 ? 0 : sizes[index]
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(offset, 12)
  offset += png.length
  return entry
})
writeFileSync(join(outDir, 'icon.ico'), Buffer.concat([header, ...entries, ...images]))
console.log('Wrote mint waveform icons: PNG + multi-resolution Windows ICO (16–256px)')
