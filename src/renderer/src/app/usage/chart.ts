import type { UsageRecord } from '@shared/usage'

/** Smallest "round" axis maximum (1, 2, 2.5, 5 times a power of ten) that holds the value. */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0.05
  const power = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * power >= value * 0.9999) return step * power
  }
  return 10 * power
}

/** Share of the plot height (0 to 100) a value takes; never NaN, never above 100. */
export function percentOf(value: number, top: number): number {
  if (!(top > 0) || !Number.isFinite(value) || value <= 0) return 0
  return Math.min(100, (value / top) * 100)
}

/** "$0", "$1.84", "$0.052", "$0.0031": more digits for small amounts, trailing zeros trimmed. */
export function formatMoney(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '$0'
  const digits = value >= 0.995 ? 2 : value >= 0.01 ? 3 : 4
  let text = value.toFixed(digits)
  if (text === (0).toFixed(digits)) return '<$0.0001'
  text = text.replace(/(\.\d\d)0+$/, '$1')
  return `$${text}`
}

export function formatTalkTime(ms: number): string {
  const minutes = Math.round(Math.max(0, ms) / 60_000)
  if (minutes < 1) return ms > 0 ? '<1 m' : '0 m'
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} m` : `${minutes} m`
}

export function formatDelay(ms: number | null): string {
  if (ms === null) return '–'
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`
}

/** Reported spend since the first of the month containing `now`; unpriced requests count as 0. */
export { monthSpend } from '@shared/usage'

export const SOURCE_LABEL: Record<UsageRecord['source'], string> = {
  dictation: 'Live speech',
  'speech-cues': 'Emotion cues',
  recovery: 'Recovering dropped audio'
}
