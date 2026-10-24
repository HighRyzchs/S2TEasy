import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { extractFeatures, FRAME_MS } from './features'
import { detect, forgetExample, remember, suggestThreshold, type VoiceExample } from './memory'
import { VoiceMemoryStore } from './store'
import { babble, GG_NO_RE, msOf, OTHER, synth } from './test-audio'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

let n = 0
const id = () => `id-${++n}`
const lead = babble(12, 5)
const exampleOf = (parts = GG_NO_RE): VoiceExample => ({
  id: id(),
  heard: 'gigi no read',
  source: 'correction',
  sessionId: 's1',
  createdAt: 1,
  frames: extractFeatures(synth([...lead, ...parts, ...babble(6, 6)]), {
    fromMs: msOf(lead) - 60,
    toMs: msOf(lead) + msOf(parts) + 60,
    trim: true
  }).frames
})

describe('voice memories', () => {
  it('detects a remembered phrase in new speech and nothing in unrelated speech', () => {
    const { memories } = remember([], 'gg no re', exampleOf(), id)
    const other = remember(memories, 'Kubernetes', exampleOf(OTHER), id).memories
    const words = babble(9, 21)
    const later = extractFeatures(synth([...words, ...GG_NO_RE, ...babble(5, 22)], { speed: 1.15, seed: 4 })).frames
    const hits = detect(other, later, suggestThreshold(0.5))
    expect(hits.map((h) => h.intended)).toEqual(['gg no re'])
    expect(Math.abs(hits[0].startMs - msOf(words, 1.15))).toBeLessThan(150)
    expect(detect(other, extractFeatures(synth(babble(25, 30))).frames, suggestThreshold(0.5))).toEqual([])
  })

  it('groups examples by intended words, keeps the newest eight, and forgets cleanly', () => {
    let memories = remember([], 'gg no re', exampleOf(), id).memories
    for (let i = 0; i < 9; i++) memories = remember(memories, 'GG no re ', exampleOf(), id).memories
    expect(memories).toHaveLength(1)
    expect(memories[0].examples).toHaveLength(8)
    for (const example of [...memories[0].examples]) memories = forgetExample(memories, example.id)
    expect(memories).toEqual([])
  })

  it('stores encrypted, reloads the same frames, and drops a file from another extractor', () => {
    const dir = mkdtempSync(join(tmpdir(), 's2t-voice-'))
    dirs.push(dir)
    const path = join(dir, 'voice-memory.bin')
    const cipher = {
      encrypt: (text: string) => Buffer.from(`ENC${Buffer.from(text).toString('base64')}`),
      decrypt: (data: Buffer) => Buffer.from(data.toString().slice(3), 'base64').toString()
    }
    const store = new VoiceMemoryStore(path, cipher)
    const example = exampleOf()
    store.replace(remember([], 'gg no re', example, id).memories)
    store.record({ at: 1, intended: 'gg no re', heard: 'gigi no read', score: 0.3, outcome: 'suggested' })
    expect(readFileSync(path).toString().startsWith('ENC')).toBe(true)
    const again = new VoiceMemoryStore(path, cipher)
    expect(again.all()[0].examples[0].frames[3]).toEqual(example.frames[3])
    expect(again.recent()).toHaveLength(1)
    expect(again.all()[0].examples[0].frames.length * FRAME_MS).toBeGreaterThan(500)
    const plain = join(dir, 'old.json')
    writeFileSync(plain, JSON.stringify({ version: 1, extractor: { id: 's2t-mfcc', version: '0' }, memories: [], log: [] }))
    expect(new VoiceMemoryStore(plain).all()).toEqual([])
  })
})
