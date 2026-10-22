import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionJournal, pcmToWav } from './session-journal'
import type { HistoryItem } from '../shared/types'
const directories: string[] = []
afterEach(() =>
  directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }))
)
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 's2teasy-journal-'))
  directories.push(directory)
  return { directory, journal: new SessionJournal(directory) }
}
const item = (): HistoryItem => ({
  id: 'session-1',
  text: 'saved words',
  createdAt: Date.now(),
  durationMs: 1,
  model: 'test',
  source: 'live',
  status: 'recording'
})
describe('session journal', () => {
  it('restores interrupted sessions and their independently persisted PCM after a restart', () => {
    const { directory, journal } = setup()
    journal.append('session-1', new Uint8Array([1, 2, 3, 4]))
    journal.save(item())
    const restored = new SessionJournal(directory)
    expect(restored.list(7)[0]).toMatchObject({
      text: 'saved words',
      status: 'interrupted',
      hasAudio: true
    })
    expect([...restored.readPcm('session-1')]).toEqual([1, 2, 3, 4])
    expect(JSON.parse(readFileSync(join(directory, 'session-1.json'), 'utf8')).status).toBe(
      'interrupted'
    )
  })
  it('expires audio without erasing transcript text', () => {
    const { journal } = setup()
    journal.append('session-1', new Uint8Array([1, 2]))
    journal.save(item())
    expect(journal.list(1, Date.now() + 2 * 86_400_000)[0]).toMatchObject({
      text: 'saved words',
      hasAudio: false
    })
  })
  it('deletes the audio and metadata together and prevents path traversal', () => {
    const { journal } = setup()
    journal.append('session-1', new Uint8Array([1, 2]))
    journal.save(item())
    journal.delete('session-1')
    expect(journal.list(7)).toEqual([])
    expect(() => journal.readPcm('../secret')).toThrow('Invalid session')
  })
  it('wraps checkpointed PCM in a valid mono 16 kHz WAV header', () => {
    const wav = pcmToWav(new Uint8Array([0, 1, 2, 3]))
    expect(wav.subarray(0, 4).toString()).toBe('RIFF')
    expect(wav.readUInt32LE(24)).toBe(16000)
    expect(wav.readUInt32LE(40)).toBe(4)
    expect(wav.length).toBe(48)
  })
})
