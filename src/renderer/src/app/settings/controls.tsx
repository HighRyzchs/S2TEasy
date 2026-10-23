import type { ReactNode } from 'react'
import { useApp } from '../context'
import type { AppSettings } from '@shared/types'

/** Save a patch; the app shows the failure as a toast, so callers only need to swallow it. */
export function useSave(): (patch: Partial<AppSettings>) => void {
  const { save } = useApp()
  return (patch) => {
    void save(patch).catch(() => undefined)
  }
}

/** A titled card that the section index can scroll to. */
export function Section({
  id,
  title,
  intro,
  children
}: {
  id: string
  title: string
  intro?: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} className="card set-section" aria-labelledby={`${id}-h`} data-section={id}>
      <div className="set-section-head">
        <h2 id={`${id}-h`}>{title}</h2>
        {intro && <p className="hint">{intro}</p>}
      </div>
      {children}
    </section>
  )
}

/** A row with a checkbox on the right; the whole row is the label. */
export function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange
}: {
  label: ReactNode
  hint?: ReactNode
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="line set-toggle">
      <span>
        <span>{label}</span>
        {hint && <span className="hint">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  )
}

export function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span className={ok ? 'pill' : 'pill bad'}>
      <span aria-hidden="true">{ok ? '✓' : '✕'}</span> <span className="sr-only">{ok ? 'Passed: ' : 'Failed: '}</span>
      {children}
    </span>
  )
}
