import { describe, expect, it } from 'vitest'
import { groupHistory } from './App'
import type { HistoryItem } from '@shared/types'

describe('groupHistory', () => {
  it('buckets items by day label', () => {
    const items: HistoryItem[] = [
      {
        id: '1',
        text: 'hello',
        model: 'openai/whisper-large-v3',
        createdAt: Date.now(),
        durationMs: 1,
        source: 'live'
      },
      {
        id: '2',
        text: 'yesterday note',
        model: 'openai/whisper-large-v3',
        createdAt: Date.now() - 86_400_000,
        durationMs: 1,
        source: 'final'
      }
    ]
    const groups = groupHistory(items)
    expect(groups[0]?.label).toBe('Today')
    expect(groups[1]?.label).toBe('Yesterday')
  })
})
