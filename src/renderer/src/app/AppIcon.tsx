import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/apps'

// One lookup per program for the whole app session; icons do not change while it runs.
const cache = new Map<string, Promise<string | null>>()

/** The real icon of the program a session typed into, or its first letter while none is known. */
export function AppIcon({ app, small = false }: { app?: AppInfo; small?: boolean }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    if (!app?.exe) return
    let alive = true
    if (!cache.has(app.exe)) cache.set(app.exe, window.s2t.appIcon(app.exe).catch(() => null))
    void cache.get(app.exe)!.then((url) => alive && setSrc(url))
    return () => {
      alive = false
    }
  }, [app?.exe])
  return (
    <span className={small ? 'app-icon small' : 'app-icon'} title={app?.name} aria-hidden="true">
      {src ? <img src={src} alt="" /> : (app?.name ?? '·').slice(0, 1).toUpperCase()}
    </span>
  )
}
