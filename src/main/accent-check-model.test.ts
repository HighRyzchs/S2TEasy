import { afterEach, expect, it, vi } from 'vitest'
import { accentSlots } from '../shared/accent-check'
import { checkAccentSwaps } from './accent-check-model'

afterEach(() => vi.unstubAllGlobals())

const text = 'I ride my bite home'
const slots = accentSlots(text, [{ id: 'b', heard: 'bike', meant: 'bite', enabled: true, kind: 'accent' }], [
  { entryId: 'b', from: 'bike', to: 'bite' }
])

it('sends only the marked text, applies the choice and records the cost', async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ choices: [{ slot: 1, word: 'bike' }] }) } }],
      usage: { cost: 0.00004 }
    })
  })
  vi.stubGlobal('fetch', fetcher)
  const onUsage = vi.fn()
  const result = await checkAccentSwaps({ apiKey: 'k', text, slots, signal: new AbortController().signal, onUsage })
  expect(result.text).toBe('I ride my bike home')
  const body = JSON.parse(fetcher.mock.calls[0][1].body)
  expect(body.messages[1].content).toBe('I ride my ⟦1: bite | bike⟧ home')
  expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ costUsd: 0.00004, outcome: 'success' }))
})

it('makes no request when there is nothing to check', async () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  const result = await checkAccentSwaps({ apiKey: 'k', text, slots: [], signal: new AbortController().signal, onUsage: vi.fn() })
  expect(result).toEqual({ text, reverted: [] })
  expect(fetcher).not.toHaveBeenCalled()
})
