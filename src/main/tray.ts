import { Menu, Tray, BrowserWindow, app } from 'electron'
import { loadIcon } from './windows'
import type { UpdateStatus } from '../shared/types'

export function createTray(opts: {
  mainWindow: BrowserWindow
  onToggle: () => void
  onQuit: () => void
  onCheckUpdate: () => void
  onInstallUpdate: () => void
}): { tray: Tray; refresh: (update: UpdateStatus) => void } {
  const tray = new Tray(loadIcon())
  tray.setToolTip('S2Teasy')

  const refresh = (update: UpdateStatus) => {
    const applying = update.phase === 'applying'
    const ready = update.phase === 'ready'
    const available = update.phase === 'available' || update.phase === 'downloading'
    tray.setToolTip(ready ? `S2Teasy · ${update.availableVersion} ready` : 'S2Teasy')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Open S2Teasy',
          click: () => {
            opts.mainWindow.show()
            opts.mainWindow.focus()
          }
        },
        {
          label: 'Start / stop dictation',
          click: () => opts.onToggle()
        },
        { type: 'separator' },
        {
          enabled: !applying,
          label: applying
            ? 'Applying update…'
            : ready
              ? `Restart to update (${update.availableVersion})`
              : available
                ? `Update ${update.availableVersion}…`
                : 'Check for updates',
          click: () => {
            if (ready) opts.onInstallUpdate()
            else opts.onCheckUpdate()
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => {
            app.quit()
            opts.onQuit()
          }
        }
      ])
    )
  }

  refresh({
    phase: 'idle',
    currentVersion: app.getVersion(),
    availableVersion: '',
    percent: 0,
    message: '',
    packaging: 'dev'
  })

  tray.on('click', () => {
    opts.mainWindow.show()
    opts.mainWindow.focus()
  })
  return { tray, refresh }
}
