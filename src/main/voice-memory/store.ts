import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { EXTRACTOR, FEATURE_DIM } from './features'
import { forgetExample, type VoiceExample, type VoiceMemory } from './memory'

import type { MatchEvent } from '../../shared/voice-memory'

export type { MatchEvent }

/** Encrypts the file at rest (Electron safeStorage on Windows); absent when the OS offers none. */
export type Cipher = { encrypt: (text: string) => Buffer; decrypt: (data: Buffer) => string }

type StoredExample = Omit<VoiceExample, 'frames'> & { frames: string; frameCount: number }
type StoredFile = {
  version: 1
  extractor: typeof EXTRACTOR
  memories: (Omit<VoiceMemory, 'examples'> & { examples: StoredExample[] })[]
  log: MatchEvent[]
}

const MAX_MEMORIES = 300
const MAX_LOG = 100

function packFrames(frames: Float32Array[]): string {
  const flat = new Float32Array(frames.length * FEATURE_DIM)
  frames.forEach((frame, i) => flat.set(frame, i * FEATURE_DIM))
  return Buffer.from(flat.buffer).toString('base64')
}

function unpackFrames(data: string, count: number): Float32Array[] {
  const bytes = Buffer.from(data, 'base64')
  const flat = new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4))
  if (flat.length !== count * FEATURE_DIM) return []
  return Array.from({ length: count }, (_, i) => flat.slice(i * FEATURE_DIM, (i + 1) * FEATURE_DIM))
}

/**
 * Personal voice memories on this device: one file, encrypted when the OS allows, written atomically.
 * Examples from a different feature extractor are dropped on load rather than compared.
 */
export class VoiceMemoryStore {
  private memories: VoiceMemory[] = []
  private log: MatchEvent[] = []

  constructor(
    private readonly path: string,
    private readonly cipher?: Cipher
  ) {
    this.load()
  }

  private load(): void {
    if (!existsSync(this.path)) return
    try {
      const raw = readFileSync(this.path)
      const text = this.cipher && raw[0] !== 0x7b ? this.cipher.decrypt(raw) : raw.toString('utf8')
      const file = JSON.parse(text) as StoredFile
      if (file.version !== 1 || file.extractor?.id !== EXTRACTOR.id || file.extractor.version !== EXTRACTOR.version) return
      this.memories = file.memories
        .map((memory) => ({
          ...memory,
          examples: memory.examples
            .map((example) => ({ ...example, frames: unpackFrames(example.frames, example.frameCount) }))
            .filter((example) => example.frames.length > 0)
        }))
        .filter((memory) => memory.examples.length > 0)
      this.log = Array.isArray(file.log) ? file.log.slice(-MAX_LOG) : []
    } catch {
      // An unreadable file (another user's key, damage) starts empty; it is replaced on next save.
      this.memories = []
      this.log = []
    }
  }

  private save(): void {
    const file: StoredFile = {
      version: 1,
      extractor: EXTRACTOR,
      memories: this.memories.map((memory) => ({
        ...memory,
        examples: memory.examples.map((example) => ({
          ...example,
          frames: packFrames(example.frames),
          frameCount: example.frames.length
        }))
      })),
      log: this.log
    }
    const text = JSON.stringify(file)
    mkdirSync(dirname(this.path), { recursive: true })
    const temp = `${this.path}.tmp`
    writeFileSync(temp, this.cipher ? this.cipher.encrypt(text) : text, { mode: 0o600 })
    renameSync(temp, this.path)
  }

  all(): VoiceMemory[] {
    return this.memories
  }

  replace(memories: VoiceMemory[]): void {
    this.memories = memories.slice(-MAX_MEMORIES)
    this.save()
  }

  forgetExample(exampleId: string): void {
    this.replace(forgetExample(this.memories, exampleId))
  }

  forgetMemory(memoryId: string): void {
    this.replace(this.memories.filter((memory) => memory.id !== memoryId))
  }

  count(memoryId: string, field: 'suggested' | 'applied'): void {
    const memory = this.memories.find((m) => m.id === memoryId)
    if (!memory) return
    memory.stats = { ...memory.stats, [field]: memory.stats[field] + 1 }
    this.save()
  }

  record(event: MatchEvent): void {
    this.log = [...this.log, event].slice(-MAX_LOG)
    this.save()
  }

  recent(): MatchEvent[] {
    return this.log
  }

  /** Delete everything, including the file. */
  clear(): void {
    this.memories = []
    this.log = []
    rmSync(this.path, { force: true })
  }
}
