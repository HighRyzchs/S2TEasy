import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defaultSpeechCues, parseCueResponse, type CueAnalysis } from '@shared/speech-cues'
import type { HistoryItem } from '@shared/types'
import { SpeechCuePanel } from './SpeechCuePanel'
let host: HTMLDivElement, root: Root
const item = (): HistoryItem => ({
  id: 'take',
  text: 'My words.',
  source: 'practice',
  model: 'asr',
  createdAt: 1,
  durationMs: 3000,
  status: 'complete',
  hasAudio: true
})
const result = (): CueAnalysis => ({
  ...parseCueResponse(
    {
      quality: 'usable',
      summary: 'Even delivery.',
      cues: [
        {
          startMs: 0,
          endMs: 2000,
          kind: 'emotion',
          label: 'calm',
          strength: 'tentative',
          evidence: 'Even pace.'
        }
      ]
    },
    defaultSpeechCues(),
    0,
    3000
  ),
  schemaVersion: 1,
  id: 'analysis',
  model: 'audio/model',
  createdAt: 1,
  startMs: 0,
  endMs: 3000,
  observations: { durationMs: 3000, rms: 0.1, clippedFraction: 0, quietIntervals: [] }
})
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
const button = (text: string) =>
  [...host.querySelectorAll('button')].find((n) => n.textContent === text)!
it('keeps cloud analysis off by default, requires retained audio, and rejects an oversized range in the UI', async () => {
  const analyze = vi.fn()
  window.s2t = { analyzeSpeechCues: analyze } as never
  const props = {
    item: item(),
    settings: defaultSpeechCues(),
    text: 'My words.',
    active: false,
    position: 0,
    onHistory: vi.fn(),
    onConfigure: vi.fn()
  }
  await act(async () => root.render(<SpeechCuePanel {...props} />))
  expect(host.textContent).toContain('Speech cues are off')
  expect(analyze).not.toHaveBeenCalled()
  await act(async () =>
    root.render(
      <SpeechCuePanel
        {...props}
        settings={{ ...props.settings, enabled: true }}
        item={{ ...props.item, hasAudio: false }}
      />
    )
  )
  expect(host.textContent).toContain('no retained audio')
  expect(analyze).not.toHaveBeenCalled()
  await act(async () =>
    root.render(<SpeechCuePanel {...props} settings={{ ...props.settings, enabled: true }} />)
  )
  const end = host.querySelectorAll('input')[1]
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(end, '31')
    end.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(button('Analyze excerpt · paid call').disabled).toBe(true)
})
it('copies user-edited emotion context separately from plain text and resets feedback to the model suggestion', async () => {
  const copy = vi.fn().mockResolvedValue(true),
    feedback = vi.fn().mockResolvedValue([])
  window.s2t = { copyHistory: copy, cueFeedback: feedback } as never
  const analysis = result()
  analysis.cues[0].userLabel = 'playful'
  await act(async () =>
    root.render(
      <SpeechCuePanel
        item={{ ...item(), cueAnalysis: analysis }}
        settings={defaultSpeechCues()}
        text="Actual words unchanged."
        active={false}
        position={0}
        onHistory={vi.fn()}
        onConfigure={vi.fn()}
      />
    )
  )
  await act(async () => button('Copy structured context').click())
  expect(JSON.parse(copy.mock.calls[0][0])).toMatchObject({
    text: 'Actual words unchanged.',
    audioContext: { cues: [{ label: 'playful', source: 'user' }] }
  })
  const select = host.querySelector('select')!
  await act(async () => {
    select.value = ''
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(feedback).toHaveBeenCalledWith('take', 'analysis', { cueId: 'cue-0', label: null })
})
it('cancels a pending analysis when Review unmounts and ignores its late result', async () => {
  let resolve!: (rows: HistoryItem[]) => void
  const analyze = vi.fn(
      () =>
        new Promise<HistoryItem[]>((r) => {
          resolve = r
        })
    ),
    cancel = vi.fn().mockResolvedValue(undefined),
    onHistory = vi.fn()
  window.s2t = { analyzeSpeechCues: analyze, cancelSpeechCues: cancel } as never
  await act(async () =>
    root.render(
      <SpeechCuePanel
        item={item()}
        settings={{ ...defaultSpeechCues(), enabled: true }}
        text="My words."
        active={false}
        position={0}
        onHistory={onHistory}
        onConfigure={vi.fn()}
      />
    )
  )
  await act(async () => button('Analyze excerpt · paid call').click())
  expect(analyze).toHaveBeenCalledWith('take', { startMs: 0, endMs: 3000 })
  await act(async () => root.render(<div>Closed</div>))
  expect(cancel).toHaveBeenCalledWith('take')
  await act(async () => resolve([{ ...item(), cueAnalysis: result() }]))
  expect(onHistory).not.toHaveBeenCalled()
})
