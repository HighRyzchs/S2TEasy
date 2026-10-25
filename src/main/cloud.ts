import { safeStorage, shell } from 'electron'
import { createServer, type Server } from 'node:http'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { CloudStatus } from '../shared/cloud'
import { DEFAULT_CLOUD_URL } from '../shared/constants'
import type { WordTiming } from '../shared/word-timing'
import type { TranscribeInput } from './openrouter'

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

  /**
   * The Cloud's address: the official one, or a server on this PC (development and tests). Any other
   * address is refused, so a changed setting can't send sign-ins or the session somewhere else.
   */
  private base(): string {
    const url = this.getUrl().trim().replace(/\/$/, '')
    if (url && (url === DEFAULT_CLOUD_URL || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url))) return url
    throw new CloudError(0, 'no_cloud', 'S2Teasy Cloud is not available at that address.')
  }

  /** The session, only for the server that issued it. */
  private token(): string {
    if (!existsSync(this.tokenFile)) return ''
    try {
      const raw = readFileSync(this.tokenFile)
      if (!safeStorage.isEncryptionAvailable()) return ''
      const saved = JSON.parse(safeStorage.decryptString(raw)) as { url?: string; token?: string }
      return saved.url === this.base() && typeof saved.token === 'string' ? saved.token : ''
    } catch {
      return ''
    }
  }

  private saveToken(token: string): void {
    if (!safeStorage.isEncryptionAvailable())
      throw new CloudError(0, 'no_keychain', 'Windows could not protect the sign-in on this PC, so it was not kept.')
    writeFileSync(this.tokenFile, safeStorage.encryptString(JSON.stringify({ url: this.base(), token })))
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
   * Sign-in (RFC 8252, loopback): listen on a free port on 127.0.0.1, open the sign-in page in the
   * browser, and wait for the browser to hand the one-time grant to that port when Google sign-in is
   * done. The session is collected with the grant and a poll secret only this app holds, so a sign-in
   * page someone else opened can never give them this account, nor this app theirs.
   */
  async signIn(): Promise<string> {
    this.signing?.abort()
    const abort = new AbortController()
    this.signing = abort
    const listener = await loopback(abort.signal)
    try {
      const started = await this.call<{ id: string; poll: string; url: string }>(
        '/auth/start',
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ port: listener.port }) },
        false
      )
      const expected = `${this.base()}/login?id=`
      if (!started.url.startsWith(expected)) throw new CloudError(0, 'bad_url', 'S2Teasy Cloud sent an unexpected sign-in link.')
      await shell.openExternal(started.url)
      const grant = await listener.grant
      const result = await this.call<{ status: string; token?: string }>(
        '/auth/poll',
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: started.id, poll: started.poll, grant }) },
        false
      )
      if (result.status !== 'done' || !result.token) throw new CloudError(0, 'not_done', 'Sign-in did not finish. Try again.')
      this.saveToken(result.token)
      const me = await this.status()
      this.onSignedIn(me.email)
      return me.email
    } finally {
      listener.close()
    }
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
    if (!url.startsWith('https://checkout.stripe.com/')) throw new CloudError(0, 'bad_url', 'S2Teasy Cloud sent an unexpected payment link.')
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

const SIGNED_IN_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Signed in · S2Teasy</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0e1113;color:#eef3f1;font:15px/1.5 "Segoe UI",system-ui,sans-serif}
main{background:#161b1e;border:1px solid #273035;border-radius:18px;padding:32px;max-width:420px;text-align:center}h1{font-size:22px;margin:0 0 8px}p{margin:0;color:#a3b1ac}</style></head>
<body><main><div style="font-size:30px">✅</div><h1>You are signed in</h1><p>Go back to S2Teasy. You can close this tab.</p></main></body></html>`

/** A one-shot listener on 127.0.0.1 for the browser to hand back the sign-in grant. */
async function loopback(signal: AbortSignal): Promise<{ port: number; grant: Promise<string>; close: () => void }> {
  let server: Server
  let timer: NodeJS.Timeout
  const grant = new Promise<string>((resolve, reject) => {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const value = url.searchParams.get('grant') ?? ''
      if (req.method !== 'GET' || url.pathname !== '/s2teasy-signed-in' || !/^[\w-]{16,64}$/.test(value)) {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' })
      res.end(SIGNED_IN_PAGE)
      resolve(value)
    })
    timer = setTimeout(() => reject(new CloudError(0, 'timeout', 'Sign-in took too long. Try again.')), SIGN_IN_MS)
    signal.addEventListener('abort', () => reject(new CloudError(0, 'cancelled', 'Sign-in cancelled.')))
  })
  grant.catch(() => undefined)
  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port))
  })
  return {
    port,
    grant,
    close: () => {
      clearTimeout(timer)
      server.close()
    }
  }
}
