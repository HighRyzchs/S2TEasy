import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import type { HistoryItem } from '../shared/types'
import { SAMPLE_RATE, HISTORY_LIMIT } from '../shared/constants'

export function atomicJson(path: string, value: unknown): void {
  const temp = `${path}.tmp`
  writeFileSync(temp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 })
  const fd = openSync(temp, 'r+')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(temp, path)
}

/** Local checkpoints contain no credentials. Audio is PCM16, mono, 16 kHz. */
export class SessionJournal {
  constructor(private readonly directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
  }

  private path(id: string, suffix: string): string {
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('Invalid session identifier.')
    return join(this.directory, `${id}.${suffix}`)
  }

  save(item: HistoryItem): void {
    const audio = this.path(item.id, 'pcm')
    if (existsSync(audio)) {
      const fd = openSync(audio, 'r+')
      try {
        fsyncSync(fd)
      } finally {
        closeSync(fd)
      }
    }
    atomicJson(this.path(item.id, 'json'), { ...item, hasAudio: this.hasAudio(item.id) })
  }

  append(id: string, bytes: Uint8Array): void {
    appendFileSync(this.path(id, 'pcm'), bytes, { mode: 0o600 })
  }

  hasAudio(id: string): boolean {
    try {
      return statSync(this.path(id, 'pcm')).size >= 2
    } catch {
      return false
    }
  }

  readPcm(id: string): Buffer {
    return readFileSync(this.path(id, 'pcm'))
  }

  readPcmExcerpt(id: string, range: { startMs: number; endMs: number }): Buffer {
    if (
      !Number.isFinite(range.startMs) ||
      !Number.isFinite(range.endMs) ||
      range.startMs < 0 ||
      range.endMs <= range.startMs ||
      range.endMs - range.startMs > 30000
    )
      throw new Error('Choose an excerpt of up to 30 seconds.')
    const path = this.path(id, 'pcm')
    const start = Math.floor(range.startMs * 16) * 2
    const end = Math.min(Math.floor(statSync(path).size / 2) * 2, Math.floor(range.endMs * 16) * 2)
    if (end <= start) throw new Error('The excerpt is outside the available recording.')
    const bytes = Buffer.alloc(end - start)
    const fd = openSync(path, 'r')
    try {
      let read = 0
      while (read < bytes.length) {
        const amount = readSync(fd, bytes, read, bytes.length - read, start + read)
        if (!amount) throw new Error('The recording changed while reading the excerpt.')
        read += amount
      }
    } finally {
      closeSync(fd)
    }
    return bytes
  }

  removeAudio(id: string): void {
    rmSync(this.path(id, 'pcm'), { force: true })
  }

  delete(id: string): void {
    this.removeAudio(id)
    rmSync(this.path(id, 'json'), { force: true })
  }

  list(retentionDays: number, now = Date.now()): HistoryItem[] {
    const items: HistoryItem[] = []
    for (const name of readdirSync(this.directory)) {
      if (!name.endsWith('.json')) continue
      try {
        const item = JSON.parse(readFileSync(join(this.directory, name), 'utf8')) as HistoryItem
        if (
          !item.id ||
          name !== `${item.id}.json` ||
          typeof item.createdAt !== 'number' ||
          typeof item.text !== 'string'
        )
          continue
        if (now - item.createdAt > retentionDays * 86_400_000) this.removeAudio(item.id)
        item.hasAudio = this.hasAudio(item.id)
        if (item.status === 'recording' || item.status === 'processing') {
          item.status = 'interrupted'
          item.error =
            'This session ended before completion. Saved text is available; recover audio if retained.'
          this.save(item)
        }
        items.push(item)
      } catch {
        /* Preserve unreadable files for manual recovery; do not overwrite them. */
      }
    }
    items.sort((a, b) => b.createdAt - a.createdAt)
    for (const item of items.slice(HISTORY_LIMIT)) this.delete(item.id)
    return items.slice(0, HISTORY_LIMIT)
  }
}

export function pcmToWav(pcm: Uint8Array): Buffer {
  const bytes = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength - (pcm.byteLength % 2))
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + bytes.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(bytes.length, 40)
  return Buffer.concat([header, bytes])
}
