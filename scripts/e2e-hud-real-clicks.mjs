// The HUD with real input, the way it is used: another app is in front (the one being dictated into),
// the mouse, a finger (Windows touch injection) and the keyboard are the system's own, and the display
// can be scaled. Nothing here calls into the page to click or type.
// Linux: npx electron-vite build && xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/e2e-hud-real-clicks.mjs
// Windows: npx electron-vite build && node scripts/e2e-hud-real-clicks.mjs
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
const isWin = process.platform === 'win32'
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  return ok
}
const note = (line) => console.log(`      ${line}`)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 6000) {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v || Date.now() > end) return v
    await wait(100)
  }
}
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
mkdirSync('release', { recursive: true })

// ---- System input -------------------------------------------------------------------------
const w = isWin
  ? (() => {
      const koffi = require('koffi')
      const user32 = koffi.load('user32.dll')
      const POINT = koffi.struct('POINT', { x: 'long', y: 'long' })
      const RECT = koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' })
      const POINTER_INFO = koffi.struct('POINTER_INFO', {
        pointerType: 'uint32',
        pointerId: 'uint32',
        frameId: 'uint32',
        pointerFlags: 'uint32',
        sourceDevice: 'void*',
        hwndTarget: 'void*',
        ptPixelLocation: POINT,
        ptHimetricLocation: POINT,
        ptPixelLocationRaw: POINT,
        ptHimetricLocationRaw: POINT,
        dwTime: 'uint32',
        historyCount: 'uint32',
        InputData: 'int32',
        dwKeyStates: 'uint32',
        PerformanceCount: 'uint64',
        ButtonChangeType: 'int'
      })
      const POINTER_TOUCH_INFO = koffi.struct('POINTER_TOUCH_INFO', {
        pointerInfo: POINTER_INFO,
        touchFlags: 'uint32',
        touchMask: 'uint32',
        rcContact: RECT,
        rcContactRaw: RECT,
        orientation: 'uint32',
        pressure: 'uint32'
      })
      return {
        SetProcessDPIAware: user32.func('bool __stdcall SetProcessDPIAware()'),
        SetCursorPos: user32.func('bool __stdcall SetCursorPos(int x, int y)'),
        mouse_event: user32.func('void __stdcall mouse_event(uint32 flags, int dx, int dy, uint32 data, uintptr extra)'),
        keybd_event: user32.func('void __stdcall keybd_event(uint8 vk, uint8 scan, uint32 flags, uintptr extra)'),
        WindowFromPoint: user32.func('uintptr __stdcall WindowFromPoint(POINT pt)'),
        GetAncestor: user32.func('uintptr __stdcall GetAncestor(uintptr hwnd, uint32 flags)'),
        GetForegroundWindow: user32.func('uintptr __stdcall GetForegroundWindow()'),
        FindWindowW: user32.func('uintptr __stdcall FindWindowW(str16 cls, str16 title)'),
        FindWindowExW: user32.func('uintptr __stdcall FindWindowExW(uintptr parent, uintptr after, str16 cls, str16 title)'),
        ShowWindow: user32.func('bool __stdcall ShowWindow(uintptr hwnd, int cmd)'),
        SendMessageW: user32.func('intptr __stdcall SendMessageW(uintptr hwnd, uint32 msg, uintptr w, intptr l)'),
        InitializeTouchInjection: user32.func('bool __stdcall InitializeTouchInjection(uint32 count, uint32 mode)'),
        InjectTouchInput: user32.func('bool __stdcall InjectTouchInput(uint32 count, POINTER_TOUCH_INFO *contacts)')
      }
    })()
  : null
w?.SetProcessDPIAware()

const input = {
  click(x, y, times = 1) {
    if (!w) return execFileSync('python3', [resolve('scripts/xclick.py'), String(x), String(y), times === 2 ? 'double' : 'click'])
    w.SetCursorPos(x, y)
    sleepSync(120)
    for (let i = 0; i < times; i++) {
      w.mouse_event(0x0002, 0, 0, 0, 0)
      sleepSync(40)
      w.mouse_event(0x0004, 0, 0, 0, 0)
      sleepSync(70)
    }
  },
  drag(x, y, x2, y2) {
    if (!w) return execFileSync('python3', [resolve('scripts/xclick.py'), String(x), String(y), 'drag', String(x2), String(y2)])
    w.SetCursorPos(x, y)
    sleepSync(120)
    w.mouse_event(0x0002, 0, 0, 0, 0)
    for (let i = 1; i <= 10; i++) {
      sleepSync(30)
      w.SetCursorPos(Math.round(x + ((x2 - x) * i) / 10), Math.round(y + ((y2 - y) * i) / 10))
    }
    sleepSync(50)
    w.mouse_event(0x0004, 0, 0, 0, 0)
  },
  type(text, page) {
    if (!w) return page.keyboard.type(text)
    for (const ch of text) {
      const shift = ch !== ch.toLowerCase()
      const vk = ch === ' ' ? 0x20 : ch.toUpperCase().charCodeAt(0)
      if (shift) w.keybd_event(0x10, 0, 0, 0)
      w.keybd_event(vk, 0, 0, 0)
      w.keybd_event(vk, 0, 2, 0)
      if (shift) w.keybd_event(0x10, 0, 2, 0)
      sleepSync(15)
    }
  },
  key(name, page) {
    if (!w) return page.keyboard.press(name === 'Return' ? 'Enter' : name)
    const vk = { Return: 0x0d, Escape: 0x1b }[name]
    w.keybd_event(vk, 0, 0, 0)
    w.keybd_event(vk, 0, 2, 0)
  },
  /** One finger tap (Windows touch injection). False when the system refuses touch injection. */
  tap(x, y) {
    if (!w) return false
    const contact = (flags) => ({
      pointerInfo: {
        pointerType: 2, // PT_TOUCH
        pointerId: 0,
        frameId: 0,
        pointerFlags: flags,
        sourceDevice: null,
        hwndTarget: null,
        ptPixelLocation: { x, y },
        ptHimetricLocation: { x: 0, y: 0 },
        ptPixelLocationRaw: { x: 0, y: 0 },
        ptHimetricLocationRaw: { x: 0, y: 0 },
        dwTime: 0,
        historyCount: 0,
        InputData: 0,
        dwKeyStates: 0,
        PerformanceCount: 0,
        ButtonChangeType: 0
      },
      touchFlags: 0,
      touchMask: 0x7,
      rcContact: { left: x - 2, top: y - 2, right: x + 2, bottom: y + 2 },
      rcContactRaw: { left: 0, top: 0, right: 0, bottom: 0 },
      orientation: 90,
      pressure: 32000
    })
    const DOWN = 0x10000 | 0x2 | 0x4 // POINTER_FLAG_DOWN | INRANGE | INCONTACT
    const UP = 0x40000
    if (!w.InjectTouchInput(1, [contact(DOWN)])) return false
    sleepSync(60)
    w.InjectTouchInput(1, [contact(UP)])
    sleepSync(150)
    return true
  },
  /** The top-level window Windows would give a click at (x, y) to. */
  windowAt(x, y) {
    return w ? BigInt(w.GetAncestor(w.WindowFromPoint({ x, y }), 2)) : null
  }
}

// ---- The app being dictated into ------------------------------------------------------------
const TARGET_TITLE = 'S2T Target App'
let targetProc = null
function openTarget() {
  if (isWin) {
    const script = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object Windows.Forms.Form; $f.Text = '${TARGET_TITLE}'; $f.WindowState = 'Maximized'; $t = New-Object Windows.Forms.TextBox; $t.Multiline = $true; $t.Dock = 'Fill'; $f.Controls.Add($t); [void]$f.ShowDialog()`
    targetProc = spawn('powershell', ['-NoProfile', '-Command', script], { stdio: 'ignore' })
  } else {
    targetProc = spawn('xterm', ['-geometry', '200x60+0+0', '-title', TARGET_TITLE], { stdio: 'ignore' })
  }
}
const targetWindow = () => (w ? BigInt(w.FindWindowW(null, TARGET_TITLE)) : null)
/** Characters in the target app's text box (Windows), to catch typing that went to the wrong window. */
function targetText() {
  if (!w) return 0
  const edit = w.FindWindowExW(targetWindow(), 0, null, null)
  return edit ? Number(w.SendMessageW(edit, 0x000e, 0, 0)) : -1
}

// ---- One app launch ------------------------------------------------------------------------
async function launch(extraArgs = []) {
  const userData = mkdtempSync(join(tmpdir(), 's2t-e2e-'))
  const app = await electron.launch({
    executablePath: resolve(isWin ? 'node_modules/electron/dist/electron.exe' : 'node_modules/electron/dist/electron'),
    args: ['.', '--no-sandbox', ...extraArgs],
    env: { ...process.env, S2T_E2E: '1', S2T_E2E_USER_DATA: userData }
  })
  const main = (fn, arg) => app.evaluate(fn, arg)
  const overlay = await until(async () => app.windows().find((p) => p.url().includes('overlay')), 15000)
  // Without a window manager (xvfb) nothing keeps the HUD above S2Teasy's own window; on Windows it is pinned.
  if (!isWin) {
    await wait(1500)
    await main(({ BrowserWindow }) => {
      for (const win of BrowserWindow.getAllWindows()) if (win !== globalThis.__s2t.overlay()) win.hide()
    })
  }
  const hwnd = isWin
    ? BigInt(await main(() => globalThis.__s2t.overlay().getNativeWindowHandle().readBigUInt64LE(0).toString()))
    : null
  const close = async (tag) => {
    const log = await main(() => globalThis.__s2t.hudLog()).catch(() => '')
    writeFileSync(`release/e2e-real-${tag}.hud.log`, log)
    await Promise.race([app.close().catch(() => undefined), wait(10000)])
    rmSync(userData, { recursive: true, force: true })
  }
  return { app, main, overlay, hwnd, close }
}

async function screenshot(name, crop) {
  if (!isWin) return
  const file = resolve(`release/${name}.png`)
  const script = `Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b = [Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp = New-Object Drawing.Bitmap $b.Width, $b.Height; $g = [Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location, [Drawing.Point]::Empty, $b.Size); $bmp.Save('${file}')`
  try {
    execFileSync('powershell', ['-NoProfile', '-Command', script])
  } catch {
    note(`no screenshot ${name}`)
    return
  }
  if (!crop) return
  // A small crop around the HUD straight into the log, to see how its edges look on the desktop.
  const jpg = resolve(`release/${name}-crop.jpg`)
  const cut = `Add-Type -AssemblyName System.Drawing; $src = [Drawing.Image]::FromFile('${file}'); $r = New-Object Drawing.Rectangle ${crop.x}, ${crop.y}, ${crop.w}, ${crop.h}; $dst = New-Object Drawing.Bitmap ${crop.w}, ${crop.h}; $g = [Drawing.Graphics]::FromImage($dst); $g.DrawImage($src, 0, 0, $r, [Drawing.GraphicsUnit]::Pixel); $codec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }; $p = New-Object Drawing.Imaging.EncoderParameters 1; $p.Param[0] = New-Object Drawing.Imaging.EncoderParameter ([Drawing.Imaging.Encoder]::Quality), 55L; $dst.Save('${jpg}', $codec, $p)`
  try {
    execFileSync('powershell', ['-NoProfile', '-Command', cut])
    console.log(`SHOT ${name} ${require('node:fs').readFileSync(jpg).toString('base64')}`)
  } catch {
    note(`no crop ${name}`)
  }
}

// ---- One session on one HUD style ------------------------------------------------------------
async function session(ctx, label, hud, how = 'mouse') {
  const { main, overlay, hwnd } = ctx
  const state = () => main(() => globalThis.__s2t.state())
  const press = (p) => (how === 'touch' ? input.tap(p.x, p.y) : input.click(p.x, p.y))
  async function toScreen(rect) {
    const { bounds, scale } = await main(({ screen }) => ({
      bounds: globalThis.__s2t.overlay().getContentBounds(),
      scale: screen.getPrimaryDisplay().scaleFactor
    }))
    const k = isWin ? scale : 1
    return { x: Math.round((bounds.x + rect.x) * k), y: Math.round((bounds.y + rect.y) * k) }
  }
  let lastRect = null
  async function point(selector) {
    // Where it is once it has stopped moving (the HUD animates when it opens, pauses or resizes).
    const measure = () =>
      overlay
        .locator(selector)
        .first()
        .evaluate((el) => {
          const r = el.getBoundingClientRect()
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        }, undefined, { timeout: 4000 })
        .catch(() => null)
    let rect = await measure()
    for (let i = 0; i < 20 && rect; i++) {
      await wait(80)
      const next = await measure()
      const still = next && Math.abs(next.x - rect.x) < 0.5 && Math.abs(next.y - rect.y) < 0.5
      rect = next
      if (still) break
    }
    if (!rect) throw new Error(`nothing on the HUD matches ${selector}`)
    lastRect = rect
    return toScreen(rect)
  }
  const editBox = () => overlay.locator('input.hud-edit')
  const editFocused = () =>
    overlay.evaluate(() => document.hasFocus() && document.activeElement?.classList.contains('hud-edit')).catch(() => false)
  const words = async () => (await state()).partial.split(/\s+/).filter((t) => /^[a-z]+$/i.test(t))
  /** Editable words that are fully in view (the draft scrolls), as data-i indexes. */
  const visibleWords = () =>
    overlay.evaluate(() =>
      [...document.querySelectorAll('.hud-w')]
        .filter((el) => {
          const r = el.getBoundingClientRect()
          const box = el.closest('.hud-draft')?.getBoundingClientRect() ?? r
          return /^[a-z]+$/i.test(el.textContent) && r.top >= box.top && r.bottom <= box.bottom && r.width > 0
        })
        .map((el) => ({ i: el.dataset.i, text: el.textContent }))
    )

  // Fix one word with the real keyboard: press it, type, Enter.
  async function fixWord(step, replacement) {
    const seen = await visibleWords()
    const target = seen[Math.min(1, seen.length - 1)]
    if (!check(`${label}: ${step}: a word to press`, !!target)) return
    await overlay.evaluate(() => {
      window.__ev = []
      if (window.__evOn) return
      window.__evOn = true
      for (const t of ['pointerdown', 'pointerup', 'click'])
        document.addEventListener(t, (e) => window.__ev.push(`${t}:${e.target.className || e.target.nodeName}`), true)
    })
    const at = await point(`.hud-w[data-i="${target.i}"]`)
    await press(at)
    const opened = await until(() => editBox().isVisible().catch(() => false), 2000)
    const why = opened
      ? ''
      : JSON.stringify(
          await overlay.evaluate((t) => {
            const el = document.querySelector(`.hud-w[data-i="${t}"]`)
            const r = el?.getBoundingClientRect()
            return { word: el?.textContent, now: r && [Math.round(r.left), Math.round(r.top), Math.round(r.width)], events: window.__ev, html: el?.closest('.hud')?.dataset.phase }
          }, target.i)
        ) + ' aimed ' + JSON.stringify(lastRect) + ' ' + JSON.stringify(
          await overlay.evaluate(() => [...document.querySelectorAll('.hud-row, .hud-draft, .hud-toast, .hud-foot, .hud-pop')].map((e) => e.className.split(' ')[0] + ':' + Math.round(e.getBoundingClientRect().top) + '+' + Math.round(e.getBoundingClientRect().height)))
        )
    if (!check(`${label}: ${step}: pressing a word opens the edit box`, opened, why)) return
    check(`${label}: ${step}: the edit box has the keyboard`, !!(await until(editFocused, 2000)))
    const before = targetText()
    await input.type(replacement, overlay)
    await input.key('Return', overlay)
    check(
      `${label}: ${step}: typed fix lands in the text`,
      !!(await until(async () => (await state()).partial.includes(replacement), 3000)),
      (await state()).partial.slice(0, 80)
    )
    if (isWin) {
      check(`${label}: ${step}: nothing typed leaked into the app in front`, targetText() === before)
      const back = !!(await until(() => BigInt(w.GetForegroundWindow()) === targetWindow(), 2000))
      const front = BigInt(w.GetForegroundWindow())
      check(
        `${label}: ${step}: the app in front gets the keyboard back`,
        back,
        back ? '' : `front=${front.toString(16)} target=${targetWindow().toString(16)} hud=${hwnd.toString(16)} main=${(await main(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((x) => x.getNativeWindowHandle().readBigUInt64LE(0).toString(16)).join(',')))}`
      )
    }
  }

  await main((_, h) => globalThis.__s2t.settings({ hud: h }), {
    accent: '#7fe0c4', scale: 1, showCues: true, clickToEdit: true, sensitivity: 1, ...hud
  })
  await until(async () => (await state()).status === 'hidden', 10000)
  // Dictating into the app in front, as in real use.
  if (isWin) input.click(300, 300)
  await main(() => globalThis.__s2t.dictation.toggle())
  await until(async () => (await words()).length >= 6, 8000)
  await wait(500)

  // Windows' own hit test: the HUD's buttons belong to the HUD, its empty window area to the app below.
  if (isWin) {
    const done = await point('[data-a="send"]')
    check(`${label}: Windows sends a press on Done to the HUD`, input.windowAt(done.x, done.y) === hwnd)
    const { rects, bounds } = await main(() => ({
      rects: globalThis.__s2t.hudRects(),
      bounds: globalThis.__s2t.overlay().getContentBounds()
    }))
    const free = [
      { x: 3, y: 3 },
      { x: bounds.width - 4, y: 3 }
    ].find((p) => !rects.some((r) => p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height))
    if (free) {
      const p = await toScreen(free)
      check(`${label}: Windows sends a press beside the HUD to the app below`, input.windowAt(p.x, p.y) !== hwnd)
    }
  }

  // Collapsed HUD: pressing the text opens the editor.
  if ((await overlay.locator('.hud-w').count()) === 0) {
    await press(await point('.hud-roll, .hud-draft'))
    check(`${label}: pressing the text opens the editor`, !!(await until(async () => (await overlay.locator('.hud-w').count()) > 0, 2000)))
  }
  await fixWord('edit while talking', 'Ryzchs')
  await wait(300)
  await fixWord('second edit while talking', 'Rozay')

  // Drag across two words for a phrase (mouse only; a finger drag is the same path).
  if (how === 'mouse' && (await visibleWords()).length >= 3) {
    const seen = await visibleWords()
    const a = await point(`.hud-w[data-i="${seen[0].i}"]`)
    const b = await point(`.hud-w[data-i="${seen[1].i}"]`)
    input.drag(a.x, a.y, b.x, b.y)
    const box = await until(() => editBox().isVisible().catch(() => false), 2000)
    const value = box ? await editBox().inputValue() : ''
    check(`${label}: dragging across two words selects both`, value.trim().split(/\s+/).length >= 2, value)
    if (box) {
      await input.key('Escape', overlay)
      await until(async () => !(await editBox().isVisible().catch(() => false)), 2000)
    }
  }

  // Copy.
  await main(({ clipboard }) => clipboard.writeText(''))
  await press(await point('[data-a="copy"]'))
  check(`${label}: Copy copies`, !!(await until(async () => (await main(({ clipboard }) => clipboard.readText())).length > 0, 2000)))

  // Pause, then fix a word in the paused editor, then Done.
  await press(await point('[data-a="pause"]'))
  check(`${label}: Pause pauses`, !!(await until(() => main(() => globalThis.__s2t.dictation.isPaused()), 8000)))
  await until(async () => (await overlay.locator('[data-a="resume"]').count()) > 0, 4000)
  const crop = await main(({ screen }) => {
    const a = globalThis.__s2t.hudArea()
    const b = globalThis.__s2t.overlay().getContentBounds()
    const k = screen.getPrimaryDisplay().scaleFactor
    const pad = 60
    return a && {
      x: Math.max(0, Math.round((b.x + a.x - pad) * k)),
      y: Math.max(0, Math.round((b.y + a.y - pad) * k)),
      w: Math.round((a.width + pad * 2) * k),
      h: Math.round((a.height + pad * 2) * k)
    }
  })
  await screenshot(`hud-${label.replace(/[^a-z0-9]+/gi, '-')}-paused`, /cyber\/compact|caption\/full/.test(label) && how === 'mouse' ? crop : undefined)
  await fixWord('edit while paused', 'Sah')
  await press(await point('[data-a="send"]'))
  check(
    `${label}: Done (paused) finishes`,
    !!(await until(async () => ['success', 'leaving', 'hidden'].includes((await state()).status), 10000))
  )
}

// Two quick presses on Pause finish the take.
async function doubleTap(ctx, label, hud) {
  const { main, overlay } = ctx
  const state = () => main(() => globalThis.__s2t.state())
  await main((_, h) => globalThis.__s2t.settings({ hud: h }), {
    accent: '#7fe0c4', scale: 1, showCues: true, clickToEdit: true, sensitivity: 1, ...hud
  })
  await until(async () => (await state()).status === 'hidden', 10000)
  await main(() => globalThis.__s2t.dictation.toggle())
  await until(async () => (await state()).partial.split(' ').length >= 5, 8000)
  const r = await overlay.locator('[data-a="pause"]').first().evaluate((el) => {
    const b = el.getBoundingClientRect()
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
  })
  const { bounds, scale } = await main(({ screen }) => ({
    bounds: globalThis.__s2t.overlay().getContentBounds(),
    scale: screen.getPrimaryDisplay().scaleFactor
  }))
  const k = isWin ? scale : 1
  input.click(Math.round((bounds.x + r.x) * k), Math.round((bounds.y + r.y) * k), 2)
  check(
    `${label}: two quick presses on Pause finish`,
    !!(await until(async () => ['success', 'leaving', 'hidden'].includes((await state()).status), 10000))
  )
}

async function pass(tag, args, runs) {
  let ctx
  const before = results.filter((r) => !r.ok).length
  try {
    ctx = await launch(args)
    for (const run of runs) {
      if (results.filter((r) => !r.ok).length - before >= 12) break
      try {
        await run(ctx)
      } catch (error) {
        check(`${tag}: run`, false, error.message.split('\n')[0])
        await ctx.main(() => globalThis.__s2t.dictation.cancel()).catch(() => undefined)
      }
    }
  } catch (error) {
    check(`${tag}: launch`, false, error.message.split('\n')[0])
  } finally {
    await ctx?.close(tag)
  }
}

openTarget()
await wait(isWin ? 4000 : 1500)
const styles = (process.env.STYLES || 'island,cyber,caption').split(',')
await pass('mouse', [], [
  ...styles.flatMap((style) =>
    ['compact', 'full'].map((layout) => (ctx) => session(ctx, `${style}/${layout}`, { style, whileTalking: layout }))
  ),
  (ctx) => doubleTap(ctx, 'cyber/compact', { style: 'cyber', whileTalking: 'compact' })
])
if (isWin) {
  await pass('scaled-150', ['--force-device-scale-factor=1.5'], [
    (ctx) => session(ctx, '150%/cyber/compact', { style: 'cyber', whileTalking: 'compact' }),
    (ctx) => session(ctx, '150%/cyber/full', { style: 'cyber', whileTalking: 'full' })
  ])
  if (w.InitializeTouchInjection(1, 3)) {
    await pass('touch', [], [
      (ctx) => session(ctx, 'touch/cyber/compact', { style: 'cyber', whileTalking: 'compact' }, 'touch'),
      (ctx) => session(ctx, 'touch/cyber/full', { style: 'cyber', whileTalking: 'full' }, 'touch')
    ])
  } else note('touch injection is not available on this machine; touch runs skipped')
}
targetProc?.kill()

const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
