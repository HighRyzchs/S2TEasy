// Runs real NSIS installers on the disposable Windows CI runner, never on a developer's machine.
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  copyFileSync,
  existsSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

async function main() {
  if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true') {
    throw new Error(
      'This installer smoke test is restricted to disposable Windows GitHub Actions runners.'
    )
  }
  const version =
    process.env.S2T_SMOKE_TARGET_VERSION || JSON.parse(readFileSync('package.json', 'utf8')).version
  const installer = resolve(`release/S2Teasy-${version}-win-x64.exe`)
  const directory = mkdtempSync(join(tmpdir(), 's2teasy-native-update-'))
  const diagnostics = resolve('release/update-smoke')
  mkdirSync(diagnostics, { recursive: true })
  const installDirectory = join(directory, "Pat's 100% & notes", 'S2Teasy')
  mkdirSync(installDirectory, { recursive: true })
  const target = join(installDirectory, 'S2Teasy.exe')
  const oldInstaller = join(directory, 'old-installer.exe')
  const literal = (value) => `'${value.replace(/'/g, "''")}'`
  const powershell = join(
    process.env.SystemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  )
  async function execute(script, logName, timeout = 240000) {
    const log = openSync(join(diagnostics, logName), 'a')
    let child
    try {
      child = spawn(
        powershell,
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          Buffer.from(script, 'utf16le').toString('base64')
        ],
        { stdio: ['ignore', log, log], windowsHide: true }
      )
    } finally {
      closeSync(log)
    }
    await new Promise((resolvePromise, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${logName} exceeded its deadline; inspect ${directory}`)),
        timeout
      )
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('exit', (code) => {
        clearTimeout(timer)
        code === 0
          ? resolvePromise()
          : reject(
              new Error(
                `${logName} exited ${code}: ${readFileSync(join(diagnostics, logName), 'utf8')}`
              )
            )
      })
    })
  }
  async function downloadVerifiedRelease(version, file) {
    const response = await fetch(
      `https://api.github.com/repos/HighRyzchs/S2TEasy/releases/tags/v${version}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          ...(process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {})
        },
        signal: AbortSignal.timeout(30000)
      }
    )
    if (!response.ok) throw new Error(`Release ${version} metadata HTTP ${response.status}`)
    const release = await response.json()
    const asset = release.assets.find((a) => a.name === `S2Teasy-${version}-win-x64.exe`)
    if (!asset?.digest?.startsWith('sha256:'))
      throw new Error(`Published ${version} installer needs a SHA-256 digest for the smoke test.`)
    const download = await fetch(asset.browser_download_url, {
      signal: AbortSignal.timeout(180000)
    })
    if (!download.ok) throw new Error(`Installer ${version} HTTP ${download.status}`)
    const bytes = Buffer.from(await download.arrayBuffer())
    if (createHash('sha256').update(bytes).digest('hex') !== asset.digest.slice(7))
      throw new Error('Installer checksum mismatch.')
    writeFileSync(file, bytes)
  }
  await downloadVerifiedRelease('1.5.1', oldInstaller)
  if (process.env.S2T_SMOKE_TARGET_VERSION) {
    mkdirSync(resolve('release'), { recursive: true })
    await downloadVerifiedRelease(version, installer)
  }
  await execute(
    `$ErrorActionPreference='Stop'; $p=Start-Process -FilePath ${literal(oldInstaller)} -ArgumentList @('/S',('/D='+${literal(installDirectory)})) -PassThru; if(-not $p.WaitForExit(180000)){throw 'Old installer timeout'}; if($p.ExitCode -ne 0){throw 'Old installer failed'}; $v=[Diagnostics.FileVersionInfo]::GetVersionInfo(${literal(target)}).ProductVersion; if($v -ne '1.5.1' -and $v -ne '1.5.1.0'){throw ('Unexpected baseline version '+$v)}`,
    'baseline.log'
  )
  const modulePath = join(directory, 'helper.cjs')
  await build({
    entryPoints: ['src/shared/update-install.ts'],
    outfile: modulePath,
    bundle: true,
    platform: 'node',
    format: 'cjs'
  })
  const { buildVerifiedApplyScript } = createRequire(import.meta.url)(modulePath)
  async function apply(payloadPath, toVersion, name) {
    const receiptPath = join(diagnostics, `${name}-result.json`)
    // A real parent process stays alive long enough to verify the startup acknowledgement.
    const parent = spawn(
      powershell,
      ['-NoProfile', '-NonInteractive', '-Command', 'Start-Sleep -Seconds 120'],
      { stdio: 'ignore', windowsHide: true }
    )
    await new Promise((ready, reject) => {
      parent.once('spawn', ready)
      parent.once('error', reject)
    })
    const script = buildVerifiedApplyScript({
      kind: 'installed',
      currentExe: target,
      payloadPath,
      pid: parent.pid,
      expectedSha256: createHash('sha256').update(readFileSync(payloadPath)).digest('hex'),
      receiptPath,
      attemptId: randomUUID(),
      cancelPath: join(directory, `${name}-cancelled`),
      fromVersion: '1.5.1',
      toVersion
    })
    const promise = execute(script, `${name}.log`).then(
      () => undefined,
      (error) => error
    )
    let acknowledged = false
    const deadline = Date.now() + 10000
    while (parent.exitCode === null && !acknowledged && Date.now() < deadline) {
      try {
        acknowledged =
          JSON.parse(readFileSync(receiptPath, 'utf8').replace(/^\uFEFF/, '')).status === 'waiting'
      } catch {}
      if (!acknowledged) await new Promise((r) => setTimeout(r, 100))
    }
    // Match the real handoff: the parent exits only after acknowledgment, never on a fixed sleep.
    parent.kill()
    const failure = await promise
    if (failure) throw failure
    if (!acknowledged)
      throw new Error(
        `The native helper did not acknowledge startup within 10 seconds. Output: ${readFileSync(join(diagnostics, `${name}.log`), 'utf8').slice(-4000)}; Receipt: ${readFileSync(receiptPath, 'utf8')}`
      )
    return JSON.parse(readFileSync(receiptPath, 'utf8').replace(/^\uFEFF/, ''))
  }
  // Successful update cleanup deletes its payload. Test a copy, preserving the publishable installer.
  const stagedInstaller = join(directory, 'upgrade-payload.exe')
  const artifactHash = createHash('sha256').update(readFileSync(installer)).digest('hex')
  copyFileSync(installer, stagedInstaller)
  const applied = await apply(stagedInstaller, version, 'upgrade')
  if (applied.status !== 'applied') throw new Error(`Real NSIS upgrade failed: ${applied.message}`)
  if (
    !existsSync(installer) ||
    createHash('sha256').update(readFileSync(installer)).digest('hex') !== artifactHash
  )
    throw new Error('Native smoke test changed the publishable installer artifact.')
  // Stop only this fixture's app before testing a no-op installer; avoid unrelated processes.
  const stop = () =>
    execute(
      `Get-Process | Where-Object { $_.Path -eq ${literal(target)} } | Stop-Process -Force`,
      'cleanup.log'
    )
  await stop()
  const noop = join(directory, 'noop.exe')
  await execute(
    `Add-Type -TypeDefinition 'public class Noop { public static void Main() {} }' -OutputAssembly ${literal(noop)} -OutputType ConsoleApplication`,
    'noop-build.log'
  )
  const rejected = await apply(noop, '99.0.0', 'noop')
  if (rejected.status !== 'failed' || !rejected.message.includes('expected 99.0.0'))
    throw new Error('A zero-exit no-op installer was incorrectly accepted.')
  await stop()
  const report = {
    oldVersion: '1.5.1',
    newVersion: version,
    realNsisUpgrade: 'passed',
    startupAcknowledgement: 'passed',
    noOpInstallerRejected: 'passed',
    pathQuoting: 'passed',
    buildArtifactPreserved: 'passed',
    nativeDesktopInteraction: 'not tested'
  }
  writeFileSync('release/windows-update-smoke.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
}
try {
  await main()
} catch (error) {
  const message = String(error instanceof Error ? error.message : error)
    .slice(0, 6000)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A')
  console.error(`::error title=Native update smoke failed::${message}`)
  process.exitCode = 1
}
