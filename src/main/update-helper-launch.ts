import { spawn } from 'node:child_process'
import { copyFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** A detached GUI bridge survives Electron; its PowerShell child avoids detached console mode. */
export function launchUpdateHelper(
  script: string,
  directory: string,
  cwd: string,
  bridgePath?: string
) {
  const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  const source =
    bridgePath ?? join(resources ?? join(__dirname, '../../resources'), 'update-bridge.exe')
  // Portable extraction can be removed as soon as Electron exits; run our own staged copy.
  const executable = join(directory, 'update-bridge.exe')
  copyFileSync(source, executable)
  const scriptPath = join(directory, 'apply.ps1')
  writeFileSync(scriptPath, '\uFEFF' + script, { mode: 0o600 })
  const args = [scriptPath, join(directory, 'helper.log')]
  const metadata: Record<string, unknown> = {
    schemaVersion: 1,
    at: new Date().toISOString(),
    transport: 'windows-gui-bridge',
    executable,
    detached: true,
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
  writeFileSync(join(directory, 'helper.log'), '', { mode: 0o600 })
  const child = spawn(executable, args, {
    // The GUI bridge writes its own log and is independent of libuv's child-process job.
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
    cwd
  })
  child.once('spawn', () => record({ stage: 'started', pid: child.pid }))
  child.once('error', (error) => record({ stage: 'launch-error', error: error.message }))
  child.once('exit', (exitCode, signal) => record({ stage: 'exited', exitCode, signal }))
  return child
}
