import type { HistoryItem } from '@shared/types'

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'tag'; text: string }
  | { kind: 'fix'; text: string; heard: string }

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Splits a session's text into plain runs, cue tags such as [calm], and words your voice fixed.
 * A fixed word carries what the engine heard, so it can be shown on hover.
 */
export function segmentText(text: string, fixes: { from: string; to: string }[] = []): Segment[] {
  if (!text) return []
  const heardBy = new Map<string, string[]>()
  for (const fix of fixes) {
    if (!fix.to.trim()) continue
    heardBy.set(fix.to, [...(heardBy.get(fix.to) ?? []), fix.from])
  }
  const parts = ['\\[[^\\]\\n]{1,40}\\]']
  const targets = [...heardBy.keys()].sort((a, b) => b.length - a.length)
  if (targets.length) {
    parts.push(
      `(?<![\\p{L}\\p{N}_])(?:${targets.map((t) => escape(t).replace(/\s+/g, '\\s+')).join('|')})(?![\\p{L}\\p{N}_])`
    )
  }
  const pattern = new RegExp(parts.join('|'), 'gu')
  const used = new Map<string, number>()
  const out: Segment[] = []
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0
    if (at > last) out.push({ kind: 'text', text: text.slice(last, at) })
    const word = match[0]
    const forms = heardBy.get(word)
    if (forms) {
      const n = used.get(word) ?? 0
      used.set(word, n + 1)
      out.push({ kind: 'fix', text: word, heard: forms[Math.min(n, forms.length - 1)]! })
    } else if (word.startsWith('[')) out.push({ kind: 'tag', text: word })
    else out.push({ kind: 'text', text: word })
    last = at + word.length
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out
}

export const countWords = (text: string) =>
  text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const timeOf = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** "2:14 PM" today, "Yesterday, 6:20 PM", or "Oct 3, 6:20 PM". */
export function formatWhen(ts: number, now = Date.now()): string {
  const date = new Date(ts)
  const today = new Date(now)
  const yesterday = new Date(now)
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return timeOf(ts)
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${timeOf(ts)}`
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeOf(ts)}`
}

export const needsRecovery = (item: HistoryItem) =>
  item.status === 'error' || item.status === 'interrupted'

export const isWorking = (item: HistoryItem) =>
  item.status === 'recording' || item.status === 'processing'

export type StatusInfo = { label: string; tone: 'good' | 'bad' | 'off' }

export function statusInfo(item: HistoryItem): StatusInfo {
  if (needsRecovery(item)) return { label: 'Recover', tone: 'bad' }
  if (isWorking(item)) return { label: 'Draft', tone: 'off' }
  if (item.status === 'cancelled') return { label: 'Saved', tone: 'off' }
  if (item.source === 'practice') return { label: 'Practice', tone: 'off' }
  return item.source === 'final' ? { label: 'Inserted', tone: 'good' } : { label: 'Typed', tone: 'good' }
}

export const appName = (item: HistoryItem) => item.app?.name ?? 'Unknown app'

/** What the list shows for a session whose text may be empty. */
export function previewText(item: HistoryItem): string {
  if (item.text.trim()) return item.text
  if (item.error) return item.error
  return isWorking(item) ? 'Listening for words…' : 'No words were saved for this session.'
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`
