import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { mkdtempSync, rmSync, readdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
const app = vi.hoisted(() => ({
  isPackaged: true,
  getVersion: () => '1.3.1',
  getPath: () => '/tmp/s2teasy-unused-test-state',
  quit: vi.fn()
}))
const launcher = vi.hoisted(() => ({ spawn: vi.fn(), openPath: vi.fn().mockResolvedValue('') }))
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    copyFileSync: vi.fn((_source, destination) =>
      actual.writeFileSync(destination, 'synthetic bridge; spawning is mocked')
    )
  }
})
vi.mock('node:child_process', () => ({ spawn: launcher.spawn }))
vi.mock('electron', () => ({ app, shell: { openPath: launcher.openPath } }))
import { UpdateLauncher } from './updater'
const directories: string[] = []
const bytes = Buffer.from('synthetic-windows-artifact-not-an-executable')
const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
function release(hash: string | undefined = digest) {
  return {
    tag_name: 'v1.4.0',
    assets: [
      {
        id: 1,
        name: 'S2Teasy-1.4.0-win-x64.exe',
        size: bytes.length,
        url: 'https://api.github.com/repos/HighRyzchs/S2TEasy/releases/assets/1',
        browser_download_url:
          'https://github.com/HighRyzchs/S2TEasy/releases/download/v1.4.0/S2Teasy-1.4.0-win-x64.exe',
        digest: hash
      }
    ]
  }
}
function setup(remote = release(), payload: Uint8Array = bytes) {
  const directory = mkdtempSync(join(tmpdir(), 's2teasy-update-test-'))
  directories.push(directory)
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify(remote), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    )
    .mockResolvedValueOnce(new Response(payload))
  vi.stubGlobal('fetch', fetchMock)
  const updater = new UpdateLauncher(
    () => '',
    () => undefined,
    directory,
    directory
  )
  return { updater, fetchMock, directory }
}
beforeEach(() => {
  app.isPackaged = true
  vi.clearAllMocks()
  launcher.spawn.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  directories.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true }))
})
describe('verified application updates', () => {
  it('discovers the matching Windows update without downloading until requested', async () => {
    const { updater, fetchMock } = setup()
    expect((await updater.check()).phase).toBe('available')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('marks the update ready only after its downloaded bytes match the SHA-256 digest', async () => {
    const { updater } = setup()
    expect(await updater.check({ download: true })).toMatchObject({
      phase: 'ready',
      percent: 100,
      availableVersion: '1.4.0'
    })
  })
  it('refuses a corrupted update and never offers restart', async () => {
    const { updater } = setup(release(), Buffer.from('corrupted'))
    expect(await updater.check({ download: true })).toMatchObject({
      phase: 'error',
      message: expect.stringMatching(/checksum verification failed/)
    })
  })
  it('does not download a release without a digest', async () => {
    const remote = release()
    delete (remote.assets[0] as { digest?: string }).digest
    const { updater, fetchMock } = setup(remote)
    expect((await updater.check({ download: true })).phase).toBe('error')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('handles an empty public release feed as no available release', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })))
    const updater = new UpdateLauncher(
      () => '',
      () => undefined
    )
    expect(await updater.check()).toMatchObject({ phase: 'current', availableVersion: '' })
  })
  it('does not claim the app is current when a newer release has no matching artifact', async () => {
    const remote = release()
    remote.assets = []
    const { updater } = setup(remote)
    expect(await updater.check()).toMatchObject({
      phase: 'error',
      message: expect.stringMatching(/compatible Windows installer/)
    })
  })
  it('refuses installation when a verified file is changed later', async () => {
    const { updater, directory } = setup()
    await updater.check({ download: true })
    const payload = join(directory, readdirSync(directory)[0]!, 'S2Teasy-1.4.0-win-x64.exe')
    writeFileSync(payload, 'tampered')
    expect(updater.install()).toMatchObject({
      phase: 'error',
      message: expect.stringMatching(/missing or changed/)
    })
    expect(app.quit).not.toHaveBeenCalled()
  })
  it('handles a missing downloaded file without crashing or quitting', async () => {
    const { updater, directory } = setup()
    await updater.check({ download: true })
    rmSync(join(directory, readdirSync(directory)[0]!, 'S2Teasy-1.4.0-win-x64.exe'))
    expect(updater.install()).toMatchObject({ phase: 'error' })
    expect(app.quit).not.toHaveBeenCalled()
  })
})

it('recognizes an applied receipt only for this running version, including PowerShell UTF-8 BOM', () => {
  const { directory } = setup()
  writeFileSync(
    join(directory, 'update-result.json'),
    '\uFEFF' + JSON.stringify({ status: 'applied', fromVersion: '1.3.0', toVersion: '1.3.1' })
  )
  expect(
    new UpdateLauncher(
      () => '',
      () => {},
      directory,
      directory
    ).getStatus()
  ).toMatchObject({ phase: 'current', message: 'Updated from 1.3.0 to 1.3.1.' })
  writeFileSync(
    join(directory, 'update-result.json'),
    JSON.stringify({ status: 'applied', fromVersion: '1.3.1', toVersion: '1.4.0' })
  )
  expect(
    new UpdateLauncher(
      () => '',
      () => {},
      directory,
      directory
    ).getStatus().phase
  ).toBe('error')
})
it('reports a failed helper receipt without claiming the app updated', () => {
  const { directory } = setup()
  writeFileSync(
    join(directory, 'update-result.json'),
    JSON.stringify({ status: 'failed', message: 'Portable EXE is locked' })
  )
  expect(
    new UpdateLauncher(
      () => '',
      () => {},
      directory,
      directory
    ).getStatus()
  ).toMatchObject({ phase: 'error', message: expect.stringMatching(/locked/) })
})

it('launches one hidden helper despite repeated Restart clicks or checks during handoff', async () => {
  vi.useFakeTimers()
  const child = Object.assign(new EventEmitter(), { unref: vi.fn() })
  launcher.spawn.mockReturnValue(child)
  const { updater, fetchMock, directory } = setup()
  await updater.check({ download: true })
  expect(updater.install().phase).toBe('applying')
  updater.install()
  updater.install()
  expect((await updater.check({ force: true })).phase).toBe('applying')
  expect((await updater.download()).phase).toBe('applying')
  expect(launcher.spawn).toHaveBeenCalledOnce()
  expect(fetchMock).toHaveBeenCalledTimes(2)
  const [executable, args, options] = launcher.spawn.mock.calls[0]
  expect(executable.endsWith('update-bridge.exe')).toBe(true)
  expect(args).toHaveLength(2)
  expect(options).toMatchObject({ windowsHide: true, detached: true })
  expect(options.stdio).toBe('ignore')
  const script = readFileSync(args[0], 'utf8')
  expect(script).not.toMatch(/findstr|tasklist|cmd\.exe/i)
  expect(script).toContain('Wait-Process -Timeout 120')
  expect(app.quit).not.toHaveBeenCalled()
  child.emit('spawn')
  await vi.advanceTimersByTimeAsync(500)
  expect(app.quit).not.toHaveBeenCalled()
  const receiptPath = join(directory, 'update-result.json')
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  writeFileSync(receiptPath, '\uFEFF' + JSON.stringify({ ...receipt, status: 'waiting' }))
  await vi.advanceTimersByTimeAsync(100)
  expect(app.quit).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(250)
  expect(app.quit).toHaveBeenCalledOnce()
})

it('keeps the app open when PowerShell exits before acknowledging and records diagnostics', async () => {
  const child = Object.assign(new EventEmitter(), { unref: vi.fn() })
  launcher.spawn.mockReturnValue(child)
  const { updater, directory } = setup()
  await updater.check({ download: true })
  updater.install()
  child.emit('spawn')
  child.emit('exit', 0)
  expect(updater.getStatus()).toMatchObject({
    phase: 'error',
    canOpenInstaller: true,
    message: expect.stringMatching(/exited before shutdown \(code 0\).*kept open/)
  })
  expect(app.quit).not.toHaveBeenCalled()
  expect(JSON.parse(readFileSync(join(directory, 'update-result.json'), 'utf8')).status).toBe(
    'failed'
  )
})
it('requires a matching startup acknowledgement and cancels the attempt on timeout', async () => {
  vi.useFakeTimers()
  const child = Object.assign(new EventEmitter(), { unref: vi.fn(), kill: vi.fn() })
  launcher.spawn.mockReturnValue(child)
  const { updater, directory } = setup()
  await updater.check({ download: true })
  updater.install()
  child.emit('spawn')
  const path = join(directory, 'update-result.json'),
    receipt = JSON.parse(readFileSync(path, 'utf8'))
  writeFileSync(path, JSON.stringify({ ...receipt, attemptId: 'old-attempt', status: 'waiting' }))
  await vi.advanceTimersByTimeAsync(10000)
  expect(updater.getStatus()).toMatchObject({
    phase: 'error',
    message: expect.stringMatching(/10 seconds/)
  })
  expect(app.quit).not.toHaveBeenCalled()
  expect(child.kill).toHaveBeenCalledOnce()
  const attempts = join(directory, 'updates')
  const attempt = join(attempts, readdirSync(attempts)[0]!)
  expect(readFileSync(join(attempt, 'cancelled'), 'utf8')).toContain('Cancelled')
})
it('opens only a verified installed-app payload directly and never quits the app for that action', async () => {
  const { updater, directory } = setup()
  await updater.check({ download: true })
  await updater.openInstaller()
  expect(launcher.openPath).toHaveBeenCalledWith(
    expect.stringContaining('S2Teasy-1.4.0-win-x64.exe')
  )
  expect(app.quit).not.toHaveBeenCalled()
  const payload = join(directory, readdirSync(directory)[0]!, 'S2Teasy-1.4.0-win-x64.exe')
  writeFileSync(payload, 'tampered')
  await expect(updater.openInstaller()).rejects.toThrow('verify')
})
it('keeps the app open if its helper cannot launch', async () => {
  vi.useFakeTimers()
  const child = Object.assign(new EventEmitter(), { unref: vi.fn() })
  launcher.spawn.mockReturnValue(child)
  const { updater } = setup()
  await updater.check({ download: true })
  updater.install()
  child.emit('error', new Error('PowerShell unavailable'))
  await vi.runAllTimersAsync()
  expect(updater.getStatus()).toMatchObject({
    phase: 'error',
    message: expect.stringMatching(/Could not start/)
  })
  expect(app.quit).not.toHaveBeenCalled()
})
it('does not queue automatic restarts or downloads when no verified update is ready', () => {
  const { updater, fetchMock } = setup()
  updater.install()
  updater.install()
  expect(fetchMock).not.toHaveBeenCalled()
  expect(launcher.spawn).not.toHaveBeenCalled()
  expect(updater.getStatus().message).toMatch(/Download and verify/)
})

it('recognizes manual recovery without claiming the earlier failed automatic attempt succeeded', () => {
  const { directory } = setup()
  writeFileSync(
    join(directory, 'update-result.json'),
    JSON.stringify({
      status: 'failed',
      fromVersion: '1.3.0',
      toVersion: '1.3.1',
      message: 'Helper exited 0'
    })
  )
  const recovered = new UpdateLauncher(
    () => '',
    () => {},
    directory,
    directory
  )
  expect(recovered.getStatus()).toMatchObject({
    phase: 'current',
    message: expect.stringMatching(/Running 1.3.1.*did not confirm completion/)
  })
  expect(recovered.diagnostics()).toContain('Helper exited 0')
})
