import { describe, expect, it } from 'vitest'
import { formatDelay, formatMoney, formatTalkTime, monthSpend, niceMax, percentOf } from './chart'
import type { UsageRecord } from '@shared/usage'

describe('chart math', () => {
  it('rounds axis maxima up to a round value', () => {
    expect(niceMax(0)).toBe(0.05)
    expect(niceMax(NaN)).toBe(0.05)
    expect(niceMax(0.043)).toBe(0.05)
    expect(niceMax(0.051)).toBe(0.1)
    expect(niceMax(1.84)).toBe(2)
    expect(niceMax(2.3)).toBe(2.5)
    expect(niceMax(2.5)).toBe(2.5)
  })
  it('never divides by zero', () => {
    expect(percentOf(1, 0)).toBe(0)
    expect(percentOf(NaN, 1)).toBe(0)
    expect(percentOf(5, 2)).toBe(100)
    expect(percentOf(1, 4)).toBe(25)
  })
  it('formats money, time and delay', () => {
    expect(formatMoney(0)).toBe('$0')
    expect(formatMoney(1.836)).toBe('$1.84')
    expect(formatMoney(0.05)).toBe('$0.05')
    expect(formatMoney(0.0031)).toBe('$0.0031')
    expect(formatMoney(0.00000001)).toBe('<$0.0001')
    expect(formatTalkTime(0)).toBe('0 m')
    expect(formatTalkTime(4000)).toBe('<1 m')
    expect(formatTalkTime(3_900_000)).toBe('1 h 5 m')
    expect(formatDelay(null)).toBe('–')
    expect(formatDelay(1900)).toBe('1.9 s')
    expect(formatDelay(142)).toBe('142 ms')
  })
  it('sums this month only', () => {
    const now = new Date(2026, 9, 23, 12).getTime()
    const row = (at: number, costUsd: number | null) => ({ createdAt: at, costUsd }) as UsageRecord
    expect(
      monthSpend([row(new Date(2026, 9, 2).getTime(), 1.5), row(new Date(2026, 8, 30).getTime(), 9), row(now, null)], now)
    ).toBe(1.5)
    expect(monthSpend([], now)).toBe(0)
  })
})
