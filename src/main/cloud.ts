import { safeStorage, shell } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { CloudStatus } from '../shared/cloud'
import type { WordTiming } from '../shared/word-timing'
import type { TranscribeInput } from './openrouter'

const POLL_MS = 2000
const SIGN_IN_MS = 10 * 60_000

class CloudError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

/**
 * S2Teasy Cloud: hosted credits. The app holds no provider key, only its own session token for the
 * Cloud, kept encrypted on this PC (Windows' data protection) and never in settings.json.
 */
export class CloudClient {
  private signing: AbortController | null = null

  constructor(
    private readonly tokenFile: string,
    private readonly getUrl: () => string,
    private readonly onSignedIn: (email: string) => void
  ) {}

  private base(): string {
    const url = this.getUrl().trim().replace(/\/$/, '')
    if (!/^https:\/\/[^/]+$/.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url))
      throw new CloudError(0, 'no_cloud', 'S2Teasy Cloud is not set up in this version yet.')
    return url
  }

  private token(): string {
    if (!existsSync(this.tokenFile)) return ''
    try {
      const raw = readFileSync(this.tokenFile)
      return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : ''
    } catch {
      return ''
    }
  }

  private saveToken(token: string): void {
    if (!safeStorage.isEncryptionAvailable())
      throw new CloudError(0, 'no_keychain', 'Windows could not protect the sign-in on this PC, so it was not kept.')
    writeFileSync(this.tokenFile, safeStorage.encryptString(token))
  }

  private async call<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
    const headers = new Headers(init.headers)
    if (auth) {
      const token = this.token()
      if (!token) throw new CloudError(401, 'signed_out', 'Sign in to S2Teasy Cloud in Settings.')
      headers.set('authorization', `Bearer ${token}`)
    }
    let response: Response
    try {
      response = await fetch(`${this.base()}${path}`, { ...init, headers })
    } catch (error) {
      if (error instanceof CloudError) throw error
      throw new CloudError(0, 'offline', 'Could not reach S2Teasy Cloud. Check your connection.')
    }
    const body = (await response.json().catch(() => ({}))) as T & { error?: string; message?: string }
    if (!response.ok) {
      if (response.status === 401 && auth) this.forget()
      throw new CloudError(response.status, body.error ?? 'error', body.message ?? `S2Teasy Cloud: HTTP ${response.status}`)
    }
    return body
  }

  private forget(): void {
    rmSync(this.tokenFile, { force: true })
  }

  signedIn(): boolean {
    return !!this.token()
  }

  /**
   * Opens the sign-in page in the browser and waits for it to finish, up to ten minutes. The app
   * collects its session with a secret only it knows; nothing travels back through a link.
   */
  async signIn(): Promise<string> {
    this.signing?.abort()
    const abort = new AbortController()
    this.signing = abort
    const started = await this.call<{ id: string; poll: string; url: string }>('/auth/start', { method: 'POST' }, false)
    if (!/^https?:\/\//.test(started.url)) throw new CloudError(0, 'bad_url', 'S2Teasy Cloud sent an unexpected sign-in link.')
    await shell.openExternal(started.url)
    const end = Date.now() + SIGN_IN_MS
    while (Date.now() < end) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
      if (abort.signal.aborted) throw new CloudError(0, 'cancelled', 'Sign-in cancelled.')
      const result = await this.call<{ status: string; token?: string }>(
        '/auth/poll',
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: started.id, poll: started.poll }) },
        false
      )
      if (result.status === 'done' && result.token) {
        this.saveToken(result.token)
        const me = await this.status()
        this.onSignedIn(me.email)
        return me.email
      }
    }
    throw new CloudError(0, 'timeout', 'Sign-in took too long. Try again.')
  }

  cancelSignIn(): void {
    this.signing?.abort()
  }

  async status(): Promise<CloudStatus> {
    const me = await this.call<Omit<CloudStatus, 'signedIn'>>('/me')
    return { ...me, signedIn: true }
  }

  async signOut(everywhere: boolean): Promise<void> {
    try {
      await this.call(everywhere ? '/auth/signout-all' : '/auth/signout', { method: 'POST' })
    } finally {
      this.forget()
    }
  }

  /** Opens Stripe's checkout page for a pack in the browser. */
  async buy(pack: string): Promise<void> {
    const { url } = await this.call<{ url: string }>('/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pack })
    })
    if (!/^https:\/\//.test(url)) throw new CloudError(0, 'bad_url', 'S2Teasy Cloud sent an unexpected payment link.')
    await shell.openExternal(url)
  }

  async redeem(code: string): Promise<{ seconds: number; balance: number }> {
    return this.call('/redeem', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) })
  }

  /** One pause-to-pause piece of speech, as WAV, to text. */
  async transcribe(input: TranscribeInput): Promise<string> {
    const began = Date.now()
    const query = new URLSearchParams()
    if (input.language) query.set('language', input.language)
    const prompt = [input.mixedLanguages, input.vocabulary?.slice(0, 100).join(', ')].filter(Boolean).join(' ')
    if (prompt) query.set('prompt', prompt.slice(0, 800))
    if (input.onWords) query.set('words', '1')
    const audio = Buffer.from(input.wavBase64, 'base64')
    let outcome: 'success' | 'error' = 'error'
    try {
      const result = await this.call<{ text: string; words?: { word: string; start: number; end: number }[]; chargedSeconds: number }>(
        `/transcribe?${query}`,
        { method: 'POST', body: audio, headers: { 'content-type': 'audio/wav' }, signal: input.signal }
      )
      if (result.words?.length && input.onWords) {
        const words: WordTiming[] = result.words.map((w) => ({
          text: w.word.trim(),
          startMs: Math.round(w.start * 1000),
          endMs: Math.round(w.end * 1000)
        }))
        input.onWords(words)
      }
      outcome = 'success'
      return result.text
    } catch (error) {
      if (error instanceof CloudError && error.status === 402)
        throw new Error('S2Teasy Cloud: out of credit. Top up in Settings → Speech engine. Your words are saved in History.')
      throw error
    } finally {
      try {
        input.onUsage?.({
          id: randomUUID(),
          operationId: randomUUID(),
          createdAt: began,
          engine: 'cloud',
          model: 'S2Teasy Cloud',
          costUsd: null,
          durationMs: Math.round((audio.length - 44) / 32),
          latencyMs: Date.now() - began,
          attempt: 1,
          outcome
        })
      } catch {
        // Usage is a convenience; it never fails a dictation.
      }
    }
  }
}
