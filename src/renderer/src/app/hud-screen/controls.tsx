import { useEffect, useRef, useState } from 'react'

/** A slider that follows the pointer locally and saves once it settles, so dragging does not save on every pixel. */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onCommit
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onCommit: (value: number) => void
}) {
  const [local, setLocal] = useState(value)
  const dirty = useRef(false)
  const timer = useRef(0)
  const commit = useRef(onCommit)
  commit.current = onCommit
  useEffect(() => {
    if (!dirty.current) setLocal(value)
  }, [value])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const change = (next: number) => {
    setLocal(next)
    dirty.current = true
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      dirty.current = false
      commit.current(next)
    }, 250)
  }
  return (
    <label className="hudsc-range">
      <span>
        <span>{label}</span>
        <span className="mono">{format(local)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={local}
        aria-valuetext={format(local)}
        onChange={(event) => change(Number(event.target.value))}
      />
    </label>
  )
}

/** A segmented choice between a few options. */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: { id: T; label: string }[]
  onChange: (id: T) => void
}) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** A number box that saves when you leave it or press Enter. */
export function NumberBox({
  id,
  label,
  value,
  min,
  max,
  onCommit
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  onCommit: (value: number) => void
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const commit = () => {
    const parsed = Math.round(Number(text))
    if (!Number.isFinite(parsed) || text.trim() === '') return setText(String(value))
    const next = Math.max(min, Math.min(max, parsed))
    setText(String(next))
    if (next !== value) onCommit(next)
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input mono"
        type="number"
        min={min}
        max={max}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
        }}
      />
    </div>
  )
}
