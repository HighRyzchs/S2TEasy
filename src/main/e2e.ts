import type { ListenOptions, RouterTranscript } from './router-audio'

/**
 * End-to-end test mode (S2T_E2E=1 only): a scripted streaming engine so the real app, HUD and
 * overlay window can be driven without a network, an API key or a microphone. Never active
 * otherwise.
 */
export const e2eEnabled = process.env.S2T_E2E === '1'

const SCRIPT = ['so I talked to risks today', 'and Gigi no read was the call', 'see you at nine tonight then']

let segment = 0

type Handlers = { onTranscript: (event: RouterTranscript) => void; onError: (message: string) => void }

/** Stands in for RouterAudioClient: types one scripted line per segment, word by word. */
export class FakeStream {
  private timers: NodeJS.Timeout[] = []
  private handlers: Handlers | null = null
  private finalSent = false
  private line = SCRIPT[segment++ % SCRIPT.length]!
  private words = this.line.split(' ')

  async connect(_options: ListenOptions, handlers: Handlers): Promise<void> {
    this.handlers = handlers
    this.words.forEach((_, i) =>
      this.timers.push(
        setTimeout(() => {
          const text = this.words.slice(0, i + 1).join(' ')
          if (i < this.words.length - 1) handlers.onTranscript({ kind: 'transcript', text, isPartial: true })
          else this.sendFinal()
        }, 250 * (i + 1))
      )
    )
  }

  private sendFinal(): void {
    if (this.finalSent || !this.handlers) return
    this.finalSent = true
    this.handlers.onTranscript({
      kind: 'transcript',
      text: this.line,
      isPartial: false,
      words: this.words.map((text, i) => ({ text, startMs: i * 250, endMs: i * 250 + 220 }))
    })
  }

  sendPcm(): void {}

  async finish(): Promise<void> {
    for (const timer of this.timers) clearTimeout(timer)
    this.sendFinal()
  }

  close(): void {
    for (const timer of this.timers) clearTimeout(timer)
    this.handlers = null
  }
}

/** Stands in for the Windows text injector: records what would be typed into the target app. */
export class FakeInjector {
  typed = ''
  captureTarget(): void {}
  async paste(text: string): Promise<void> {
    this.typed += text
  }
  async pasteBlock(text: string): Promise<void> {
    this.typed += text
  }
  async replaceTail(erase: number, text: string): Promise<void> {
    this.typed = this.typed.slice(0, Math.max(0, this.typed.length - erase)) + text
  }
  restoreTarget(): boolean {
    return true
  }
  targetApp(): string | null {
    return null
  }
}

export const fakeInjector = new FakeInjector()
