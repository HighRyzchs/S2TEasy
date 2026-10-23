import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react'
import { downsample, onFirstLine, placePill, unionBox, type Box } from './geometry'
import { CheckIcon, CopyIcon, MicIcon } from './icons'
import { countdownFraction, finishLabel, hpColor, stepped } from './timer'
import { cleanWord } from './tokens'
import type { Fix } from './types'

const WAVE_BARS = 12

/** The waveform. It reads the latest bars every frame and sets heights directly, so the HUD itself does not re-render at 60 fps. */
export function Wave({
  barsRef,
  pixel,
  still = false
}: {
  barsRef: MutableRefObject<number[]>
  pixel: boolean
  still?: boolean
}) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let frame = 0
    const tick = () => {
      const values = downsample(barsRef.current, WAVE_BARS)
      ref.current?.childNodes.forEach((node, index) => {
        let height = 3 + values[index] * 21
        if (pixel) height = Math.max(4, Math.round(height / 4) * 4)
        ;(node as HTMLElement).style.height = `${height.toFixed(1)}px`
      })
      if (!still) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [barsRef, pixel, still])
  return (
    <span className="hud-wave" ref={ref} aria-hidden>
      {Array.from({ length: WAVE_BARS }, (_, index) => (
        <i key={index} />
      ))}
    </span>
  )
}

export function CueSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="hud-cue"
      aria-pressed={on}
      title="Speech cues: emotion and delivery tags"
      onClick={onToggle}
    >
      <span className="sw" aria-hidden />
      Cues
    </button>
  )
}

export function CopyButton({ onCopy }: { onCopy: () => Promise<boolean> | boolean | void }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const copy = async () => {
    const ok = await Promise.resolve(onCopy()).catch(() => false)
    if (ok === false) return
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      type="button"
      className="hud-btn hud-copy"
      data-a="copy"
      aria-label={copied ? 'Copied' : 'Copy text'}
      title="Copy text"
      onClick={() => void copy()}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  )
}

/** The paused finish countdown: a bar that drains by the frame, or "on hold" while the pointer is here. */
export function Countdown({ finishAt, pixel }: { finishAt: number | undefined; pixel: boolean }) {
  const timer = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLElement>(null)
  const finish = useRef(finishAt)
  finish.current = finishAt
  const total = useRef(0)
  const fraction = useRef(1)
  const [label, setLabel] = useState(() => finishLabel(finishAt, Date.now()))

  useEffect(() => {
    let frame = 0
    const tick = () => {
      const now = Date.now()
      const at = finish.current
      if (at !== undefined) {
        total.current = Math.max(total.current, at - now)
        fraction.current = countdownFraction(at, now, total.current)
      }
      const shown = pixel ? stepped(fraction.current) : fraction.current
      if (bar.current) bar.current.style.transform = `scaleX(${shown})`
      if (timer.current) {
        if (pixel) timer.current.style.setProperty('--hp', hpColor(fraction.current))
        else timer.current.style.removeProperty('--hp')
      }
      setLabel(finishLabel(at, now))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [pixel])

  return (
    <div className="hud-foot">
      <span className="hud-hp" aria-hidden>
        HP
      </span>
      <div className="hud-timer" ref={timer} aria-hidden>
        <i ref={bar} />
      </div>
      <span className="hud-left" role="status">
        {label}
      </span>
    </div>
  )
}

type PillProps = {
  fix: Fix
  scale: number
  /** Ghost text and top-anchored HUDs open the pill downward. */
  preferBelow: boolean
  onChoose: (kind: 'name' | 'accent' | null) => void
  onClip: () => void
}

/**
 * The one-line "Remember this?" pill. It floats over the fixed word (an absolutely positioned child of
 * the HUD), so it never changes the HUD's size, and it only appears once the word is in the text.
 */
export function RememberPill({ fix, scale, preferBelow, onChoose, onClip }: PillProps) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const pill = ref.current
    const hud = pill?.parentElement
    if (!pill || !hud) return
    const hudRect = hud.getBoundingClientRect()
    const rel = (el: Element): Box => {
      const r = el.getBoundingClientRect()
      return {
        left: (r.left - hudRect.left) / scale,
        top: (r.top - hudRect.top) / scale,
        width: r.width / scale,
        height: r.height / scale
      }
    }
    const words = [...hud.querySelectorAll<HTMLElement>('[data-start]')].filter((el) => {
      const start = Number(el.dataset.start)
      return start >= fix.start && start < fix.start + fix.length
    })
    const word = unionBox(words.map(rel))
    if (!word) {
      pill.dataset.placed = 'false'
      return
    }
    const draft = hud.querySelector('.hud-draft')
    const firstLine = draft ? onFirstLine(word.top, rel(draft).top, word.height) : true
    const place = placePill({
      hudWidth: hud.offsetWidth,
      word,
      pill: { width: pill.offsetWidth, height: pill.offsetHeight },
      below: preferBelow || firstLine
    })
    pill.style.left = `${place.left}px`
    pill.style.top = `${place.top}px`
    pill.style.setProperty('--arrow', `${place.arrow}px`)
    pill.dataset.below = String(place.below)
    pill.dataset.placed = 'true'
  })

  const heard = fix.from.split(/\s+/).filter(Boolean).length
  return (
    <div
      ref={ref}
      className="hud-pop"
      role="dialog"
      aria-label="Remember this fix"
      data-placed="false"
    >
      <span className="q">
        Remember <b>{cleanWord(fix.to)}</b>?
        {heard > 1 && <small>{heard} heard words → 1</small>}
      </span>
      <button type="button" data-k="name" title="A word it didn't know, like a name or brand" onClick={() => onChoose('name')}>
        Name
      </button>
      <button type="button" data-k="accent" title="My accent or pronunciation made it mishear" onClick={() => onChoose('accent')}>
        My accent
      </button>
      <button type="button" data-k="" title="Fix this message only" onClick={() => onChoose(null)}>
        Once
      </button>
      <button
        type="button"
        className="clip"
        aria-pressed={fix.clip}
        aria-label="Keep the clip of how I said it"
        title="Keep the clip of how I said it"
        onClick={onClip}
      >
        <MicIcon />
      </button>
    </div>
  )
}
