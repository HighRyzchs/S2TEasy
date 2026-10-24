// End-to-end check of the real HUD: the built app runs with a scripted speech engine (S2T_E2E=1)
// and a synthetic microphone, and Playwright clicks the real overlay window.
// Usage: npx electron-vite build && xvfb-run -a node scripts/e2e-hud.mjs   (needs Playwright)
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { _electron: electron } = require('playwright')

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 6000, step = 100) {
  const end = Date.now() + ms
  for (;;) {
    const value = await fn()
    if (value) return value
    if (Date.now() > end) return value
    await wait(step)
  }
}

const userData = mkdtempSync(join(tmpdir(), 's2t-e2e-'))
const app = await electron.launch({
  executablePath: resolve('node_modules/electron/dist/electron'),
  args: ['.', '--no-sandbox'],
  env: { ...process.env, S2T_E2E: '1', S2T_E2E_USER_DATA: userData }
})
const main = (fn, arg) => app.evaluate(fn, arg)
const state = () => main(() => globalThis.__s2t.state())

try {
  const overlay = await until(async () => app.windows().find((w) => w.url().includes('overlay')), 15000)
  if (!overlay) throw new Error('No overlay window')
  await overlay.waitForLoadState('domcontentloaded')

  const styles = (process.env.STYLES || 'island,caption,edge,cyber,pixel,ghost,balloon').split(',')
  const startTake = async () => {
    await until(async () => (await state()).status === 'hidden', 10000)
    await main(() => globalThis.__s2t.dictation.toggle())
    const ok = await until(async () => (await state()).partial.split(' ').length >= 5, 8000)
    return ok ? (await state()).partial.split(' ')[3] : null
  }
  const finished = () =>
    until(async () => ['success', 'leaving', 'hidden'].includes((await state()).status), 10000)

  for (const style of styles)
    for (const layout of ['compact', 'full']) {
      const tag = `${style}/${layout}`
      await main((_, hud) => globalThis.__s2t.settings({ hud }), {
        style, accent: '#7fe0c4', scale: 1, whileTalking: layout, showCues: true, clickToEdit: true, sensitivity: 1
      })
      await wait(300)

      // 1. Edit while talking, Copy, then Done straight from listening.
      const target = await startTake()
      check(`${tag}: words appear`, !!target)
      if (!target) continue
      const area = await main(() => globalThis.__s2t.hudArea())
      check(`${tag}: HUD reports where it is drawn`, !!area && area.width > 40 && area.height > 20, JSON.stringify(area))
      const any = overlay.locator('.hud-w, .hud-wd, .hud-roll', { hasText: target }).first()
      await any.click({ timeout: 3000 }).catch((e) => console.log('   click error:', e.message.split('\n')[0]))
      await wait(250)
      const word = overlay.locator('.hud-w', { hasText: target }).first()
      check(`${tag}: clicking the text opens the editor`, (await word.count()) > 0)
      await word.click({ timeout: 3000 }).catch(() => undefined)
      const field = overlay.locator('input.hud-edit')
      const opened = await field.isVisible().catch(() => false)
      check(`${tag}: clicking a word opens the edit box`, opened)
      if (opened) {
        await field.fill('Ryzchs')
        await field.press('Enter')
        const fixed = await until(async () => (await state()).partial.split(' ').includes('Ryzchs'), 3000)
        check(`${tag}: the edit lands in the text`, !!fixed, (await state()).partial)
      }
      await overlay.locator('[data-a="copy"]').first().click({ timeout: 2000 }).catch((e) => console.log('   copy click:', e.message.split('\n').slice(0, 14).join(' | ')))
      const copied = await main(({ clipboard }) => clipboard.readText())
      check(`${tag}: Copy copies the text`, copied === (await state()).partial, copied)
      await main(({ clipboard }) => clipboard.writeText(''))
      await overlay.locator('[data-a="send"]').first().click({ timeout: 2000 }).catch(() => undefined)
      check(`${tag}: Done while listening finishes`, !!(await finished()), (await state()).status)

      // 2. Pause, then Done.
      if (!(await startTake())) continue
      await overlay.locator('[data-a="pause"]').first().click({ timeout: 2000 }).catch(() => undefined)
      check(`${tag}: Pause pauses`, !!(await until(() => main(() => globalThis.__s2t.dictation.isPaused()), 8000)))
      await overlay.locator('[data-a="send"]').first().click({ timeout: 2000 }).catch(() => undefined)
      check(`${tag}: Done after Pause finishes`, !!(await finished()), (await state()).status)

      // 3. Two quick taps on Pause finish the take.
      if (!(await startTake())) continue
      await overlay.locator('[data-a="pause"]').first().dblclick({ timeout: 2000 }).catch(() => undefined)
      check(`${tag}: double-tap Pause finishes`, !!(await finished()), (await state()).status)
    }
} catch (error) {
  check('run', false, error.message)
} finally {
  await app.close().catch(() => undefined)
  rmSync(userData, { recursive: true, force: true })
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
