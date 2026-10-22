import { expect, it } from 'vitest'
import { summarizeUsage, usageCsv, type UsageRecord } from './usage'
export const row: UsageRecord = {
  id: 'one',
  sessionId: 'session',
  source: 'dictation',
  operationId: 'op',
  createdAt: Date.now(),
  engine: 'openrouter',
  model: 'speech',
  durationMs: 1000,
  latencyMs: 200,
  attempt: 1,
  outcome: 'success',
  costUsd: 0.01
}
it('counts reported costs and retry attempts while deduplicating audio duration and marking unknown costs', () => {
  const records = [
    row,
    { ...row, id: 'two', attempt: 2, costUsd: null },
    { ...row, id: 'three', engine: 'local' as const, operationId: 'local', costUsd: 0 }
  ]
  const summary = summarizeUsage(records)
  expect(summary).toMatchObject({
    cost: 0.01,
    requests: 3,
    unknown: 1,
    durationMs: 2000,
    operations: 2
  })
  expect(summary.daily.reduce((sum, day) => sum + day.cost, 0)).toBe(0.01)
})
it('uses local calendar boundaries and excludes future and earlier requests', () => {
  const now = new Date(2026, 5, 20, 12).getTime()
  const summary = summarizeUsage(
    [
      { ...row, createdAt: new Date(2026, 5, 20, 0).getTime() },
      { ...row, createdAt: now + 1 },
      { ...row, createdAt: new Date(2026, 5, 19, 23, 59).getTime() }
    ],
    1,
    now
  )
  expect(summary.requests).toBe(1)
})
it('exports metrics without transcripts and escapes spreadsheet formula injection', () => {
  const csv = usageCsv([{ ...row, model: '=HYPERLINK("evil")' }])
  expect(csv).toContain('"\'=HYPERLINK(')
  expect(csv).not.toContain('session')
})
