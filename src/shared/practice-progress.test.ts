import { expect, it } from 'vitest'
import type { HistoryItem } from './types'
import { practiceProgress } from './practice-progress'

const take = (extra: Partial<HistoryItem> = {}): HistoryItem => ({
  id: 'take',
  text: 'Amira',
  rawText: 'a mirror',
  practiceTarget: 'Amira',
  model: 'asr/a',
  source: 'practice',
  status: 'complete',
  durationMs: 1200,
  createdAt: 1,
  ...extra
})

it('scores original recognition, never corrected text, and excludes unfinished or unlabeled takes', () => {
  const [row] = practiceProgress([
    take({ hasAudio: true }),
    take({ id: 'correct', rawText: 'AMIRA!', createdAt: 2 }),
    take({ id: 'missing', rawText: undefined }),
    take({ status: 'error' }),
    take({ source: 'final' }),
    take({ practiceTarget: undefined }),
    take({ rawText: '…' })
  ])
  expect(row).toMatchObject({ takes: 4, scored: 2, matched: 1, retained: 1 })
  expect(row.recent.map((r) => r.matched)).toEqual([false, true])
})

it('groups normalized phrases per recognizer and preserves meaningful spelling distinctions', () => {
  const rows = practiceProgress([
    take({ practiceTarget: '  Café team ', rawText: 'CAFE\u0301 team.' }),
    take({ practiceTarget: 'Café team', rawText: 'Cafe team' }),
    take({ practiceTarget: 'Café team', rawText: 'Café team', model: 'asr/b' }),
    take({ practiceTarget: "O'Neil", rawText: 'O Neil' }),
    take({ practiceTarget: '!!!', rawText: '!!!' })
  ])
  expect(rows).toHaveLength(3)
  expect(rows.find((r) => r.target === 'Café team' && r.model === 'asr/a')).toMatchObject({
    scored: 2,
    matched: 1
  })
  expect(rows.find((r) => r.target === "O'Neil")).toMatchObject({ matched: 0 })
})

it('shows the five most recent comparable outcomes without mutating history or implying retained audio', () => {
  const history = Array.from({ length: 8 }, (_, i) =>
    take({ id: String(i), createdAt: 8 - i, rawText: 'Amira' })
  )
  const before = JSON.stringify(history)
  const [row] = practiceProgress(history)
  expect(row.recent.map((r) => r.id)).toEqual(['4', '3', '2', '1', '0'])
  expect(row).toMatchObject({ takes: 8, scored: 8, matched: 8, retained: 0 })
  expect(JSON.stringify(history)).toBe(before)
})
