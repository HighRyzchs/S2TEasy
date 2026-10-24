// Real pointer clicks (X11 XTest through xvfb) on the HUD's click-through overlay window.
// Usage: npx electron-vite build && xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/e2e-hud-real-clicks.mjs
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { _electron: electron } = require('playwright')
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 6000) {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v || Date.now() > end) return v
    await wait(100)
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
const click = (x, y, action = 'click') => execFileSync('python3', [resolve('scripts/xclick.py'), String(x), String(y), action])

/** Screen point at the centre of the first element matching `selector` in the overlay. */
async function screenPoint(overlay, selector) {
  const rect = await overlay.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  const bounds = await main(() => globalThis.__s2t.overlay().getBounds())
  return { x: Math.round(bounds.x + rect.x), y: Math.round(bounds.y + rect.y) }
}

try {
  const overlay = await until(async () => app.windows().find((w) => w.url().includes('overlay')), 15000)
  for (const layout of ['compact', 'full']) {
    await main((_, l) => globalThis.__s2t.settings({ hud: { style: 'island', accent: '#7fe0c4', scale: 1, whileTalking: l, showCues: true, clickToEdit: true, sensitivity: 1 } }), layout)
    await until(async () => (await state()).status === 'hidden', 10000)
    await main(() => globalThis.__s2t.dictation.toggle())
    await until(async () => (await state()).partial.split(' ').length >= 5, 8000)
    await wait(400)

    // A click beside the HUD must not reach it (the app underneath gets it).
    const bounds = await main(() => globalThis.__s2t.overlay().getBounds())
    click(bounds.x + 10, bounds.y + 10)
    await wait(300)
    check(`${layout}: a click beside the HUD passes through`, (await state()).status === 'listening')

    // Real click on the text opens the editor, then on a word opens the edit box.
    const target = (await state()).partial.split(' ')[3]
    const textPoint = await screenPoint(overlay, layout === 'full' ? `.hud-wd:text-is("${target}")` : '.hud-roll')
    click(textPoint.x, textPoint.y)
    await wait(400)
    check(`${layout}: real click on the text opens the editor`, (await overlay.locator('.hud-w').count()) > 0)
    const wordPoint = await screenPoint(overlay, `.hud-w:text-is("${target}")`).catch(() => null)
    if (wordPoint) click(wordPoint.x, wordPoint.y)
    await wait(400)
    const editing = await overlay.locator('input.hud-edit').isVisible().catch(() => false)
    check(`${layout}: real click on a word opens the edit box`, editing)
    if (editing) {
      await overlay.locator('input.hud-edit').fill('Ryzchs')
      await overlay.locator('input.hud-edit').press('Enter')
      await wait(500)
    }

    // Second edit in the same take (this used to get stuck).
    const again = await screenPoint(overlay, '.hud-w').catch(() => null)
    if (again) click(again.x, again.y)
    await wait(400)
    const second = await overlay.locator('input.hud-edit').isVisible().catch(() => false)
    check(`${layout}: a second edit in the same take works`, second)
    if (second) await overlay.locator('input.hud-edit').press('Escape')
    await wait(300)

    // Real clicks on Copy, Pause, Done.
    await main(({ clipboard }) => clipboard.writeText(''))
    const copy = await screenPoint(overlay, '[data-a="copy"]')
    click(copy.x, copy.y)
    await wait(300)
    check(`${layout}: real click on Copy copies`, (await main(({ clipboard }) => clipboard.readText())).length > 0)
    const pause = await screenPoint(overlay, '[data-a="pause"]')
    click(pause.x, pause.y)
    check(`${layout}: real click on Pause pauses`, !!(await until(() => main(() => globalThis.__s2t.dictation.isPaused()), 8000)))
    await wait(300)
    const done = await screenPoint(overlay, '[data-a="send"]')
    click(done.x, done.y)
    check(`${layout}: real click on Done finishes`, !!(await until(async () => ['success', 'leaving', 'hidden'].includes((await state()).status), 10000)))
  }
} catch (error) {
  check('run', false, error.message.split('\n')[0])
} finally {
  await app.close().catch(() => undefined)
  rmSync(userData, { recursive: true, force: true })
}
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
