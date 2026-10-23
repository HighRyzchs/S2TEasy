import { describe, expect, it } from 'vitest'
import { analyze, personalWordResults } from './analytics'
import type { HistoryItem } from './types'
import type { UsageRecord } from './usage'

const NOW = new Date(2026, 9, 23, 18).getTime()
const DAY = 86_400_000
const item = (patch: Partial<HistoryItem>): HistoryItem => ({
  id: Math.random().toString(36),
  text: 'one two three',
  model: 'router.audio/auto',
  createdAt: NOW - DAY,
  durationMs: 3000,
  source: 'live',
  status: 'complete',
  ...patch
})
const usage = (patch: Partial<UsageRecord>): UsageRecord => ({
  id: Math.random().toString(36),
  operationId: 'op',
  sessionId: 's',
  source: 'dictation',
  createdAt: NOW - DAY,
  engine: 'router-audio',
  model: 'router.audio/auto',
  costUsd: 0.01,
  durationMs: 3000,
  latencyMs: 140,
  attempt: 1,
  outcome: 'success',
  ...patch
})
const s2 = { id: 's2', heard: 'as two teasy', meant: 'S2Teasy', enabled: true }

describe('usage analytics', () => {
  it('splits spend by purpose per day and counts requests without a price', () => {
    const out = analyze({
      history: [],
      records: [
        usage({}),
        usage({ source: 'speech-cues', costUsd: 0.002, model: 'google/gemini-2.5-flash-lite' }),
        usage({ source: 'recovery', costUsd: null, engine: 'openrouter', createdAt: NOW - 2 * DAY }),
        usage({ costUsd: null, engine: 'local', model: 'local/whisper' }),
        usage({ createdAt: NOW - 40 * DAY })
      ],
      days: 7,
      now: NOW
    })
    expect(out.spend).toBeCloseTo(0.012)
    expect(out.unknownPrice).toBe(1)
    expect(out.series).toHaveLength(7)
    expect(out.series[5]).toMatchObject({ speech: 0.01, cues: 0.002 })
    expect(out.models.find((m) => m.model === 'local/whisper')?.cost).toBe(0)
    expect(out.models.find((m) => m.source === 'recovery')?.cost).toBeNull()
  })

  it('switches to weekly buckets for long ranges', () => {
    const out = analyze({ history: [], records: [], days: 90, now: NOW })
    expect(out.range.bucket).toBe('week')
    expect(out.series).toHaveLength(13)
  })

  it('counts words, time, fixes, apps and outcomes from History, skipping practice takes', () => {
    const out = analyze({
      history: [
        item({ app: { name: 'Discord', exe: 'D.exe' }, fixes: [{ entryId: 'x', from: 'a', to: 'b' }] }),
        item({ app: { name: 'Discord', exe: 'D.exe' }, text: 'four five' }),
        item({ app: { name: 'Notion', exe: 'N.exe' }, status: 'error' }),
        item({ status: 'cancelled', text: '' }),
        item({ source: 'practice', text: 'ignored words here' })
      ],
      records: [],
      days: 30,
      now: NOW
    })
    expect(out).toMatchObject({ words: 8, sessions: 4, talkMs: 12000, fixed: 1 })
    expect(out.apps).toEqual([
      { name: 'Discord', exe: 'D.exe', words: 5 },
      { name: 'Notion', exe: 'N.exe', words: 3 }
    ])
    expect(out.outcomes).toEqual({ complete: 2, recovered: 0, failed: 1, cancelled: 1 })
  })

  it('scores personal words: heard right, fixed in time, or fixed by hand', () => {
    expect(
      personalWordResults(
        {
          rawText: 'the S2Teasy demo and as two teasy',
          text: 'the S2Teasy demo and S2Teasy',
          fixes: [{ entryId: 's2', from: 'as two teasy', to: 'S2Teasy' }],
          edits: [{ from: 's two t easy', to: 'S2Teasy' }]
        },
        [s2]
      )
    ).toEqual({ right: 2, missed: 1 })
    expect(personalWordResults({ text: 'S2Teasy' }, [])).toEqual({ right: 0, missed: 0 })
  })
})
