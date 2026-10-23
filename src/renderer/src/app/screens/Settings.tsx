import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../context'
import { AppSection } from '../settings/AppSection'
import { EngineSection } from '../settings/EngineSection'
import { MicSection } from '../settings/MicSection'
import { PrivacySection } from '../settings/PrivacySection'
import { ShortcutSection } from '../settings/ShortcutSection'
import { SECTIONS, activeSection, resolveSection, type SectionId } from '../settings/sections'
import '../settings/settings.css'

export function Settings() {
  const { target } = useApp()
  const page = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<SectionId>(resolveSection(target.section) ?? 'engine')
  // While a scroll we started is under way, keep the section we chose highlighted.
  const lock = useRef(0)

  const goTo = useCallback((id: SectionId) => {
    setActive(id)
    lock.current = Date.now() + 700
    const el = document.getElementById(id)
    el?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }, [])

  useEffect(() => {
    const id = resolveSection(target.section)
    if (!id) return
    setActive(id)
    lock.current = Date.now() + 700
    // Wait a frame so the cards exist before measuring.
    const frame = requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView?.({ block: 'start' })
    )
    return () => cancelAnimationFrame(frame)
  }, [target])

  useEffect(() => {
    const scroller = page.current
    if (!scroller) return
    const onScroll = () => {
      if (Date.now() < lock.current) return
      const top = scroller.getBoundingClientRect().top
      const tops = {} as Record<SectionId, number>
      for (const { id } of SECTIONS) {
        const el = document.getElementById(id)
        tops[id] = el ? el.getBoundingClientRect().top - top : Infinity
      }
      const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4
      setActive(activeSection(tops, { atEnd: atEnd && scroller.scrollTop > 0 }))
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="page" ref={page}>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>The HUD, Your voice and Usage have their own pages. Everything else is here.</p>
        </div>
      </div>
      <div className="set-layout">
        <nav className="set-index" aria-label="Settings sections">
          {SECTIONS.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={active === id ? 'true' : undefined}
              onClick={(event) => {
                event.preventDefault()
                goTo(id)
              }}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="set-sections">
          <EngineSection />
          <MicSection />
          <ShortcutSection />
          <PrivacySection />
          <AppSection />
        </div>
      </div>
    </div>
  )
}
