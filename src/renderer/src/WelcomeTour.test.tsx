import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defaultSettings } from '@shared/types'
import { WelcomeTour } from './WelcomeTour'
vi.mock('./useHudPreview', () => ({
  useHudPreview: () => ({ state: { status: 'listening', partial: 'Preview' }, bars: [] })
}))
vi.mock('./OverlayHud', () => ({ OverlayHud: () => <div>Simulated HUD</div> }))
let host: HTMLDivElement, root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
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
  [...host.querySelectorAll('button')].find((node) => node.textContent === text)!
it('allows a neutral welcome and routes unconfigured users to speech setup with explicit saved preferences', async () => {
  const onFinish = vi.fn().mockResolvedValue(undefined)
  await act(async () =>
    root.render(<WelcomeTour settings={defaultSettings()} onFinish={onFinish} />)
  )
  await act(async () => button('Continue →').click())
  await act(async () => button('Continue →').click())
  expect(host.textContent).toContain('Ready for your first thought?')
  await act(async () => button('Set up speech engine →').click())
  expect(onFinish).toHaveBeenCalledWith(
    {
      displayName: '',
      welcomeCompleted: true,
      appearance: 'dark',
      overlayTheme: defaultSettings().overlayTheme,
      recoveryAudio: true
    },
    'engine'
  )
  expect(onFinish.mock.calls[0][0]).not.toHaveProperty('apiKey')
  expect(onFinish.mock.calls[0][0]).not.toHaveProperty('vocabulary')
})
it('keeps the tour open and preserves input/preferences when saving fails, then supports retry', async () => {
  const onFinish = vi
    .fn()
    .mockRejectedValueOnce(new Error('Disk is full'))
    .mockResolvedValue(undefined)
  await act(async () =>
    root.render(
      <WelcomeTour
        settings={{ ...defaultSettings(), displayName: '@River', recoveryAudio: false }}
        onFinish={onFinish}
      />
    )
  )
  await act(async () => button('Save & exit').click())
  expect(host.querySelector('dialog')?.hasAttribute('open')).toBe(true)
  expect(host.querySelector('[role="alert"]')?.textContent).toBe('Disk is full')
  expect((host.querySelector('#welcome-name') as HTMLInputElement).value).toBe('@River')
  await act(async () => button('Save & exit').click())
  expect(onFinish).toHaveBeenCalledTimes(2)
  expect(onFinish).toHaveBeenLastCalledWith(
    expect.objectContaining({
      displayName: '@River',
      recoveryAudio: false,
      welcomeCompleted: true
    }),
    'overview'
  )
})

it('provides an explicit unsaved exit if local storage fails', async () => {
  const onFinish = vi.fn().mockRejectedValue(new Error('Cannot save settings'))
  const onDismiss = vi.fn()
  await act(async () =>
    root.render(
      <WelcomeTour settings={defaultSettings()} onFinish={onFinish} onDismiss={onDismiss} />
    )
  )
  await act(async () => button('Save & exit').click())
  await act(async () => button('Continue without saving').click())
  expect(onDismiss).toHaveBeenCalledOnce()
  expect(onFinish).toHaveBeenCalledOnce()
})
