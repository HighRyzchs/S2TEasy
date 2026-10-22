import { app, screen, type BrowserWindow } from 'electron'

const PIN_MS = 250
const HWND_TOPMOST = -1
const GWL_EXSTYLE = -20
const WS_EX_TOPMOST = 0x00000008
const SWP_NOSIZE = 0x0001
const SWP_NOMOVE = 0x0002
const SWP_NOACTIVATE = 0x0010

type NativeTopmost = {
  pin: (hwnd: bigint) => void
}

export function hwndFromHandle(buffer: Buffer): bigint {
  if (buffer.length >= 8) return buffer.readBigUInt64LE(0)
  return BigInt(buffer.readUInt32LE(0))
}

function loadNative(): NativeTopmost | null {
  if (process.platform !== 'win32') return null
  try {
    // koffi is unpacked from asar on Windows.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi') as {
      load: (name: string) => { func: (sig: string) => (...args: unknown[]) => unknown }
    }
    const user32 = koffi.load('user32.dll')
    const SetWindowPos = user32.func(
      'bool __stdcall SetWindowPos(uintptr hWnd, intptr hWndInsertAfter, int X, int Y, int cx, int cy, uint32 uFlags)'
    )
    const GetWindowLongPtrW = user32.func('intptr __stdcall GetWindowLongPtrW(uintptr hWnd, int nIndex)')
    const SetWindowLongPtrW = user32.func(
      'intptr __stdcall SetWindowLongPtrW(uintptr hWnd, int nIndex, intptr dwNewLong)'
    )
    return {
      pin(hwnd) {
        const current = Number(GetWindowLongPtrW(hwnd, GWL_EXSTYLE))
        if (!Number.isNaN(current) && (current & WS_EX_TOPMOST) === 0) {
          SetWindowLongPtrW(hwnd, GWL_EXSTYLE, current | WS_EX_TOPMOST)
        }
        SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)
      }
    }
  } catch (error) {
    console.error('S2Teasy: overlay topmost helper unavailable', error)
    return null
  }
}

const native = loadNative()

function pinNative(window: BrowserWindow): void {
  if (!native) return
  try {
    native.pin(hwndFromHandle(window.getNativeWindowHandle()))
  } catch (error) {
    console.error('S2Teasy: failed to pin overlay', error)
  }
}

export function pinOverlayTopmost(window: BrowserWindow): void {
  if (window.isDestroyed() || !window.isVisible()) return
  window.setAlwaysOnTop(true, 'screen-saver')
  try {
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  } catch {
    // macOS/Linux helper; Windows may ignore it.
  }
  pinNative(window)
}

function keepOverlayTopmost(window: BrowserWindow): void {
  if (window.isDestroyed() || !window.isVisible()) return
  if (native) pinNative(window)
  else window.setAlwaysOnTop(true, 'screen-saver')
}

export function attachOverlayTopmost(window: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null

  const stop = (): void => {
    if (!timer) return
    clearInterval(timer)
    timer = null
  }

  const arm = (): void => {
    pinOverlayTopmost(window)
    if (timer || window.isDestroyed() || !window.isVisible()) return
    timer = setInterval(() => keepOverlayTopmost(window), PIN_MS)
  }

  try {
    const originalShowInactive = window.showInactive.bind(window)
    Object.defineProperty(window, 'showInactive', {
      configurable: true,
      value: () => {
        window.setAlwaysOnTop(true, 'screen-saver')
        originalShowInactive()
        arm()
      }
    })
  } catch {
    // 'show' still arms the keeper if showInactive cannot be wrapped.
  }

  window.on('show', arm)
  window.on('hide', stop)
  window.on('blur', () => pinOverlayTopmost(window))
  window.on('closed', stop)

  const onDisplayChange = (): void => pinOverlayTopmost(window)
  screen.on('display-metrics-changed', onDisplayChange)
  screen.on('display-added', onDisplayChange)
  screen.on('display-removed', onDisplayChange)

  const onAppZOrder = (): void => pinOverlayTopmost(window)
  app.on('browser-window-focus', onAppZOrder)
  app.on('browser-window-blur', onAppZOrder)

  window.on('closed', () => {
    screen.off('display-metrics-changed', onDisplayChange)
    screen.off('display-added', onDisplayChange)
    screen.off('display-removed', onDisplayChange)
    app.off('browser-window-focus', onAppZOrder)
    app.off('browser-window-blur', onAppZOrder)
  })
}
