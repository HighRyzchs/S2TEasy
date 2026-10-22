import type { SttEngine } from './types'

export type UsageMeasurement = {
  id: string
  operationId: string
  createdAt: number
  engine: SttEngine
  model: string
  costUsd: number | null
  durationMs: number
  latencyMs: number
  attempt: number
  outcome: 'success' | 'error' | 'cancelled'
  inputTokens?: number
  outputTokens?: number
}
export type UsageRecord = UsageMeasurement & { sessionId: string; source: 'dictation' | 'recovery' }
export type UsageState = { records: UsageRecord[]; warning: string; truncated: boolean }
export const emptyUsage = (): UsageState => ({ records: [], warning: '', truncated: false })
export const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export function summarizeUsage(records: UsageRecord[], days = 30, now = Date.now()) {
  const end = new Date(now)
  const daily = Array.from({ length: days }, (_, i) => {
    const date = new Date(end.getFullYear(), end.getMonth(), end.getDate() - days + i + 1)
    return { date: dayKey(date), at: date.getTime(), cost: 0, requests: 0 }
  })
  const selected = records.filter((row) => row.createdAt >= daily[0]!.at && row.createdAt <= now)
  const models = new Map<
    string,
    { model: string; cost: number; requests: number; unknown: number }
  >()
  const operations = new Map<string, number>()
  let cost = 0,
    unknown = 0,
    errors = 0
  for (const row of selected) {
    const valid =
      typeof row.costUsd === 'number' && Number.isFinite(row.costUsd) && row.costUsd >= 0
    const value = valid ? row.costUsd! : 0
    cost += value
    const unavailable = !valid && row.engine !== 'local'
    if (unavailable) unknown++
    if (row.outcome !== 'success') errors++
    operations.set(row.operationId, Math.max(operations.get(row.operationId) ?? 0, row.durationMs))
    const bucket = daily.find((day) => day.date === dayKey(new Date(row.createdAt)))
    if (bucket) {
      bucket.cost += value
      bucket.requests++
    }
    const model = models.get(row.model) ?? { model: row.model, cost: 0, requests: 0, unknown: 0 }
    model.cost += value
    model.requests++
    if (unavailable) model.unknown++
    models.set(row.model, model)
  }
  return {
    cost,
    unknown,
    errors,
    requests: selected.length,
    operations: operations.size,
    durationMs: [...operations.values()].reduce((sum, value) => sum + value, 0),
    daily,
    models: [...models.values()].sort((a, b) => b.cost - a.cost || b.requests - a.requests)
  }
}
export function usageCsv(records: UsageRecord[]): string {
  const quote = (value: unknown) =>
    `"${String(value ?? '')
      .replace(/^[=+@\t\r-]/, (m) => `'${m}`)
      .replace(/"/g, '""')}"`
  return [
    'timestamp,engine,model,source,cost_usd,audio_ms,latency_ms,attempt,outcome,operation_id',
    ...records.map((r) =>
      [
        new Date(r.createdAt).toISOString(),
        r.engine,
        r.model,
        r.source,
        r.costUsd,
        r.durationMs,
        r.latencyMs,
        r.attempt,
        r.outcome,
        r.operationId
      ]
        .map(quote)
        .join(',')
    )
  ].join('\r\n')
}
