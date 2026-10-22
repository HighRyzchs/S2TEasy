import { existsSync, readFileSync, copyFileSync } from 'node:fs'
import { atomicJson } from './session-journal'
import { emptyUsage, type UsageRecord, type UsageState } from '../shared/usage'
const LIMIT = 10_000
export class UsageStore {
  private state: UsageState = emptyUsage()
  constructor(private readonly path: string) {
    if (!existsSync(path)) return
    try {
      const saved = JSON.parse(readFileSync(path, 'utf8'))
      if (!Array.isArray(saved.records)) throw new Error('Invalid usage file')
      this.state.records = saved.records
        .filter(
          (r: UsageRecord) =>
            typeof r.id === 'string' &&
            Number.isFinite(r.createdAt) &&
            typeof r.model === 'string' &&
            Number.isFinite(r.durationMs) &&
            r.durationMs >= 0 &&
            (r.costUsd === null || (Number.isFinite(r.costUsd) && r.costUsd >= 0))
        )
        .slice(-LIMIT)
      this.state.truncated = saved.truncated === true || saved.records.length > LIMIT
    } catch {
      this.state.warning =
        'Usage history could not be read. Totals are incomplete; your provider remains the billing authority.'
      try {
        copyFileSync(path, `${path}.unreadable-${Date.now()}`)
      } catch {
        /* Preserve original. */
      }
    }
  }
  snapshot(): UsageState {
    return { ...this.state, records: [...this.state.records] }
  }
  record(row: UsageRecord): UsageState {
    if (this.state.records.some((entry) => entry.id === row.id)) return this.snapshot()
    this.state.records.push(row)
    if (this.state.records.length > LIMIT) {
      this.state.records.splice(0, this.state.records.length - LIMIT)
      this.state.truncated = true
    }
    try {
      atomicJson(this.path, {
        version: 1,
        records: this.state.records,
        truncated: this.state.truncated
      })
    } catch {
      this.state.warning =
        'Usage could not be saved to disk. This view includes in-memory records; provider billing may include other requests.'
    }
    return this.snapshot()
  }
}
