import { readWordTimings, type WordTiming } from '../shared/word-timing'
import { ROUTER_AUDIO_LISTEN, SAMPLE_RATE } from '../shared/constants'
import type { RouterProvider } from '../shared/types'

export type ListenOptions = {
  apiKey: string
  provider: RouterProvider
  language?: string
  sampleRate?: number
  /**
   * Experimental, opt-in: personal words as Deepgram `keyterm` parameters. router.audio does not
   * document key terms, so they are only sent when the user picks the Deepgram provider and asks.
   */
  keyterms?: string[]
  /**
   * Experimental, opt-in: listen for English mixed with these languages (ISO codes) with Deepgram's
   * code-switching (`language=multi` and a `language_hint` per language).
   */
  mixedLanguages?: string[]
}

export type RouterTranscript = {
  kind: 'transcript'
  text: string
  isPartial: boolean
  words?: WordTiming[]
}

export type RouterEvent = RouterTranscript | { kind: 'error'; message: string } | { kind: 'ignore' }

export function buildListenUrl(options: ListenOptions): { url: string; redacted: string } {
  const params = new URLSearchParams({
    provider: options.provider || 'auto',
    encoding: 'pcm_s16le',
    sample_rate: String(options.sampleRate ?? SAMPLE_RATE),
    interim_results: 'true',
    api_key: options.apiKey.trim()
  })
  if (options.language?.trim()) params.set('language', options.language.trim())
  if (options.provider === 'deepgram') {
    for (const term of (options.keyterms ?? []).slice(0, 50)) params.append('keyterm', term)
    if (options.mixedLanguages?.length) {
      params.set('language', 'multi')
      for (const code of ['en', ...options.mixedLanguages]) params.append('language_hint', code)
    }
  }
  const query = params.toString()
  const url = `${ROUTER_AUDIO_LISTEN}?${query}`
  const redactedParams = new URLSearchParams(params)
  redactedParams.set('api_key', '***')
  return { url, redacted: `${ROUTER_AUDIO_LISTEN}?${redactedParams.toString()}` }
}

export function parseListenMessage(raw: string): RouterEvent {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { kind: 'ignore' }
  }
  if (!data || typeof data !== 'object') return { kind: 'ignore' }
  const obj = data as Record<string, unknown>
  const type = typeof obj.type === 'string' ? obj.type.toLowerCase() : ''

  if (type === 'error' || obj.error) {
    return { kind: 'error', message: readError(obj) }
  }

  const text = readTranscriptText(obj)
  if (!text) return { kind: 'ignore' }
  if (type && type !== 'transcript' && type !== 'result' && type !== 'results') {
    return { kind: 'ignore' }
  }
  const channel = obj.channel as { alternatives?: { words?: unknown }[] } | undefined
  const words = readWordTimings(obj.words ?? channel?.alternatives?.[0]?.words)
  return {
    kind: 'transcript',
    text,
    isPartial: readPartial(obj),
    ...(words.length ? { words } : {})
  }
}

export function closeReason(code: number, reason: string): string | null {
  if (code === 1000 || code === 1001) return null
  const text = reason.trim()
  if (code === 1008 || code === 4001 || code === 4401 || code === 401) {
    return text || 'router.audio rejected this API key.'
  }
  if (text) return text
  if (code === 1006) return 'Lost the router.audio connection.'
  return `router.audio closed the stream (${code}).`
}

type StreamHandlers = {
  onTranscript: (event: RouterTranscript) => void
  onError: (message: string) => void
}

export class RouterAudioClient {
  private ws: WebSocket | null = null
  private closed = false
  private finishing = false
  private handlers: StreamHandlers | null = null
  private cancelConnect: (() => void) | null = null
  private finishWait: (() => void) | null = null

  async connect(options: ListenOptions, handlers: StreamHandlers): Promise<void> {
    this.close()
    this.closed = false
    this.finishing = false
    this.handlers = handlers
    const { url } = buildListenUrl(options)
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const ws = new WebSocket(url)
      this.ws = ws
      this.cancelConnect = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(new Error('Connection cancelled.'))
      }
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        this.close()
        reject(new Error('router.audio did not connect in time.'))
      }, 10_000)

      ws.addEventListener('open', () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve()
      })
      ws.addEventListener('error', () => {
        if (settled) {
          if (!this.closed && this.ws === ws) handlers.onError('Lost the router.audio connection.')
          return
        }
        settled = true
        clearTimeout(timer)
        this.close()
        reject(new Error('Could not reach router.audio.'))
      })
      ws.addEventListener('message', (event) => {
        if (this.closed || this.ws !== ws) return
        const raw = typeof event.data === 'string' ? event.data : ''
        if (!raw) return
        const parsed = parseListenMessage(raw)
        if (parsed.kind === 'error') {
          if (!settled) {
            settled = true
            clearTimeout(timer)
            this.close()
            reject(new Error(parsed.message))
            return
          }
          this.handlers?.onError(parsed.message)
          return
        }
        if (parsed.kind === 'transcript') this.handlers?.onTranscript(parsed)
      })
      ws.addEventListener('close', (event) => {
        if (this.ws !== ws || this.closed) return
        this.finishWait?.()
        if (!settled) {
          settled = true
          clearTimeout(timer)
          reject(
            new Error(
              closeReason(event.code, event.reason) || 'router.audio closed before connecting.'
            )
          )
          return
        }
        if (this.finishing) return
        handlers.onError(
          closeReason(event.code, event.reason) ||
            'router.audio ended the stream before you stopped. Saved audio can be recovered.'
        )
      })
    })
  }

  sendPcm(bytes: Uint8Array): void {
    const ws = this.ws
    if (!ws || this.finishing || ws.readyState !== WebSocket.OPEN) return
    ws.send(bytes)
  }

  async finish(drainMs = 6000): Promise<void> {
    this.finishing = true
    const ws = this.ws
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'finalize' }))
      } catch {
        // some providers ignore finalize
      }
    }
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer)
        this.finishWait = null
        resolve()
      }
      const timer = setTimeout(done, drainMs)
      this.finishWait = done
      if (!ws || ws.readyState === WebSocket.CLOSED) done()
    })
    this.close()
  }

  close(): void {
    this.cancelConnect?.()
    this.cancelConnect = null
    this.finishWait?.()
    this.closed = true
    this.finishing = true
    const ws = this.ws
    this.ws = null
    if (!ws) return
    try {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000)
      }
    } catch {
      // ignore
    }
  }
}

export async function testRouterAudioKey(
  apiKey: string,
  provider: RouterProvider
): Promise<{ ok: boolean; message: string }> {
  const key = apiKey.trim()
  if (!key) return { ok: false, message: 'Paste a router.audio or provider API key first.' }
  const client = new RouterAudioClient()
  try {
    await client.connect(
      { apiKey: key, provider },
      {
        onTranscript: () => undefined,
        onError: () => undefined
      }
    )
    client.close()
    return { ok: true, message: 'Connected to router.audio.' }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not reach router.audio.'
    }
  }
}

function readTranscriptText(obj: Record<string, unknown>): string {
  if (typeof obj.transcript === 'string' && obj.transcript.trim()) return obj.transcript
  if (typeof obj.text === 'string' && obj.text.trim()) return obj.text
  const channel = obj.channel
  if (channel && typeof channel === 'object') {
    const alts = (channel as { alternatives?: { transcript?: unknown }[] }).alternatives
    const first = alts?.[0]?.transcript
    if (typeof first === 'string' && first.trim()) return first
  }
  return ''
}

function readPartial(obj: Record<string, unknown>): boolean {
  if (typeof obj.is_partial === 'boolean') return obj.is_partial
  if (typeof obj.isPartial === 'boolean') return obj.isPartial
  if (typeof obj.is_final === 'boolean') return !obj.is_final
  if (typeof obj.isFinal === 'boolean') return !obj.isFinal
  return false
}

function readError(obj: Record<string, unknown>): string {
  if (typeof obj.message === 'string' && obj.message.trim()) return obj.message
  const err = obj.error
  if (typeof err === 'string' && err.trim()) return err
  if (
    err &&
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string'
  ) {
    return (err as { message: string }).message
  }
  return 'router.audio returned an error.'
}
