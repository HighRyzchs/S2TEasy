// Speech tidy in the real app: automatic at the end of a take, and the HUD's Tidy button.
// Linux: npx electron-vite build && xvfb-run -a node scripts/e2e-tidy.mjs
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { _electron: electron } = (() => {
  try {
    return require('playwright')
  } catch {
    return require('playwright-core')
  }
})()
const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 8000) {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v || Date.now() > end) return v
    await wait(100)
  }
}

const SAID = 'um I I want to go to the store, I mean the mall'
const TIDY = 'I want to go to the mall'
const userData = mkdtempSync(join(tmpdir(), 's2t-e2e-'))
const app = await electron.launch({
  executablePath: resolve(process.platform === 'win32' ? 'node_modules/electron/dist/electron.exe' : 'node_modules/electron/dist/electron'),
  args: ['.', '--no-sandbox'],
  env: { ...process.env, S2T_E2E: '1', S2T_E2E_USER_DATA: userData }
})
const main = (fn, arg) => app.evaluate(fn, arg)
const state = () => main(() => globalThis.__s2t.state())
const typed = () => main(() => globalThis.__s2t.typed())
const finished = async () => ['success', 'leaving', 'hidden'].includes((await state()).status)

try {
  const overlay = await until(async () => app.windows().find((w) => w.url().includes('overlay')), 15000)
  await main(() => globalThis.__s2t.settings({ insertMode: 'live' }))

  // 1. Automatic: the take is tidied in the app and in History.
  await main((_, lines) => globalThis.__s2t.script(lines), [SAID])
  await main(() => globalThis.__s2t.dictation.toggle())
  await until(async () => (await state()).partial.includes('mall'))
  await main(() => globalThis.__s2t.dictation.stop?.() ?? globalThis.__s2t.dictation.toggle())
  await until(finished, 10000)
  check('automatic: what was typed is tidy', (await typed()).trim().endsWith(TIDY), await typed())
  const saved = await main(() => globalThis.__s2t.history()[0]?.text)
  check('automatic: History has the tidy text', saved?.trim() === TIDY, saved)

  // 2. Off: nothing changes by itself; the HUD's Tidy button does it.
  await until(async () => (await state()).status === 'hidden', 10000)
  await main(() => globalThis.__s2t.settings({ tidy: { auto: false, stutters: true, fillers: true, corrections: true, pauseBreaks: true } }))
  const before = (await typed()).length
  await main((_, lines) => globalThis.__s2t.script(lines), [SAID])
  await main(() => globalThis.__s2t.dictation.toggle())
  await until(async () => (await state()).partial.includes('mall'))
  await wait(400)
  check('off: the stumbles are typed as said', (await typed()).slice(before).includes('I I want'), (await typed()).slice(before))
  await overlay.locator('[data-a="tidy"]').first().click({ timeout: 4000 })
  check(
    'Tidy button: the HUD text is tidied',
    !!(await until(async () => (await state()).partial.trim() === TIDY, 4000)),
    (await state()).partial
  )
  check('Tidy button: the app text is tidied', (await typed()).slice(before).trim() === TIDY, (await typed()).slice(before))
  check('Tidy button: it says what it took out', /Tidied: /.test((await state()).notice ?? ''), (await state()).notice)
  await overlay.locator('[data-a="send"]').first().click({ timeout: 4000 })
  await until(finished, 10000)
} catch (error) {
  check('run', false, error.message.split('\n')[0])
} finally {
  await main(() => globalThis.__s2t.script([])).catch(() => undefined)
  await Promise.race([app.close().catch(() => undefined), wait(10000)])
  rmSync(userData, { recursive: true, force: true })
}
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
