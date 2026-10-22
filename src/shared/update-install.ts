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
}): string {
  if (
    !/^[a-f0-9]{64}$/i.test(opts.expectedSha256) ||
    !Number.isSafeInteger(opts.pid) ||
    opts.pid <= 0
  )
    throw new Error('Invalid update verification parameters.')
  return `
$ErrorActionPreference = 'Stop'
$target = ${literal(opts.currentExe)}
$payload = ${literal(opts.payloadPath)}
$receipt = ${literal(opts.receiptPath)}
$expected = ${literal(opts.expectedSha256.toLowerCase())}
$backup = $target + '.previous'
function Write-Receipt([string]$state, [string]$message) {
  @{ status = $state; fromVersion = ${literal(opts.fromVersion)}; toVersion = ${literal(opts.toVersion)}; at = [DateTime]::UtcNow.ToString('o'); message = $message } | ConvertTo-Json | Set-Content -LiteralPath $receipt -Encoding UTF8
}
try {
  $parent = Get-Process -Id ${opts.pid} -ErrorAction SilentlyContinue
  if ($parent) { $parent | Wait-Process -Timeout 120 }
  if ((Get-FileHash -LiteralPath $payload -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Update checksum changed before installation.' }
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
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Installed copy failed checksum verification.' }
  } catch {
    Copy-Item -LiteralPath $backup -Destination $target -Force
    throw
  }
  `
      : `
  $installer = Start-Process -FilePath $payload -ArgumentList '/S' -Wait -PassThru
  if ($installer.ExitCode -notin @(0, 3010)) { throw ('Installer failed with exit code ' + $installer.ExitCode) }
  `
  }
  Write-Receipt 'applied' 'Update installed.'
  Start-Process -FilePath $target -WorkingDirectory (Split-Path -Parent $target)
  Remove-Item -LiteralPath $payload -Force -ErrorAction SilentlyContinue
} catch {
  $problem = $_.Exception.Message
  try { Write-Receipt 'failed' $problem; $problem | Set-Content -LiteralPath ($receipt + '.log') -Encoding UTF8 } catch {}
  if (Test-Path -LiteralPath $target) { Start-Process -FilePath $target -WorkingDirectory (Split-Path -Parent $target) }
}
`.trim()
}
