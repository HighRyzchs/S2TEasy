import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { UsageStore } from './usage-store'
import type { UsageRecord } from '../shared/usage'
const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))
const path = () => {
  const dir = mkdtempSync(join(tmpdir(), 's2t-usage-'))
  dirs.push(dir)
  return join(dir, 'usage.json')
}
const row: UsageRecord = {
  id: 'one',
  operationId: 'op',
  sessionId: 'session',
  createdAt: 1,
  source: 'dictation',
  engine: 'openrouter',
  model: 'speech',
  durationMs: 1000,
  latencyMs: 100,
  attempt: 1,
  outcome: 'success',
  costUsd: null
}
it('persists unknown cost without duplicating a callback or depending on History', () => {
  const file = path(),
    store = new UsageStore(file)
  store.record(row)
  store.record(row)
  expect(new UsageStore(file).snapshot().records).toEqual([row])
})
it('preserves unreadable history with a visible warning and keeps in-memory metrics on disk errors', () => {
  const file = path()
  writeFileSync(file, '{broken')
  expect(new UsageStore(file).snapshot().warning).toMatch(/incomplete/)
  expect(readFileSync(file, 'utf8')).toBe('{broken')
  const store = new UsageStore(join(file, 'no-directory', 'usage.json'))
  expect(store.record(row)).toMatchObject({
    records: [row],
    warning: expect.stringMatching(/could not be saved/)
  })
})
