import type { HistoryItem } from './types'
import type { UsageRecord } from './usage'
import { heardForms, type VocabularyEntry } from './vocabulary'

/** Everything the Usage page shows, computed locally from History and usage records. */
export type Analytics = {
  range: { days: number; from: number; to: number; bucket: 'day' | 'week' }
  spend: number
  /** Requests whose provider did not report a price (local engines excluded). */
  unknownPrice: number
  words: number
  sessions: number
  talkMs: number
  /** Words fixed by personal words before they were typed. */
  fixed: number
  medianLatencyMs: number | null
  series: { at: number; label: string; speech: number; cues: number; recovery: number }[]
  apps: { name: string; exe?: string; words: number }[]
  /** Weekly share of personal-word uses that came out right (heard right or fixed in time). */
  recognized: { at: number; label: string; right: number; total: number }[]
  models: {
    model: string
    source: UsageRecord['source']
    requests: number
    failed: number
    medianLatencyMs: number | null
    cost: number | null
  }[]
  outcomes: { complete: number; recovered: number; failed: number; cancelled: number }
}

const DAY = 86_400_000

function startOfDay(at: number): number {
  const d = new Date(at)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
}

const wordCount = (text: string) => text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length

const validCost = (row: UsageRecord) =>
  typeof row.costUsd === 'number' && Number.isFinite(row.costUsd) && row.costUsd >= 0

function label(at: number, bucket: 'day' | 'week'): string {
  const text = new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return bucket === 'week' ? `Week of ${text}` : text
}

/** Occurrences of a whole word or phrase, case-insensitive, in plain text. */
function occurrences(text: string, phrase: string): number {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')
  return (text.match(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu')) ?? [])
    .length
}

/**
 * How one session went for the user's own words: right = heard correctly by the engine or fixed by
 * a personal word before typing; missed = the user had to correct it by hand in the HUD.
 */
export function personalWordResults(
  item: Pick<HistoryItem, 'rawText' | 'text' | 'fixes' | 'edits'>,
  entries: VocabularyEntry[]
): { right: number; missed: number } {
  const active = entries.filter((entry) => entry.enabled)
  if (!active.length) return { right: 0, missed: 0 }
  const raw = item.rawText ?? item.text
  let heardRight = 0
  for (const entry of active) heardRight += occurrences(raw, entry.meant)
  const fixed = item.fixes?.length ?? 0
  const meant = new Set(active.map((entry) => entry.meant.toLocaleLowerCase()))
  const forms = new Set(active.flatMap((entry) => heardForms(entry).map((f) => f.toLocaleLowerCase())))
  const missed = (item.edits ?? []).filter(
    (edit) => meant.has(edit.to.toLocaleLowerCase()) || forms.has(edit.from.toLocaleLowerCase())
  ).length
  return { right: heardRight + fixed, missed }
}

export function analyze(input: {
  history: HistoryItem[]
  records: UsageRecord[]
  vocabulary?: VocabularyEntry[]
  days: number
  now?: number
}): Analytics {
  const now = input.now ?? Date.now()
  const days = Math.max(1, Math.round(input.days))
  const bucket: 'day' | 'week' = days > 45 ? 'week' : 'day'
  const from = startOfDay(now) - (days - 1) * DAY
  const step = bucket === 'week' ? 7 * DAY : DAY
  const count = Math.ceil(days / (bucket === 'week' ? 7 : 1))
  const series = Array.from({ length: count }, (_, i) => {
    const at = from + i * step
    return { at, label: label(at, bucket), speech: 0, cues: 0, recovery: 0 }
  })
  const slot = (at: number) => series[Math.min(series.length - 1, Math.floor((at - from) / step))]

  const records = input.records.filter((row) => row.createdAt >= from && row.createdAt <= now)
  let spend = 0
  let unknownPrice = 0
  const models = new Map<string, Analytics['models'][number] & { latencies: number[]; priced: boolean }>()
  for (const row of records) {
    const priced = validCost(row)
    const cost = priced ? row.costUsd! : 0
    if (!priced && row.engine !== 'local') unknownPrice++
    spend += cost
    const target = slot(row.createdAt)
    if (target) {
      if (row.source === 'speech-cues' || row.source === 'context-check') target.cues += cost
      else if (row.source === 'recovery') target.recovery += cost
      else target.speech += cost
    }
    const key = `${row.model}\u0000${row.source}`
    const model = models.get(key) ?? {
      model: row.model,
      source: row.source,
      requests: 0,
      failed: 0,
      medianLatencyMs: null,
      cost: 0,
      latencies: [],
      priced: false
    }
    model.requests++
    if (row.outcome === 'error') model.failed++
    if (row.outcome === 'success' && row.latencyMs > 0) model.latencies.push(row.latencyMs)
    model.cost = (model.cost ?? 0) + cost
    model.priced ||= priced || row.engine === 'local'
    models.set(key, model)
  }

  const sessions = input.history.filter(
    (item) => item.createdAt >= from && item.createdAt <= now && item.source !== 'practice'
  )
  const outcomes = { complete: 0, recovered: 0, failed: 0, cancelled: 0 }
  // A session counts as recovered when its words came back through a recovery request.
  const recoveredIds = new Set(
    input.records.filter((row) => row.source === 'recovery').map((row) => row.sessionId)
  )
  const apps = new Map<string, { name: string; exe?: string; words: number }>()
  const weeks = new Map<number, { right: number; total: number }>()
  let words = 0
  let talkMs = 0
  let fixed = 0
  for (const item of sessions) {
    if (item.status === 'error' || item.status === 'interrupted') outcomes.failed++
    else if (item.status === 'cancelled') outcomes.cancelled++
    else if (item.status === 'complete' && recoveredIds.has(item.id)) outcomes.recovered++
    else if (item.status === 'complete' || !item.status) outcomes.complete++
    const count = wordCount(item.text)
    words += count
    talkMs += Math.max(0, item.durationMs)
    fixed += item.fixes?.length ?? 0
    const name = item.app?.name ?? 'Other apps'
    const app = apps.get(name) ?? { name, exe: item.app?.exe, words: 0 }
    app.words += count
    apps.set(name, app)
    const result = personalWordResults(item, input.vocabulary ?? [])
    if (result.right + result.missed) {
      const week = startOfDay(item.createdAt) - new Date(item.createdAt).getDay() * DAY
      const row = weeks.get(week) ?? { right: 0, total: 0 }
      row.right += result.right
      row.total += result.right + result.missed
      weeks.set(week, row)
    }
  }

  const latencies = records
    .filter((row) => row.outcome === 'success' && row.latencyMs > 0 && row.source === 'dictation')
    .map((row) => row.latencyMs)
  const ranked = [...apps.values()].sort((a, b) => b.words - a.words)
  const top = ranked.slice(0, 5)
  const rest = ranked.slice(5).reduce((sum, app) => sum + app.words, 0)
  if (rest) top.push({ name: 'Everything else', words: rest })

  return {
    range: { days, from, to: now, bucket },
    spend,
    unknownPrice,
    words,
    sessions: sessions.length,
    talkMs,
    fixed,
    medianLatencyMs: median(latencies),
    series,
    apps: top.filter((app) => app.words > 0),
    recognized: [...weeks.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(-8)
      .map(([at, row]) => ({ at, label: label(at, 'week'), ...row })),
    models: [...models.values()]
      .map(({ latencies: values, priced, ...model }) => ({
        ...model,
        medianLatencyMs: median(values),
        cost: priced ? model.cost : null
      }))
      .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0) || b.requests - a.requests),
    outcomes
  }
}
