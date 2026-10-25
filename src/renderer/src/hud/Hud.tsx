import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent
} from 'react'
import type { HudSettings } from '@shared/hud'
import type { OverlayState, OverlayStatus } from '@shared/types'
import { Draft, EditField, WordList } from './Draft'
import { Countdown, CopyButton, CueSwitch, RememberPill, Wave } from './controls'
import { anchorOf } from './geometry'
import { MicIcon, PauseIcon, SpinnerIcon, WarnIcon } from './icons'
import {
  cleanWord,
  cueColor,
  latestCue,
  normalizeEdit,
  relocateSpan,
  spanRange,
  tokenize,
  withLiveCues,
  wordCount,
  type Span
} from './tokens'
import type { Fix, HudApi } from './types'
import './fonts'
import './hud.css'

export type HudProps = {
  state: OverlayState
  settings: HudSettings
  /** AppSettings.overlayPosition. */
  position: string
  /** Latest waveform bars (0-1), written by the owner every frame. */
  barsRef: MutableRefObject<number[]>
  api?: HudApi
  /** Start with the editor open while listening (browser preview). */
  defaultOpen?: boolean
  /** Never fold the editor back to one line (browser preview). */
  keepOpen?: boolean
  preview?: boolean
  /** Fill the nearest positioned parent instead of the window (settings screen, website). */
  embedded?: boolean
  /** A frozen copy: no animation loops or transitions, for galleries. */
  still?: boolean
  /** The person dismissed an error. */
  onDismiss?: () => void
}

type Phase = 'rec' | 'paused' | 'busy' | 'done' | 'error' | 'arm'

const PHASES: Partial<Record<OverlayStatus, Phase>> = {
  listening: 'rec',
  paused: 'paused',
  transcribing: 'busy',
  inserting: 'busy',
  success: 'done',
  error: 'error',
  'arm-paste': 'arm'
}

const COLLAPSE_MS = 2500
const TOUCH_COLLAPSE_MS = 6000
const NOTICE_MS = 4000

export function Hud({
  state,
  settings,
  position,
  barsRef,
  api = window.s2t,
  defaultOpen = false,
  keepOpen = false,
  preview = false,
  embedded = false,
  still = false,
  onDismiss
}: HudProps) {
  const root = useRef<HTMLDivElement>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  // While leaving, keep showing the layout the session had.
  const lastStatus = useRef<OverlayStatus>(state.status)
  useEffect(() => {
    if (state.status !== 'leaving' && state.status !== 'hidden') lastStatus.current = state.status
  }, [state.status])
  const leaving = state.status === 'leaving'
  const shown = leaving ? lastStatus.current : state.status
  const phase: Phase = PHASES[shown] ?? 'done'

  const [open, setOpen] = useState(defaultOpen)
  const [hovering, setHovering] = useState(false)
  const [editing, setEditing] = useState<(Span & { text: string; suggested?: string }) | null>(null)
  const [fix, setFix] = useState<Fix | null>(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(0)

  const anchor = anchorOf(position)
  const cues = state.cues ?? false
  const tokens = useMemo(
    () => withLiveCues(tokenize(state.partial, state.typedLength ?? 0), cues ? state.liveCues : undefined),
    [state.partial, state.typedLength, state.liveCues, cues]
  )
  const words = wordCount(tokens)
  // Voice memory suggestions, found again in the current text (it changes while you talk).
  const hints = useMemo(
    () =>
      (state.memoryHints ?? []).flatMap((hint) => {
        const span = relocateSpan(state.partial, hint)
        return span ? [{ ...span, suggestion: hint.suggestion }] : []
      }),
    [state.memoryHints, state.partial]
  )
  const cue = cues ? latestCue(tokens) : undefined
  const editor = phase === 'paused' || (phase === 'rec' && open)
  const editRange = useMemo(
    () => (editing ? relocateSpan(state.partial, editing) : null),
    [editing, state.partial]
  )
  const showToast = useCallback((text: string, ms = NOTICE_MS) => {
    window.clearTimeout(toastTimer.current)
    setToast(text)
    toastTimer.current = window.setTimeout(() => setToast(''), ms)
  }, [])
  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  // Notices from the main process, such as where an edit was saved.
  useEffect(() => {
    if (!state.notice || !state.noticeAt) return
    const left = NOTICE_MS - (Date.now() - state.noticeAt)
    if (left > 0) showToast(state.notice, left)
  }, [state.notice, state.noticeAt, showToast])

  // The mouse over the HUD keeps a paused session waiting and an open editor open. Touch and pen
  // have no hover (they "leave" as soon as they lift), so for them each press restarts the timers.
  const [pokedAt, setPokedAt] = useState(0)
  const enter = (event: ReactPointerEvent) => {
    if (event.pointerType !== 'mouse') return
    setHovering(true)
    api.hudPointer(true)
  }
  const leave = (event: ReactPointerEvent) => {
    if (event.pointerType !== 'mouse') return
    setHovering(false)
    api.hudPointer(false)
  }
  useEffect(() => () => api.hudPointer(false), [api])
  // A hidden HUD gets no pointer leave; start the next session fresh.
  useEffect(() => {
    if (state.status !== 'hidden') return
    setHovering(false)
    setPokedAt(0)
  }, [state.status])

  // The parts of the HUD that are drawn. The main process makes exactly these take clicks (window
  // shape), so clicks, touch and pen reach the HUD there and the app underneath everywhere else.
  const visible = state.status !== 'hidden'
  useEffect(() => {
    if (embedded) return
    if (!visible) {
      api.hudArea([])
      return
    }
    let frame = 0
    let last = ''
    const measure = () => {
      const el = root.current
      if (el) {
        const edge = el.dataset.skin === 'edge' && el.dataset.open !== 'true'
        const parts = edge
          ? [...el.querySelectorAll<HTMLElement>('.hud-roll, .hud-btn, .hud-cue, .hud-draft, .hud-pop, .hud-toast')]
          : [el, ...el.querySelectorAll<HTMLElement>('.hud-pop, .hud-toast')]
        const rects = parts
          .map((part) => part.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0)
          .map((r) => ({
            x: Math.floor(r.left),
            y: Math.floor(r.top),
            width: Math.ceil(r.right) - Math.floor(r.left),
            height: Math.ceil(r.bottom) - Math.floor(r.top)
          }))
        const key = JSON.stringify(rects)
        if (key !== last) {
          last = key
          api.hudArea(rects)
        }
      }
      frame = requestAnimationFrame(measure)
    }
    frame = requestAnimationFrame(measure)
    return () => {
      cancelAnimationFrame(frame)
      api.hudArea([])
    }
  }, [api, embedded, visible])

  const held = phase === 'paused' && (hovering || !!editing || !!fix)
  useEffect(() => {
    api.hudHold(held)
  }, [api, held])
  useEffect(() => () => api.hudHold(false), [api])

  // An editor opened while talking folds back once the pointer has left and nothing is being fixed.
  useEffect(() => {
    if (keepOpen || phase !== 'rec' || !open || hovering || editing || fix) return
    const timer = window.setTimeout(() => setOpen(false), pokedAt ? TOUCH_COLLAPSE_MS : COLLAPSE_MS)
    return () => window.clearTimeout(timer)
  }, [keepOpen, phase, open, hovering, editing, fix, pokedAt])

  // A pending "remember?" pill belongs to the editor it was raised in.
  useEffect(() => {
    if (!editor) setFix(null)
  }, [editor])

  // The level ring and the edge glow follow the voice.
  useEffect(() => {
    if (still) return
    let frame = 0
    let level = 0
    const tick = () => {
      const current = stateRef.current
      const target =
        current.status === 'listening' ? Math.min(0.12, current.rms * settings.sensitivity * 0.8) : 0
      level += (target - level) * 0.2
      root.current?.style.setProperty('--lvl', level.toFixed(3))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [settings.sensitivity, still])

  const beginEdit = (first: number, last: number) => {
    const picked = spanRange(tokens, first, last)
    if (!picked) return
    setFix(null) // starting another fix answers the open prompt with "once"
    // Clicking an underlined voice-memory match edits the whole match, prefilled with the fix.
    const hint = hints.find((h) => picked.start < h.end && h.start < picked.end)
    const range = hint ? { start: Math.min(hint.start, picked.start), end: Math.max(hint.end, picked.end) } : picked
    setEditing({ ...range, text: state.partial.slice(range.start, range.end), suggested: hint?.suggestion })
  }

  const finishEdit = (value: string | null) => {
    const current = editing
    setEditing(null)
    void api.hudFocus(false)
    if (!current || value === null) return
    const next = normalizeEdit(value)
    const latest = stateRef.current
    const range = relocateSpan(latest.partial, current)
    if (!next || !range || next === current.text) return
    if (!latest.sessionId) {
      showToast('Could not save that fix')
      return
    }
    setFix({ start: range.start, length: next.length, from: current.text, to: next, clip: true })
    api
      .hudEdit(latest.sessionId, range.start, range.end, next)
      .then((result) => {
        if (result === 'kept-in-history')
          showToast('Fix kept in History. The text in your app was left alone.')
      })
      .catch(() => showToast('Could not apply that fix'))
  }

  const choose = (kind: 'name' | 'accent' | null) => {
    if (!fix) return
    setFix(null)
    if (!kind) return
    const heard = cleanWord(fix.from)
    const meant = cleanWord(fix.to)
    if (!heard || !meant) return
    void api.learnWord({ heard, meant, kind }).then(
      () => showToast(`Saved. “${heard}” will come out as “${meant}”`),
      () => showToast('Could not save that word')
    )
  }

  // Controls: any of these answers an open "remember?" pill with "once".
  const act = (action: () => unknown) => () => {
    setFix(null)
    void Promise.resolve(action()).catch(() => undefined)
  }

  // Pause, or two quick taps for Done: the first tap waits a moment to see if a second follows.
  const tapTimer = useRef(0)
  useEffect(() => () => window.clearTimeout(tapTimer.current), [])
  const pauseOrDone = () => {
    setFix(null)
    if (tapTimer.current) {
      window.clearTimeout(tapTimer.current)
      tapTimer.current = 0
      void api.hudFinish().catch(() => undefined)
      return
    }
    tapTimer.current = window.setTimeout(() => {
      tapTimer.current = 0
      void api.hudPause().catch(() => undefined)
    }, 300)
  }

  const copy = () => api.copyHistory(stateRef.current.partial)
  const toggleCues = () => void api.hudCues(!cues).catch(() => undefined)
  const block =
    settings.whileTalking === 'full' || settings.style === 'caption' || settings.style === 'ghost'
  const clickToEdit = settings.clickToEdit
  const cueStyle = cues ? (cueColor(cue) ?? settings.accent) : settings.accent
  const openEditor = clickToEdit ? () => setOpen(true) : undefined
  const pixel = settings.style === 'pixel'
  const dim = (state.typedLength ?? 0) > 0

  const cueSwitch = settings.showCues ? <CueSwitch on={cues} onToggle={toggleCues} /> : null
  const count = (
    <span className="hud-count" aria-label={`${words} words`}>
      {words}
    </span>
  )

  const field = editing && (
    <EditField
      initial={editing.suggested ?? editing.text}
      focusWindow={() => api.hudFocus(true)}
      onDone={finishEdit}
    />
  )
  const fixed: Span | null = fix ? { start: fix.start, end: fix.start + fix.length } : null
  const draft = (
    <Draft
      tokens={tokens}
      editable
      editRange={editRange}
      field={field}
      marked={fixed}
      hints={hints}
      dimUntyped={dim}
      highlightNewest={phase === 'rec'}
      follow={phase === 'rec' && !editing && !fix}
      onSelect={beginEdit}
      empty="Nothing heard yet."
    />
  )

  let body
  if (phase === 'rec' && !editor) {
    const text = (
      <WordList tokens={tokens} dimUntyped={dim} hints={hints} highlightNewest />
    )
    const listening = <span className="hud-empty">Listening…</span>
    body = (
      <>
        <div className="hud-row">
          <span className="hud-ind rec">
            <MicIcon />
          </span>
          <Wave barsRef={barsRef} pixel={pixel} still={still} />
          {block ? (
            <span className="grow hud-label" role="status">
              Listening{clickToEdit ? ' · click words to edit' : ''}
            </span>
          ) : openEditor ? (
            <button
              type="button"
              className="grow hud-roll"
              title="Click to edit while you talk"
              onClick={openEditor}
            >
              <span>{tokens.length ? text : listening}</span>
            </button>
          ) : (
            <span className="grow hud-roll static" role="status">
              <span>{tokens.length ? text : listening}</span>
            </span>
          )}
          {count}
          {cueSwitch}
          <CopyButton onCopy={copy} />
          <button type="button" className="hud-btn" data-a="pause" onClick={pauseOrDone}>
            Pause
          </button>
          <button type="button" className="hud-btn go" data-a="send" onClick={act(api.hudFinish)}>
            Done
          </button>
        </div>
        {block && (
          <Draft
            tokens={tokens}
            dimUntyped={dim}
            highlightNewest
            follow
            onOpen={openEditor}
            empty="Listening…"
          />
        )}
        {toast && (
          <div className="hud-toast" role="status">
            {toast}
          </div>
        )}
      </>
    )
  } else if (editor) {
    const rec = phase === 'rec'
    body = (
      <>
        <div className="hud-row">
          <span className={`hud-ind ${rec ? 'rec' : 'held'}`}>{rec ? <MicIcon /> : <PauseIcon />}</span>
          {rec && <Wave barsRef={barsRef} pixel={pixel} still={still} />}
          <span className="grow hud-title" role="status">
            {rec ? 'Listening' : 'Paused'}
            <small>{rec ? 'keep talking · click a word to fix it' : 'click a word, or drag across several'}</small>
          </span>
          {count}
          {cueSwitch}
          {!rec && (
            <button type="button" className="hud-btn" data-a="discard" onClick={act(api.cancelRecording)}>
              Discard
            </button>
          )}
          <button
            type="button"
            className="hud-btn"
            data-a={rec ? 'pause' : 'resume'}
            onClick={pauseOrDone}
          >
            {rec ? 'Pause' : 'Resume'}
          </button>
          <CopyButton onCopy={copy} />
          <button type="button" className="hud-btn go" data-a="send" onClick={act(api.hudFinish)}>
            Done
          </button>
        </div>
        {draft}
        <div className="hud-toast" role="status">
          {toast}
        </div>
        {rec ? (
          <div className="hud-foot">
            <span className="hud-hintline">Editing live · it collapses when you move away</span>
          </div>
        ) : (
          <Countdown finishAt={state.finishAt} pixel={pixel} />
        )}
      </>
    )
  } else if (phase === 'busy') {
    body = (
      <div className="hud-row">
        <span className="hud-ind spin held">
          <SpinnerIcon />
        </span>
        <span className="grow hud-title" role="status">
          {state.message || 'Finishing'}
        </span>
        {state.partial.trim() && <CopyButton onCopy={copy} />}
        {state.message === 'Pausing' && (
          <button type="button" className="hud-btn go" data-a="send" onClick={act(api.hudFinish)}>
            Done
          </button>
        )}
      </div>
    )
  } else if (phase === 'done') {
    body = (
      <div className="hud-row">
        <span className="hud-ind ok">
          <MicIcon />
        </span>
        <span className="grow hud-title" role="status">
          Saved{words ? ` · ${words} ${words === 1 ? 'word' : 'words'}` : ''}
          {toast && <small>{toast}</small>}
        </span>
        {words > 0 && <CopyButton onCopy={copy} />}
      </div>
    )
  } else if (phase === 'error') {
    body = (
      <div className="hud-row">
        <span className="hud-ind bad">
          <WarnIcon />
        </span>
        <span className="grow hud-title" role="alert">
          {state.message || 'Something went wrong'}
        </span>
        {state.partial.trim() && <CopyButton onCopy={copy} />}
        <button type="button" className="hud-btn" data-a="discard" onClick={() => onDismiss?.()}>
          Dismiss
        </button>
      </div>
    )
  } else {
    body = (
      <div className="hud-row">
        <span className="hud-ind ok">
          <MicIcon />
        </span>
        <span className="grow hud-title" role="status">
          {state.message}
        </span>
      </div>
    )
  }

  const style = { '--mint': settings.accent, '--cue': cueStyle } as CSSProperties
  return (
    <div
      className="hud-screen"
      data-v={anchor.v}
      data-h={settings.style === 'edge' ? 'center' : anchor.h}
      data-skin={settings.style}
      data-preview={preview}
      data-embedded={embedded}
      data-mid={!position.includes('top') && !position.includes('bottom') && position !== 'bottom'}
      data-still={still}
      style={{ '--hud-scale': settings.scale } as CSSProperties}
    >
      <div className="hud-anchor">
        <div
          ref={root}
          className={`hud ${leaving ? 'out' : 'in'}`}
          data-skin={settings.style}
          data-phase={phase}
          data-open={editor}
          data-expand={settings.whileTalking}
          data-cue={cue ?? 'none'}
          data-v={anchor.v}
          style={style}
          onPointerEnter={enter}
          onPointerLeave={leave}
          onPointerDown={(event) => {
            if (event.pointerType !== 'mouse') setPokedAt(Date.now())
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && fix) {
              event.preventDefault()
              setFix(null)
            }
          }}
        >
          {body}
          {fix && editor && (
            <RememberPill
              fix={fix}
              scale={settings.scale}
              preferBelow={settings.style === 'ghost' || anchor.v === 'top'}
              keepAbove={settings.style === 'caption' && anchor.v !== 'top'}
              onChoose={choose}
              onClip={() => setFix({ ...fix, clip: !fix.clip })}
            />
          )}
        </div>
      </div>
    </div>
  )
}
