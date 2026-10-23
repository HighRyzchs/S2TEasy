import { readdirSync, readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs'
import { join } from 'node:path'

/** Reads only update-owned files, never settings/history or a path supplied by receipt contents. */
export function updateDiagnostics(directory: string, version: string, packaging: string): string {
  const lines = [
    `S2Teasy update report`,
    `Running version: ${version}`,
    `Package: ${packaging}`,
    `Executable: ${process.execPath}`
  ]
  try {
    const path = join(directory, 'update-result.json')
    if (statSync(path).size > 64000) throw new Error('Receipt exceeds the report limit')
    const receipt = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
    for (const key of [
      'status',
      'fromVersion',
      'toVersion',
      'at',
      'message',
      'target',
      'payload',
      'attemptId'
    ]) {
      if (typeof receipt[key] === 'string') lines.push(`${key}: ${receipt[key].slice(0, 1000)}`)
    }
  } catch {
    lines.push('Receipt: absent or unreadable.')
  }
  try {
    const root = join(directory, 'updates')
    const latest = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^attempt-[A-Za-z0-9]+$/.test(entry.name))
      .map((entry) => ({ name: entry.name, at: statSync(join(root, entry.name)).mtimeMs }))
      .sort((a, b) => b.at - a.at)[0]
    if (!latest) throw new Error('No helper logs')
    const path = join(root, latest.name, 'helper.log'),
      size = statSync(path).size
    const tail = Buffer.alloc(Math.min(size, 12000)),
      fd = openSync(path, 'r')
    try {
      readSync(fd, tail, 0, tail.length, Math.max(0, size - tail.length))
    } finally {
      closeSync(fd)
    }
    lines.push(
      '',
      `Latest helper: ${latest.name}`,
      size > 12000 ? 'Helper output (last 12 KB):' : 'Helper output:',
      tail.toString('utf8') || '(empty)'
    )
  } catch {
    lines.push('Helper output: no readable log yet.')
  }
  return lines.join('\n')
}
