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

function fillCircle(cx, cy, r, color) {
  const x0 = Math.floor(cx - r - 1)
  const y0 = Math.floor(cy - r - 1)
  const x1 = Math.ceil(cx + r + 1)
  const y1 = Math.ceil(cy + r + 1)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      if (d <= r) blend(x, y, color, 1)
      else if (d < r + 1) blend(x, y, color, r + 1 - d)
    }
  }
}

const bitmap = Buffer.alloc(SIZE * SIZE * 4)
fillRoundRect(18, 18, 238, 238, 56, [12, 13, 17, 255])
fillRoundRect(22, 18, 238, 238, 56, [18, 20, 27, 255])
fillCircle(78, 128, 18, [226, 164, 90, 255])
const bars = [18, 32, 48, 28, 40, 22, 36, 16]
bars.forEach((h, i) => {
  const x = 118 + i * 12
  fillRoundRect(x, 128 - h, x + 6, 128 + h, 3, [232, 228, 220, 230])
})

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
  for (let y = 0; y < to; y++) {
    for (let x = 0; x < to; x++) {
      const sx = Math.min(from - 1, Math.floor(x * ratio))
      const sy = Math.min(from - 1, Math.floor(y * ratio))
      src.copy(out, (y * to + x) * 4, (sy * from + sx) * 4, (sy * from + sx) * 4 + 4)
    }
  }
  return out
}

const png256 = encodePng(SIZE, bitmap)
writeFileSync(join(outDir, 'icon.png'), png256)

const png32 = encodePng(32, scale(bitmap, SIZE, 32))
writeFileSync(join(outDir, 'icon-32.png'), png32)

function icoFromPng(png) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  const entry = Buffer.alloc(16)
  entry[0] = 0
  entry[1] = 0
  entry[2] = 0
  entry[3] = 0
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(22, 12)
  return Buffer.concat([header, entry, png])
}

writeFileSync(join(outDir, 'icon.ico'), icoFromPng(png256))
console.log('Wrote resources/icon.png and resources/icon.ico')
