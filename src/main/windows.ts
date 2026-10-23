import { BrowserWindow, nativeImage, screen, shell } from 'electron'
import { join } from 'node:path'
import { overlayCoordinates } from '../shared/overlay-layout'
import type { OverlayPosition } from '../shared/types'
import { hudWindowSize, type HudSettings } from '../shared/hud'
import iconPath from '../../resources/icon.png?asset'
import { attachOverlayTopmost, pinOverlayTopmost } from './overlay-topmost'

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL)

export function loadIcon(): Electron.NativeImage {
  try {
    return nativeImage.createFromPath(iconPath)
  } catch {
    return nativeImage.createEmpty()
  }
}

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 980,
    height: 680,
    minWidth: 820,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0e1113',
    icon: loadIcon(),
    title: 'S2Teasy',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0e1113',
      symbolColor: '#eef3f1',
      height: 40
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  window.webContents.setWindowOpenHandler((details) => {
    if (/^https?:\/\//i.test(details.url)) void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  window.on('ready-to-show', () => {
    window.show()
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return window
}

export function createOverlayWindow(): BrowserWindow {
  const { width } = screen.getPrimaryDisplay().workAreaSize
  const overlayWidth = 520
  const overlayHeight = 96
  const window = new BrowserWindow({
    width: overlayWidth,
    height: overlayHeight,
    x: Math.round(width / 2 - overlayWidth / 2),
    y: screen.getPrimaryDisplay().workAreaSize.height - overlayHeight - 36,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: false,
    fullscreenable: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })
  window.setAlwaysOnTop(true, 'screen-saver')
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // Transparent stage: clicks pass through until the pointer is over the HUD itself.
  window.setIgnoreMouseEvents(true, { forward: true })
  attachOverlayTopmost(window)
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay.html`)
  } else {
    window.loadFile(join(__dirname, '../renderer/overlay.html'))
  }
  return window
}

export function createRecorderWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 80,
    height: 80,
    show: false,
    skipTaskbar: true,
    frame: false,
    transparent: false,
    focusable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  })
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/recorder.html`)
  } else {
    window.loadFile(join(__dirname, '../renderer/recorder.html'))
  }
  return window
}

export function placeOverlay(
  window: BrowserWindow,
  hud: HudSettings,
  position: OverlayPosition = 'bottom',
  offset = { x: 0, y: 0 }
): void {
  if (window.isDestroyed()) return
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  sizeOverlay(window, hud, display.workArea.width)
  // Edge glow runs along the bottom edge of the screen; every other style keeps a margin.
  const point =
    hud.style === 'edge'
      ? {
          x: display.workArea.x,
          y: display.workArea.y + display.workArea.height - window.getBounds().height
        }
      : overlayCoordinates(display.workArea, window.getBounds(), position, offset)
  window.setPosition(point.x, point.y)
  pinOverlayTopmost(window)
}

export function sizeOverlay(window: BrowserWindow, hud: HudSettings, displayWidth?: number): void {
  if (window.isDestroyed()) return
  const width = displayWidth ?? screen.getDisplayNearestPoint(window.getBounds()).workArea.width
  const size = hudWindowSize(hud, width)
  const bounds = window.getBounds()
  if (bounds.width !== size.width || bounds.height !== size.height)
    window.setSize(size.width, size.height)
}
