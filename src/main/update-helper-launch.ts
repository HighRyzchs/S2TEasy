import { spawn } from 'node:child_process'
import { openSync, closeSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Windows PowerShell can exit 0 without executing when launched detached with ignored stdin. */
export function launchUpdateHelper(script: string, directory: string, cwd: string) {
  const executable = process.env.SystemRoot
    ? join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe'
  const args = [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-WindowStyle',
    'Hidden',
    '-EncodedCommand',
    Buffer.from(script, 'utf16le').toString('base64')
  ]
  const metadata: Record<string, unknown> = {
    schemaVersion: 1,
    at: new Date().toISOString(),
    transport: 'powershell-encoded',
    executable,
    detached: false,
    windowsHide: true,
    commandCharacters: args.join(' ').length,
    stage: 'prepared'
  }
  const record = (patch: Record<string, unknown>) => {
    Object.assign(metadata, patch)
    try {
      writeFileSync(join(directory, 'launch.json'), JSON.stringify(metadata, null, 2), {
        mode: 0o600
      })
    } catch {
      /* Failure to update launch diagnostics cannot terminate the helper. */
    }
  }
  record({})
  const log = openSync(join(directory, 'helper.log'), 'a', 0o600)
  let child: ReturnType<typeof spawn>
  try {
    child = spawn(executable, args, {
      // A child survives parent exit on Windows without CREATE_NEW_PROCESS_GROUP/DETACHED_PROCESS.
      // Keep stdio independent and unref in the caller; do not create a detached console.
      detached: false,
      windowsHide: true,
      stdio: ['ignore', log, log],
      cwd
    })
  } finally {
    closeSync(log)
  }
  child.once('spawn', () => record({ stage: 'started', pid: child.pid }))
  child.once('error', (error) => record({ stage: 'launch-error', error: error.message }))
  child.once('exit', (exitCode, signal) => record({ stage: 'exited', exitCode, signal }))
  return child
}
