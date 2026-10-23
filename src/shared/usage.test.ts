import { describe, expect, it } from 'vitest'
import { normalizeSettings } from './types'
import { extrasPaused, type UsageRecord } from './usage'

const now = new Date(2026, 9, 20, 12).getTime()
const row = (createdAt: number, costUsd: number | null): UsageRecord => ({
  id: String(createdAt),
  operationId: String(createdAt),
  sessionId: 's',
  source: 'speech-cues',
  createdAt,
  engine: 'openrouter',
  model: 'm',
  costUsd,
  durationMs: 1000,
  latencyMs: 100,
  attempt: 1,
  outcome: 'success'
})

describe('monthly limit', () => {
  const records = [row(new Date(2026, 9, 2).getTime(), 1.5), row(new Date(2026, 8, 29).getTime(), 9), row(now, null)]

  it('pauses extras only once this month reaches the limit', () => {
    expect(extrasPaused(records, 0, now)).toBe(false)
    expect(extrasPaused(records, 2, now)).toBe(false)
    expect(extrasPaused(records, 1.5, now)).toBe(true)
  })

  it('stores no limit unless a positive amount is set', () => {
    expect(normalizeSettings({}).monthlyLimitUsd).toBe(0)
    expect(normalizeSettings({ monthlyLimitUsd: -3 }).monthlyLimitUsd).toBe(0)
    expect(normalizeSettings({ monthlyLimitUsd: 4.567 }).monthlyLimitUsd).toBe(4.57)
    expect(normalizeSettings({ monthlyLimitUsd: Number.NaN }).monthlyLimitUsd).toBe(0)
  })
})
