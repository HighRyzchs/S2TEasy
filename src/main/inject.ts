import { clipboard } from 'electron'
import { withTrailingSpace } from '../shared/transcript'

type NativeBridge = {
  getForegroundWindow(): unknown
  setForegroundWindow(hwnd: unknown): boolean
  sendCtrlV(): void
}

function loadNative(): NativeBridge | null {
  if (process.platform !== 'win32') return null
  try {
    // koffi is unpacked from asar on Windows.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi') as {
      load: (name: string) => { func: (sig: string) => (...args: unknown[]) => unknown }
    }
    const user32 = koffi.load('user32.dll')
    const GetForegroundWindow = user32.func('void* __stdcall GetForegroundWindow()')
    const SetForegroundWindow = user32.func('bool __stdcall SetForegroundWindow(void* hWnd)')
    const keybd_event = user32.func(
      'void __stdcall keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr dwExtraInfo)'
    )
    const VK_CONTROL = 0x11
    const VK_V = 0x56
    const KEYUP = 0x0002
    return {
      getForegroundWindow: () => GetForegroundWindow(),
      setForegroundWindow: (hwnd) => Boolean(SetForegroundWindow(hwnd)),
      sendCtrlV: () => {
        keybd_event(VK_CONTROL, 0, 0, 0)
        keybd_event(VK_V, 0, 0, 0)
        keybd_event(VK_V, 0, KEYUP, 0)
        keybd_event(VK_CONTROL, 0, KEYUP, 0)
      }
    }
  } catch (error) {
    console.error('S2Teasy: Windows injector unavailable', error)
    return null
  }
}

const native = loadNative()

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class TextInjector {
  private hwnd: unknown = null

  captureTarget(): void {
    this.hwnd = native?.getForegroundWindow() ?? null
  }

  async paste(text: string): Promise<void> {
    if (!text) return
    if (!native)
      throw new Error(
        'Automatic typing requires Windows native input support. Your transcript is saved in History.'
      )
    if (!this.hwnd || !native.setForegroundWindow(this.hwnd))
      throw new Error(
        'Could not restore the target window. Your transcript is saved in History; copy or insert it again.'
      )
    const previous = clipboard.readText()
    clipboard.writeText(text)
    try {
      await sleep(30)
      native.sendCtrlV()
      await sleep(120)
    } finally {
      // Respect a clipboard change the user made while insertion was in progress.
      if (clipboard.readText() === text) clipboard.writeText(previous)
    }
  }

  async pasteBlock(text: string): Promise<void> {
    await this.paste(withTrailingSpace(text))
  }
}
