import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defaultHudSettings } from '@shared/hud'
import { emptyOverlay, type OverlayState } from '@shared/types'
import { Hud } from './Hud'
import type { HudApi } from './types'

let host: HTMLDivElement, root: Root
const TEXT = 'Yeah, I talked to Ryzchs about the stream. [excited] He wants to demo it.'

const api = (): { [K in keyof HudApi]: ReturnType<typeof vi.fn> } => ({
  hudEdit: vi.fn(async () => 'typed'),
  hudPause: vi.fn(async () => undefined),
  hudFinish: vi.fn(async () => undefined),
  hudHold: vi.fn(),
  hudCues: vi.fn(async () => undefined),
  hudFocus: vi.fn(async () => undefined),
  hudPointer: vi.fn(),
  learnWord: vi.fn(async () => ({})),
  copyHistory: vi.fn(async () => true),
  cancelRecording: vi.fn(async () => undefined)
})

const session = (patch: Partial<OverlayState> = {}): OverlayState => ({
  ...emptyOverlay(),
  status: 'paused',
  partial: TEXT,
  typedLength: 0,
  cues: true,
  sessionId: 's1',
  ...patch
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

const mount = async (mock: ReturnType<typeof api>, state = session()) => {
  await act(async () =>
    root.render(
      <Hud
        state={state}
        settings={defaultHudSettings()}
        position="bottom"
        barsRef={{ current: [] }}
        api={mock as unknown as HudApi}
      />
    )
  )
}
const button = (text: string) =>
  [...host.querySelectorAll('button')].find((node) => node.textContent === text)!
const fire = async (target: Element | Document, type: string) =>
  act(async () => {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }))
  })

it('shows the paused editor with cue tags as chips and the controls wired up', async () => {
  const mock = api()
  await mount(mock)
  const hud = host.querySelector('.hud')!
  expect(hud.getAttribute('data-phase')).toBe('paused')
  expect(hud.getAttribute('data-open')).toBe('true')
  expect(hud.getAttribute('data-cue')).toBe('excited')
  expect(host.querySelector('.hud-tag')?.textContent).toBe('[excited]')
  expect(host.querySelector('.hud-count')?.textContent).toBe('13')

  await act(async () => button('Done').click())
  await act(async () => button('Resume').click())
  await act(async () => button('Discard').click())
  expect(mock.hudFinish).toHaveBeenCalled()
  expect(mock.hudPause).toHaveBeenCalled()
  expect(mock.cancelRecording).toHaveBeenCalled()
})

it('holds the finish timer while the pointer is on the HUD', async () => {
  const mock = api()
  await mount(mock)
  expect(mock.hudHold).toHaveBeenLastCalledWith(false)
  await fire(host.querySelector('.hud')!, 'pointerover')
  expect(mock.hudPointer).toHaveBeenCalledWith(true)
  expect(mock.hudHold).toHaveBeenLastCalledWith(true)
  await fire(host.querySelector('.hud')!, 'pointerout')
  expect(mock.hudPointer).toHaveBeenLastCalledWith(false)
  expect(mock.hudHold).toHaveBeenLastCalledWith(false)
})

it('edits a word in place, sends exact offsets, then offers to remember it', async () => {
  const mock = api()
  await mount(mock)
  const word = [...host.querySelectorAll<HTMLElement>('.hud-w')].find((w) => w.textContent === 'Ryzchs')!
  await fire(word, 'pointerdown')
  await fire(document, 'pointerup')

  const input = host.querySelector<HTMLInputElement>('.hud-edit')!
  expect(input.value).toBe('Ryzchs')
  expect(mock.hudFocus).toHaveBeenCalledWith(true)

  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    set.call(input, 'Rizz')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  })

  const start = TEXT.indexOf('Ryzchs')
  expect(mock.hudEdit).toHaveBeenCalledWith('s1', start, start + 'Ryzchs'.length, 'Rizz')
  expect(mock.hudFocus).toHaveBeenLastCalledWith(false)
  expect(host.querySelector('.hud-edit')).toBeNull()
  expect(host.querySelector('.hud-pop')?.textContent).toContain('Rizz')

  await act(async () => button('Name').click())
  expect(mock.learnWord).toHaveBeenCalledWith({ heard: 'Ryzchs', meant: 'Rizz', kind: 'name' })
  expect(host.querySelector('.hud-pop')).toBeNull()
})

it('keeps the edit box and its text when new words arrive', async () => {
  const mock = api()
  await mount(mock)
  const word = [...host.querySelectorAll<HTMLElement>('.hud-w')].find((w) => w.textContent === 'Yeah,')!
  await fire(word, 'pointerdown')
  await fire(document, 'pointerup')
  const input = host.querySelector<HTMLInputElement>('.hud-edit')!
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    set.call(input, 'Yeah!!')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await mount(mock, session({ partial: `${TEXT} And more words.` }))
  expect(host.querySelector('.hud-edit')).toBe(input)
  expect(input.value).toBe('Yeah!!')
})

it('does not start an edit across a cue tag', async () => {
  const mock = api()
  await mount(mock)
  const words = [...host.querySelectorAll<HTMLElement>('.hud-w')]
  const before = words.find((w) => w.textContent === 'stream.')!
  const after = words.find((w) => w.textContent === 'He')!
  await fire(before, 'pointerdown')
  await act(async () => {
    after.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
  })
  await fire(document, 'pointerup')
  expect(host.querySelector<HTMLInputElement>('.hud-edit')!.value).toBe('stream.')
})

it('shows the leaving state with the layout it had, and a short saved line afterwards', async () => {
  const mock = api()
  await mount(mock, session({ status: 'listening' }))
  await mount(mock, session({ status: 'leaving' }))
  expect(host.querySelector('.hud')!.classList.contains('out')).toBe(true)
  expect(host.querySelector('.hud')!.getAttribute('data-phase')).toBe('rec')
  await mount(mock, session({ status: 'success' }))
  expect(host.querySelector('.hud-title')?.textContent).toContain('Saved · 13 words')
})
