import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
const paths = vi.hoisted(() => ({ directory: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => paths.directory },
  safeStorage: { isEncryptionAvailable: () => false }
}))
import { Store } from './store'
afterEach(() => {
  if (paths.directory) rmSync(paths.directory, { recursive: true, force: true })
})
it('persists welcome completion and a nickname across launches without replacing existing history', () => {
  paths.directory = mkdtempSync(join(tmpdir(), 's2t-profile-'))
  const history = [
    {
      id: 'existing',
      text: 'Saved thought',
      createdAt: 1,
      durationMs: 1000,
      source: 'final',
      model: 'speech'
    }
  ]
  writeFileSync(
    join(paths.directory, 's2teasy.json'),
    JSON.stringify({ settings: { recoveryAudio: false }, history })
  )
  const store = new Store()
  expect(store.getSettings().welcomeCompleted).toBe(false)
  store.saveSettings({
    displayName: '  @River ',
    welcomeCompleted: true,
    setupChecklistDismissed: true
  })
  const reopened = new Store()
  expect(reopened.getSettings()).toMatchObject({
    displayName: '@River',
    welcomeCompleted: true,
    setupChecklistDismissed: true,
    recoveryAudio: false
  })
  expect(reopened.getHistory()).toEqual(history)
  const persisted = JSON.parse(readFileSync(join(paths.directory, 's2teasy.json'), 'utf8'))
  expect(persisted.settings.vocabulary).toEqual([])
})
