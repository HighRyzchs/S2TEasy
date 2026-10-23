import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { updateDiagnostics } from './update-diagnostics'
it('reads only update receipt fields and a bounded local helper log, not settings or receipt-directed paths', () => {
  const root = mkdtempSync(join(tmpdir(), 's2t-update-report-'))
  try {
    writeFileSync(
      join(root, 's2teasy.json'),
      JSON.stringify({ apiKey: 'private-key', history: 'private words' })
    )
    writeFileSync(
      join(root, 'update-result.json'),
      '\uFEFF' +
        JSON.stringify({
          status: 'failed',
          message: 'Helper blocked',
          toVersion: '1.7.1',
          apiKey: 'receipt-secret',
          diagnostics: join(root, 's2teasy.json')
        })
    )
    const attempt = join(root, 'updates', 'attempt-test')
    mkdirSync(attempt, { recursive: true })
    writeFileSync(join(attempt, 'helper.log'), 'x'.repeat(15000) + 'tail marker')
    const report = updateDiagnostics(root, '1.5.1', 'installed')
    expect(report).toContain('status: failed')
    expect(report).toContain('tail marker')
    expect(report).toContain('last 12 KB')
    expect(report.length).toBeLessThan(13000)
    expect(report).not.toMatch(/private-key|private words|receipt-secret/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
it('provides a useful report before any update has run', () => {
  expect(updateDiagnostics('/missing-s2teasy-update-folder', '1.7.1', 'installed')).toContain(
    'Receipt: absent or unreadable.'
  )
})
