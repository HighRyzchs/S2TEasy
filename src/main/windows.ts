import { BrowserWindow, nativeImage, screen, shell } from 'electron'
import { join } from 'node:path'
import { overlaySize, overlayCoordinates } from '../shared/overlay-layout'
import type { OverlayPosition } from '../shared/types'
import type { OverlayTheme } from '../shared/overlay-theme'
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
    backgroundColor: '#101315',
    icon: loadIcon(),
    title: 'S2Teasy',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#101315',
      symbolColor: '#eff3f2',
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
  window.setIgnoreMouseEvents(false)
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
  position: OverlayPosition = 'bottom',
  offset = { x: 0, y: 0 }
): void {
  if (window.isDestroyed()) return
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const point = overlayCoordinates(display.workArea, window.getBounds(), position, offset)
  window.setPosition(point.x, point.y)
  pinOverlayTopmost(window)
}

export function sizeOverlay(window: BrowserWindow, theme: OverlayTheme): void {
  if (window.isDestroyed()) return
  const { width, height } = overlaySize(theme)
  const bounds = window.getBounds()
  if (bounds.width !== width || bounds.height !== height) window.setSize(width, height)
}
