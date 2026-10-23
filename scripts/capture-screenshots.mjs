// Regenerates the README and website screenshots from the browser preview's sample data.
// Usage: npm run screenshots   (needs Playwright with a Chromium build available)
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const PORT = 5195
const out = resolve('docs/screens')
mkdirSync(out, { recursive: true })

const server = spawn(
  process.execPath,
  [resolve('node_modules/vite/bin/vite.js'), '--config', 'vite.renderer.config.ts', '--port', String(PORT), '--strictPort'],
  { env: { ...process.env, VITE_BROWSER_PREVIEW: '1' }, stdio: ['ignore', 'pipe', 'inherit'] }
)
await new Promise((done, fail) => {
  server.stdout.on('data', (chunk) => String(chunk).includes('Local:') && done())
  server.on('exit', () => fail(new Error('Preview server exited')))
})

const browser = await chromium.launch()
try {
  const app = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 })
  const base = `http://localhost:${PORT}/`
  const screens = [
    ['home', 'Home'],
    ['your-voice', 'Your voice'],
    ['history', 'History'],
    ['usage', 'Usage'],
    ['hud', 'HUD'],
    ['settings', 'Settings']
  ]
  for (const theme of ['dark', 'light']) {
    await app.goto(base)
    await app.waitForSelector('.sidebar')
    for (const [file, label] of screens) {
      if (theme === 'light' && !['home', 'your-voice'].includes(file)) continue
      await app.getByRole('button', { name: label, exact: true }).first().click()
      await app.evaluate((mode) => (document.documentElement.dataset.appearance = mode), theme)
      await app.waitForTimeout(500)
      await app.screenshot({ path: `${out}/app-${file}-${theme}.png` })
    }
  }

  const hud = await browser.newPage({ viewport: { width: 780, height: 460 }, deviceScaleFactor: 2 })
  for (const style of ['island', 'caption', 'edge', 'cyber', 'pixel', 'ghost', 'balloon'])
    for (const state of ['listening', 'paused']) {
      await hud.goto(`${base}overlay.html?style=${style}&state=${state}`)
      await hud.waitForTimeout(1800)
      await hud.screenshot({ path: `${out}/hud-${style}-${state}.png` })
    }
} finally {
  await browser.close()
  server.kill()
}
console.log(`Screenshots written to ${out}`)
