import { clipboard } from 'electron'
import { withTrailingSpace } from '../shared/transcript'

type NativeBridge = {
  getForegroundWindow(): unknown
  setForegroundWindow(hwnd: unknown): boolean
  sendCtrlV(): void
  sendBackspaces(count: number): void
  /** Full path of the program that owns a window, or null when Windows won't say. */
  processPath(hwnd: unknown): string | null
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
    const kernel32 = koffi.load('kernel32.dll')
    const GetWindowThreadProcessId = user32.func(
      'uint32 __stdcall GetWindowThreadProcessId(void* hWnd, _Out_ uint32* pid)'
    )
    const OpenProcess = kernel32.func(
      'void* __stdcall OpenProcess(uint32 access, bool inherit, uint32 pid)'
    )
    const QueryFullProcessImageNameW = kernel32.func(
      'bool __stdcall QueryFullProcessImageNameW(void* process, uint32 flags, _Out_ uint16* name, _Inout_ uint32* size)'
    )
    const CloseHandle = kernel32.func('bool __stdcall CloseHandle(void* handle)')
    const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    const keybd_event = user32.func(
      'void __stdcall keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr dwExtraInfo)'
    )
    const VK_CONTROL = 0x11
    const VK_V = 0x56
    const VK_BACK = 0x08
    const KEYUP = 0x0002
    return {
      getForegroundWindow: () => GetForegroundWindow(),
      setForegroundWindow: (hwnd) => Boolean(SetForegroundWindow(hwnd)),
      sendCtrlV: () => {
        keybd_event(VK_CONTROL, 0, 0, 0)
        keybd_event(VK_V, 0, 0, 0)
        keybd_event(VK_V, 0, KEYUP, 0)
        keybd_event(VK_CONTROL, 0, KEYUP, 0)
      },
      processPath: (hwnd) => {
        const pid = [0]
        GetWindowThreadProcessId(hwnd, pid)
        if (!pid[0]) return null
        const process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid[0])
        if (!process) return null
        try {
          const name = new Uint16Array(1024)
          const size = [name.length]
          if (!QueryFullProcessImageNameW(process, 0, name, size)) return null
          return String.fromCharCode(...name.subarray(0, size[0]))
        } finally {
          CloseHandle(process)
        }
      },
      sendBackspaces: (count) => {
        for (let i = 0; i < count; i++) {
          keybd_event(VK_BACK, 0, 0, 0)
          keybd_event(VK_BACK, 0, KEYUP, 0)
        }
      }
    }
  } catch (error) {
    console.error('S2Teasy: Windows injector unavailable', error)
    return null
  }
}

const native = loadNative()

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let clipboardRevision = 0
export function copyTranscript(text: string): boolean {
  clipboardRevision++
  clipboard.writeText(text)
  return true
}

export class TextInjector {
  private hwnd: unknown = null
  constructor(private readonly bridge: NativeBridge | null = native) {}

  captureTarget(): void {
    this.hwnd = this.bridge?.getForegroundWindow() ?? null
  }

  /** The program the session types into, for its name and icon in History. Never the window title. */
  targetApp(): string | null {
    if (!this.hwnd || !this.bridge) return null
    try {
      return this.bridge.processPath(this.hwnd)
    } catch {
      return null
    }
  }

  async paste(text: string, signal?: AbortSignal): Promise<void> {
    if (!text) return
    signal?.throwIfAborted()
    if (!this.bridge)
      throw new Error(
        'Automatic typing requires Windows native input support. Your transcript is saved in History.'
      )
    if (!this.hwnd || !this.bridge.setForegroundWindow(this.hwnd))
      throw new Error(
        'Could not restore the target window. Your transcript is saved in History; copy or insert it again.'
      )
    const revision = clipboardRevision
    const previous = clipboard.readText()
    clipboard.writeText(text)
    try {
      await sleep(30)
      signal?.throwIfAborted()
      this.bridge.sendCtrlV()
      await sleep(120)
    } finally {
      // Respect a clipboard change the user made while insertion was in progress.
      if (revision === clipboardRevision && clipboard.readText() === text)
        clipboard.writeText(previous)
    }
  }

  async pasteBlock(text: string, signal?: AbortSignal): Promise<void> {
    await this.paste(withTrailingSpace(text), signal)
  }

  /** Give focus back to the app the session started in (after editing in the HUD). */
  restoreTarget(): boolean {
    return !!this.hwnd && !!this.bridge?.setForegroundWindow(this.hwnd)
  }

  /**
   * Replace the last `erase` characters S2Teasy typed with `text`. The caller has already checked
   * that nothing else touched the target since it typed them.
   */
  async replaceTail(erase: number, text: string, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    if (!this.bridge) throw new Error('Replacing typed text requires Windows native input support.')
    if (!this.hwnd || !this.bridge.setForegroundWindow(this.hwnd))
      throw new Error('Could not return to the app to fix the text. The fix is saved in History.')
    await sleep(30)
    signal?.throwIfAborted()
    this.bridge.sendBackspaces(erase)
    await sleep(20 + Math.min(erase, 400))
    if (text) await this.paste(text, signal)
  }
}
