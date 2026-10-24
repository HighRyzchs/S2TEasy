import { win32 } from 'node:path'
import type { Packaging } from './types'

/** Portable Electron runs from a temporary extraction; replace its original launcher. */
export function updateTargetPath(
  packaging: Packaging,
  executable: string,
  environment: Record<string, string | undefined>
): string {
  if (packaging !== 'portable') return executable
  const original = environment.PORTABLE_EXECUTABLE_FILE
  if (!original || !win32.isAbsolute(original) || !/\.exe$/i.test(original))
    throw new Error(
      'Cannot locate the original portable EXE. Download the latest portable build manually; no files were replaced.'
    )
  return original
}

const literal = (value: string) => `'${value.replace(/'/g, "''")}'`

export function buildVerifiedApplyScript(opts: {
  kind: 'portable' | 'installed'
  currentExe: string
  payloadPath: string
  pid: number
  expectedSha256: string
  receiptPath: string
  fromVersion: string
  toVersion: string
  attemptId?: string
  cancelPath?: string
}): string {
  if (
    !/^[a-f0-9]{64}$/i.test(opts.expectedSha256) ||
    !Number.isSafeInteger(opts.pid) ||
    opts.pid <= 0
  )
    throw new Error('Invalid update verification parameters.')
  return `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$target = ${literal(opts.currentExe)}
$payload = ${literal(opts.payloadPath)}
$receipt = ${literal(opts.receiptPath)}
$expected = ${literal(opts.expectedSha256.toLowerCase())}
$wanted = ${literal(opts.toVersion)}
$cancel = ${literal(opts.cancelPath ?? '')}
$backup = $target + '.previous'
function Get-Sha256([string]$path) {
  $stream = [System.IO.File]::OpenRead($path)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { [System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
  finally { $stream.Dispose(); $sha.Dispose() }
}
function Write-Receipt([string]$state, [string]$message) {
  @{ status = $state; attemptId = ${literal(opts.attemptId ?? '')}; fromVersion = ${literal(opts.fromVersion)}; toVersion = $wanted; target = $target; payload = $payload; at = [DateTime]::UtcNow.ToString('o'); message = $message } | ConvertTo-Json | Set-Content -LiteralPath $receipt -Encoding UTF8
  Write-Output ($state + ': ' + $message)
}
try {
  if ((Get-Sha256 $payload) -ne $expected) { throw 'Update checksum changed before installation.' }
  Write-Receipt 'waiting' 'Helper started and verified the payload; waiting for the app to exit.'
  $parent = Get-Process -Id ${opts.pid} -ErrorAction SilentlyContinue
  if ($parent) { $parent | Wait-Process -Timeout 120 }
  if ($cancel -and (Test-Path -LiteralPath $cancel)) { throw 'Update handoff was cancelled before installation.' }
  if ((Get-Sha256 $payload) -ne $expected) { throw 'Update checksum changed before installation.' }
  Write-Receipt 'installing' 'Applying the verified payload.'
  ${
    opts.kind === 'portable'
      ? `
  Copy-Item -LiteralPath $target -Destination $backup -Force
  try {
    $copied = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
      try { Copy-Item -LiteralPath $payload -Destination $target -Force; $copied = $true; break }
      catch { Start-Sleep -Milliseconds 250 }
    }
    if (-not $copied) { throw 'Portable EXE is still locked or not writable.' }
    if ((Get-Sha256 $target) -ne $expected) { throw 'Installed copy failed checksum verification.' }
  } catch {
    Copy-Item -LiteralPath $backup -Destination $target -Force
    throw
  }
  `
      : `
  # NSIS consumes /D= and everything after it as the install directory. It must be last, without quotes.
  $installDirectory = Split-Path -Parent $target
  $installer = Start-Process -FilePath $payload -ArgumentList @('/S', '--updated', ('/D=' + $installDirectory)) -PassThru
  if (-not $installer.WaitForExit(180000)) { throw 'Installer did not finish within three minutes. It has not been terminated; inspect it before retrying.' }
  if ($installer.ExitCode -notin @(0, 3010)) { throw ('Installer failed with exit code ' + $installer.ExitCode) }
  if (-not (Test-Path -LiteralPath $target)) { throw 'Installer exited but the original app path is missing.' }
  $installedVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($target).ProductVersion
  # Windows file versions are numeric only: a 1.10.0-beta.1 build reports 1.10.0.0.
  $wantedNumber = ($wanted -split '[-+]')[0]
  if ($installedVersion -notin @($wanted, ($wanted + '.0'), $wantedNumber, ($wantedNumber + '.0'))) { throw ('Installer exited but the app at the original path is still version ' + $installedVersion + '; expected ' + $wanted) }
  `
  }
  Write-Receipt 'applied' 'Update installed.'
  Start-Process -FilePath $target -WorkingDirectory (Split-Path -Parent $target)
  Remove-Item -LiteralPath $payload -Force -ErrorAction SilentlyContinue
} catch {
  $problem = $_.Exception.Message
  try { Write-Receipt 'failed' $problem; $problem | Set-Content -LiteralPath ($receipt + '.log') -Encoding UTF8 } catch {}
  # Do not launch the old app while a timed-out installer may still be replacing files.
  if ($problem -notlike 'Installer did not finish*' -and (Test-Path -LiteralPath $target)) { Start-Process -FilePath $target -WorkingDirectory (Split-Path -Parent $target) }
}
`.trim()
}
