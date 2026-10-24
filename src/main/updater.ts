import { app, shell } from 'electron'
import {
  createWriteStream,
  readFileSync,
  rmSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createHash, randomUUID } from 'node:crypto'
import { launchUpdateHelper } from './update-helper-launch'
import {
  downloadHeaders,
  downloadUrl,
  githubHeaders,
  missingLatestReleaseMessage,
  newestRelease,
  pickUpdateAsset,
  updateReleasesListApi,
  updateReleasesApi,
  type GithubRelease,
  type PickedAsset
} from '../shared/release'
import { idleUpdate, type Packaging, type UpdateStatus } from '../shared/types'
import { buildVerifiedApplyScript, updateTargetPath } from '../shared/update-install'
import { isNewerVersion, tagToVersion } from '../shared/version'
import { updateDiagnostics } from './update-diagnostics'

export function detectPackaging(): Packaging {
  if (!app.isPackaged) return 'dev'
  if (process.env.PORTABLE_EXECUTABLE_DIR || process.env.PORTABLE_EXECUTABLE_FILE) return 'portable'
  return 'installed'
}

export class UpdateLauncher {
  private status: UpdateStatus
  private asset: PickedAsset | null = null
  private payloadPath = ''
  private checking = false
  private lastCheck = 0

  constructor(
    private readonly getToken: () => string,
    private readonly onChange: (status: UpdateStatus) => void,
    private readonly temporaryRoot: string = tmpdir(),
    private readonly stateDirectory: string = app.getPath('userData')
  ) {
    this.status = idleUpdate(app.getVersion(), detectPackaging())
    this.status.phase = 'idle'
    this.status.message = 'Updates install in place — no uninstall.'
    try {
      const receipt = JSON.parse(
        readFileSync(join(this.stateDirectory, 'update-result.json'), 'utf8').replace(/^\uFEFF/, '')
      )
      if (receipt.status === 'applied' && receipt.toVersion === app.getVersion()) {
        this.status.phase = 'current'
        this.status.message = `Updated from ${receipt.fromVersion} to ${receipt.toVersion}.`
      } else if (
        ['failed', 'pending', 'waiting', 'installing'].includes(receipt.status) &&
        typeof receipt.toVersion === 'string' &&
        /^\d+\.\d+\.\d+$/.test(receipt.toVersion) &&
        (receipt.toVersion === app.getVersion() ||
          isNewerVersion(app.getVersion(), receipt.toVersion))
      ) {
        this.status.phase = 'current'
        this.status.message = `Running ${app.getVersion()}. The earlier automatic attempt to ${receipt.toVersion} did not confirm completion; its diagnostic report is retained.`
      } else if (receipt.status === 'failed') {
        this.status.phase = 'error'
        this.status.message = `Previous update could not be applied: ${String(receipt.message).slice(0, 300)} Your original app and local data are kept.`
      } else if (receipt.status === 'applied' && receipt.toVersion !== app.getVersion()) {
        this.status.phase = 'error'
        this.status.message = `The updater reported ${receipt.toVersion}, but this executable is still ${app.getVersion()}. Open update diagnostics and check the shortcut/install location, or run the installer directly.`
      } else if (['pending', 'waiting', 'installing'].includes(receipt.status)) {
        this.status.phase = 'error'
        this.status.message = `The previous update did not confirm completion (${receipt.status}). Open update diagnostics before retrying; if an installer is still running, let it finish.`
      }
    } catch {
      /* First launch or no valid update receipt. */
    }
  }

  getStatus(): UpdateStatus {
    return {
      ...this.status,
      canOpenInstaller:
        this.status.packaging === 'installed' &&
        !!this.payloadPath &&
        ['ready', 'error'].includes(this.status.phase)
    }
  }

  async check(opts: { force?: boolean; download?: boolean } = {}): Promise<UpdateStatus> {
    if (this.checking || this.status.phase === 'downloading' || this.status.phase === 'applying')
      return this.getStatus()
    const now = Date.now()
    if (!opts.force && now - this.lastCheck < 15 * 60_000 && this.status.phase !== 'idle') {
      return this.getStatus()
    }
    this.checking = true
    this.lastCheck = now
    this.set({ phase: 'checking', message: 'Checking GitHub for a newer build…', percent: 0 })
    try {
      const token = this.getToken()
      // A beta build also follows newer betas; stable builds only ever see full releases.
      const beta = this.status.currentVersion.includes('-')
      const response = await fetch(beta ? updateReleasesListApi() : updateReleasesApi(), {
        headers: githubHeaders(token),
        signal: AbortSignal.timeout(15_000)
      })
      if (response.status === 404) {
        this.asset = null
        this.set({
          phase: 'current',
          availableVersion: '',
          message: missingLatestReleaseMessage(Boolean(token.trim()))
        })
        return this.getStatus()
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          'GitHub denied the release request. Check repository access and rate limits.'
        )
      }
      if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`)
      const body = (await response.json()) as GithubRelease | GithubRelease[]
      const release = beta ? newestRelease(Array.isArray(body) ? body : []) : (body as GithubRelease)
      if (!release) {
        this.asset = null
        this.set({ phase: 'current', availableVersion: '', message: `You're on ${this.status.currentVersion}.` })
        return this.getStatus()
      }
      const packaging = this.status.packaging === 'dev' ? 'portable' : this.status.packaging
      const asset = pickUpdateAsset(release, packaging, { prerelease: beta })
      if (!asset && isNewerVersion(tagToVersion(release.tag_name), this.status.currentVersion))
        throw new Error(
          'This release does not include a compatible Windows installer. Check the release page or try again later.'
        )
      if (!asset || !isNewerVersion(asset.version, this.status.currentVersion)) {
        this.asset = null
        this.set({
          phase: 'current',
          availableVersion: asset?.version ?? '',
          message: `You're on ${this.status.currentVersion}.`
        })
        return this.getStatus()
      }
      this.asset = asset
      this.set({
        phase: 'available',
        availableVersion: asset.version,
        message: `Version ${asset.version} is ready to download.`
      })
      if (opts.download && this.status.packaging !== 'dev') {
        await this.download()
      }
      return this.getStatus()
    } catch (error) {
      this.set({
        phase: 'error',
        message: error instanceof Error ? error.message : 'Update check failed'
      })
      return this.getStatus()
    } finally {
      this.checking = false
    }
  }

  async download(): Promise<UpdateStatus> {
    if (this.status.phase === 'applying') return this.getStatus()
    if (this.status.packaging === 'dev') {
      this.set({ message: 'Dev build — publish a GitHub release to install on Windows.' })
      return this.getStatus()
    }
    if (!this.asset) {
      await this.check({ force: true })
    }
    const asset = this.asset
    if (!asset) return this.getStatus()
    if (this.status.phase === 'downloading') return this.getStatus()

    const dest = join(mkdtempSync(join(this.temporaryRoot, 's2teasy-update-')), asset.name)
    this.payloadPath = dest
    this.set({ phase: 'downloading', percent: 0, message: `Downloading ${asset.version}…` })
    try {
      if (!asset.digest || !/^sha256:[0-9a-f]{64}$/i.test(asset.digest))
        throw new Error(
          'This release has no SHA-256 digest. Automatic installation is disabled for this artifact.'
        )
      const token = this.getToken()
      const response = await fetch(downloadUrl(asset, token), {
        headers: downloadHeaders(token),
        redirect: 'follow',
        signal: AbortSignal.timeout(180_000)
      })
      if (!response.ok || !response.body) {
        throw new Error(`Download failed (HTTP ${response.status})`)
      }
      const total = Number(response.headers.get('content-length') || asset.size || 0)
      let received = 0
      const hash = createHash('sha256')
      const file = createWriteStream(dest)
      const source = Readable.fromWeb(response.body as never)
      source.on('data', (chunk: Buffer) => {
        hash.update(chunk)
        received += chunk.length
        const percent = total ? Math.min(99, Math.round((received / total) * 100)) : 0
        if (percent !== this.status.percent) {
          this.set({
            phase: 'downloading',
            percent,
            message: `Downloading ${asset.version}… ${percent}%`
          })
        }
      })
      await pipeline(source, file)
      if (hash.digest('hex') !== asset.digest.slice(7).toLowerCase()) {
        rmSync(dest, { force: true })
        throw new Error('Update checksum verification failed. The downloaded file was removed.')
      }
      this.set({
        phase: 'ready',
        percent: 100,
        availableVersion: asset.version,
        message: `Version ${asset.version} is ready. Restart to apply — no uninstall.`
      })
      return this.getStatus()
    } catch (error) {
      rmSync(dest, { force: true })
      this.payloadPath = ''
      this.set({
        phase: 'error',
        percent: 0,
        message: error instanceof Error ? error.message : 'Download failed'
      })
      return this.getStatus()
    }
  }

  install(): UpdateStatus {
    if (this.status.phase === 'applying') return this.getStatus()
    if (this.status.packaging === 'dev') {
      this.set({ message: 'Cannot replace a dev build. Use a packaged Windows exe.' })
      return this.getStatus()
    }
    if (this.status.phase !== 'ready' || !this.payloadPath) {
      this.set({ message: 'Download and verify an update before restarting.' })
      return this.getStatus()
    }
    try {
      if (
        !this.asset?.digest ||
        createHash('sha256').update(readFileSync(this.payloadPath)).digest('hex') !==
          this.asset.digest.slice(7).toLowerCase()
      )
        throw new Error('Update file missing or changed.')
    } catch {
      this.payloadPath = ''
      this.set({
        phase: 'error',
        message:
          'The update file is missing or changed. Download it again; your settings and history are unchanged.'
      })
      return this.getStatus()
    }
    try {
      const kind = this.status.packaging === 'installed' ? 'installed' : 'portable'
      const target = updateTargetPath(this.status.packaging, process.execPath, process.env)
      const attemptId = randomUUID()
      const attempts = join(this.stateDirectory, 'updates')
      mkdirSync(attempts, { recursive: true })
      const directory = mkdtempSync(join(attempts, 'attempt-'))
      const receiptPath = join(this.stateDirectory, 'update-result.json')
      const cancelPath = join(directory, 'cancelled')
      const script = buildVerifiedApplyScript({
        kind,
        currentExe: target,
        payloadPath: this.payloadPath,
        pid: process.pid,
        expectedSha256: this.asset!.digest!.slice(7),
        receiptPath,
        attemptId,
        cancelPath,
        fromVersion: this.status.currentVersion,
        toVersion: this.asset!.version
      })
      writeFileSync(join(directory, 'apply.ps1'), '\uFEFF' + script, { mode: 0o600 })
      writeFileSync(
        receiptPath,
        JSON.stringify({
          status: 'pending',
          attemptId,
          fromVersion: this.status.currentVersion,
          toVersion: this.asset!.version,
          target,
          payload: this.payloadPath,
          diagnostics: directory,
          at: new Date().toISOString()
        }),
        { mode: 0o600 }
      )
      // Claim the transition before spawning; IPC, tray clicks and status callbacks may re-enter.
      this.set({
        phase: 'applying',
        message: 'Waiting for the update helper to confirm it started…'
      })
      const child = launchUpdateHelper(script, directory, this.temporaryRoot)
      let quitTimer: ReturnType<typeof setTimeout> | undefined
      let poll: ReturnType<typeof setInterval> | undefined
      let settled = false
      const started = Date.now()
      const fail = (message: string) => {
        if (settled) return
        settled = true
        if (poll) clearInterval(poll)
        if (quitTimer) clearTimeout(quitTimer)
        try {
          writeFileSync(cancelPath, 'Cancelled before app shutdown.', { mode: 0o600 })
          writeFileSync(
            receiptPath,
            JSON.stringify({
              status: 'failed',
              attemptId,
              message,
              diagnostics: directory,
              fromVersion: this.status.currentVersion,
              toVersion: this.asset!.version,
              at: new Date().toISOString()
            }),
            { mode: 0o600 }
          )
        } catch {
          /* Keep the app open even when diagnostic storage fails. */
        }
        try {
          child.kill()
        } catch {
          /* Only this attempt's helper; it must not apply later after a failed handoff. */
        }
        this.set({
          phase: 'error',
          message: `${message} The app was kept open. Open update diagnostics or run the downloaded installer directly.`
        })
      }
      child.once('error', () => fail('Could not start the update helper.'))
      child.once('exit', (code) =>
        fail(`The update helper exited before shutdown (code ${code ?? 'unknown'}).`)
      )
      child.once('spawn', () => {
        poll = setInterval(() => {
          try {
            const receipt = JSON.parse(readFileSync(receiptPath, 'utf8').replace(/^\uFEFF/, ''))
            if (receipt.attemptId === attemptId && receipt.status === 'failed') {
              fail(String(receipt.message).slice(0, 300))
              return
            }
            if (receipt.attemptId === attemptId && receipt.status === 'waiting') {
              if (poll) clearInterval(poll)
              this.set({
                phase: 'applying',
                message: 'Update helper confirmed. Closing to install…'
              })
              quitTimer = setTimeout(() => {
                settled = true
                app.quit()
              }, 250)
              return
            }
          } catch {
            /* A receipt can be absent or mid-write; wait for a valid matching acknowledgement. */
          }
          if (Date.now() - started >= 30000)
            fail('The update helper did not acknowledge startup within 30 seconds.')
        }, 100)
      })
      child.unref()
    } catch (error) {
      this.set({
        phase: 'error',
        message: error instanceof Error ? error.message : 'Could not apply update.'
      })
    }
    return this.getStatus()
  }

  async openInstaller(): Promise<UpdateStatus> {
    if (this.status.packaging !== 'installed' || this.status.phase === 'applying')
      return this.getStatus()
    if (
      !this.payloadPath ||
      !this.asset?.digest ||
      createHash('sha256').update(readFileSync(this.payloadPath)).digest('hex') !==
        this.asset.digest.slice(7).toLowerCase()
    )
      throw new Error('Download and verify the installer before opening it.')
    const problem = await shell.openPath(this.payloadPath)
    if (problem) throw new Error(`Could not open the installer: ${problem}`)
    this.set({
      phase: 'idle',
      message: 'Installer opened. Follow its prompts; it may ask to close S2Teasy.'
    })
    return this.getStatus()
  }

  async openDiagnostics(): Promise<void> {
    const problem = await shell.openPath(this.stateDirectory)
    if (problem) throw new Error(`Could not open update diagnostics: ${problem}`)
  }

  diagnostics(): string {
    return updateDiagnostics(this.stateDirectory, this.status.currentVersion, this.status.packaging)
  }

  private set(patch: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...patch }
    this.onChange(this.getStatus())
  }
}
