import { build } from 'esbuild'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
const folder = mkdtempSync(join(tmpdir(), 's2teasy-helper-check-'))
try {
  const modulePath = join(folder, 'helper.cjs')
  await build({
    entryPoints: ['src/shared/update-install.ts'],
    outfile: modulePath,
    bundle: true,
    platform: 'node',
    format: 'cjs'
  })
  const { buildVerifiedApplyScript } = createRequire(import.meta.url)(modulePath)
  for (const kind of ['portable', 'installed']) {
    const file = join(folder, `${kind}.ps1`)
    writeFileSync(
      file,
      buildVerifiedApplyScript({
        kind,
        currentExe: "C:\\Users\\Pat's 100% & notes\\S2Teasy.exe",
        payloadPath: 'C:\\Temp\\new.exe',
        pid: 4242,
        expectedSha256: 'a'.repeat(64),
        receiptPath: 'C:\\Data\\update-result.json',
        fromVersion: '1.4.1',
        toVersion: '1.5.0'
      })
    )
    if (process.platform !== 'win32') {
      console.log(`${kind}: generated; native PowerShell parser check runs on Windows CI`)
      continue
    }
    const result = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$tokens = $null; $problems = $null; [System.Management.Automation.Language.Parser]::ParseFile('${file.replace(/'/g, "''")}', [ref]$tokens, [ref]$problems) | Out-Null; if ($problems.Count) { $problems | ForEach-Object { Write-Error $_.Message }; exit 1 }`
      ],
      { stdio: 'inherit' }
    )
    if (result.error || result.status !== 0)
      throw result.error ?? new Error(`${kind} helper did not parse`)
    console.log(`${kind}: Windows PowerShell syntax passed`)
  }
} finally {
  rmSync(folder, { recursive: true, force: true })
}
