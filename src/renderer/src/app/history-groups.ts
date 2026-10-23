import type { HistoryItem } from '@shared/types'

export type GroupedHistory = { label: string; items: HistoryItem[] }[]
export function groupHistory(items: HistoryItem[]): GroupedHistory {
  const groups = new Map<string, HistoryItem[]>()
  for (const item of items) {
    const label = dayLabel(item.createdAt)
    const list = groups.get(label) ?? []
    list.push(item)
    groups.set(label, list)
  }
  return [...groups.entries()].map(([label, rows]) => ({ label, items: rows }))
}
function dayLabel(ts: number): string {
  const date = new Date(ts),
    today = new Date(),
    yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
    month: 'long',
    day: 'numeric'
  })
}
