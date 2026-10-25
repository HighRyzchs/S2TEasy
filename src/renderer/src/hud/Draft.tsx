import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode
} from 'react'
import { extendSelection, type Span, type Token } from './tokens'

type WordListProps = {
  tokens: Token[]
  /** Words are buttons (editor open); otherwise they are plain text. */
  editable?: boolean
  /** Characters currently open for editing: replaced by `field`. */
  editRange?: Span | null
  field?: ReactNode
  /** Words just fixed by the person (while the remember pill is open). */
  marked?: Span | null
  /** Voice memory (beta): words that sound like something you taught it. Clicking one offers the fix. */
  hints?: Span[]
  /** Token index range under the pointer while dragging. */
  selection?: [number, number] | null
  /** In live typing, words after the typed part are still provisional. */
  dimUntyped?: boolean
  /** The newest word gets a small entrance (typewriter, glitch, pop depending on the style). */
  highlightNewest?: boolean
}

const inside = (span: Span | null | undefined, token: Token) =>
  !!span && token.start >= span.start && token.end <= span.end

/** Words, cue chips and the inline edit field, in reading order. Used by the rolling line and the draft. */
export function WordList({
  tokens,
  editable = false,
  editRange = null,
  field,
  marked = null,
  hints = [],
  selection = null,
  dimUntyped = false,
  highlightNewest = false
}: WordListProps) {
  let lastWord = -1
  tokens.forEach((token, index) => {
    if (token.kind === 'word') lastWord = index
  })
  const nodes: ReactNode[] = []
  let fieldPlaced = false
  tokens.forEach((token, index) => {
    if (inside(editRange, token)) {
      if (!fieldPlaced) {
        fieldPlaced = true
        nodes.push(<Fragment key="edit">{field} </Fragment>)
      }
      return
    }
    if (token.kind === 'tag') {
      const cue = token.text.slice(1, -1).trim().toLowerCase()
      nodes.push(
        <Fragment key={`tag-${index}-${token.start}`}>
          <span className="hud-tag" data-cue={cue} title="Speech cue">
            {token.text}
          </span>{' '}
        </Fragment>
      )
      return
    }
    const classes = [
      dimUntyped && !token.typed ? 'prov' : '',
      inside(marked, token) ? 'edited fresh' : '',
      hints.some((hint) => inside(hint, token)) ? 'hint' : '',
      selection && index >= selection[0] && index <= selection[1] ? 'sel' : '',
      highlightNewest && index === lastWord ? 'newest' : ''
    ]
      .filter(Boolean)
      .join(' ')
    nodes.push(
      <Fragment key={token.start}>
        {editable ? (
          <button
            type="button"
            className={`hud-w ${classes}`}
            data-i={index}
            data-start={token.start}
            data-end={token.end}
            title="Click to fix · drag across words for a phrase"
          >
            {token.text}
          </button>
        ) : (
          <span className={`hud-wd ${classes}`} data-start={token.start} data-end={token.end}>
            {token.text}
          </span>
        )}{' '}
      </Fragment>
    )
  })
  return <>{nodes}</>
}

type DraftProps = Omit<WordListProps, 'selection'> & {
  className?: string
  /** Keep the newest words in view. */
  follow: boolean
  onSelect?: (first: number, last: number) => void
  onOpen?: () => void
  empty: string
}

/**
 * The text block. In the editor, press on a word and drag across its neighbours to select a phrase;
 * releasing (or a keyboard Enter on a word) hands the span to `onSelect`.
 */
export function Draft({ className = '', follow, onSelect, onOpen, empty, ...list }: DraftProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<[number, number] | null>(null)
  const dragRef = useRef(drag)
  dragRef.current = drag
  const selectRef = useRef(onSelect)
  selectRef.current = onSelect

  useLayoutEffect(() => {
    const el = ref.current
    if (el && follow && !drag) el.scrollTop = el.scrollHeight
  }, [follow, drag, list.tokens.length])

  // When a press picked words (pointer up), the click that follows is the same press.
  const pickedAt = useRef(0)
  useEffect(() => {
    if (!drag) return
    const release = () => {
      const current = dragRef.current
      setDrag(null)
      if (!current) return
      pickedAt.current = Date.now()
      selectRef.current?.(Math.min(...current), Math.max(...current))
    }
    // A touch or pen the browser takes over (cancel) still ends the selection where it was.
    document.addEventListener('pointerup', release)
    document.addEventListener('pointercancel', release)
    return () => {
      document.removeEventListener('pointerup', release)
      document.removeEventListener('pointercancel', release)
    }
  }, [drag === null])

  const wordIn = (target: EventTarget | null): number | null => {
    const el = (target as HTMLElement | null)?.closest?.('[data-i]')
    return el ? Number(el.getAttribute('data-i')) : null
  }
  const wordAt = (event: { target: EventTarget }): number | null => wordIn(event.target)
  const down = (event: PointerEvent) => {
    const index = wordAt(event)
    if (index === null || !list.editable || list.editRange) return
    event.preventDefault()
    // Touch and pen hold on to the word they pressed; let go so the drag can reach its neighbours.
    const target = event.target as Element
    if (target.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId)
    setDrag([index, index])
  }
  const over = (event: PointerEvent) => {
    if (!dragRef.current) return
    const index = wordIn(document.elementFromPoint(event.clientX, event.clientY))
    if (index === null) return
    const anchor = dragRef.current[0]
    setDrag([anchor, extendSelection(list.tokens, anchor, index)])
  }
  // A press that started between words (or on a word that then moved) and ended on a word: that word.
  const click = (event: MouseEvent) => {
    const index = wordIn(document.elementFromPoint(event.clientX, event.clientY))
    if (index === null || !list.editable || list.editRange || Date.now() - pickedAt.current < 500) return
    onSelect?.(index, index)
  }
  const key = (event: KeyboardEvent) => {
    // Enter on a focused word edits that word alone. Mouse clicks go through the drag path.
    const index = wordAt(event)
    if (event.key === 'Enter' && index !== null && !list.editRange) {
      event.preventDefault()
      onSelect?.(index, index)
    }
  }

  const live = !list.editable
  const interactive = live && onOpen
  const body = list.tokens.length ? (
    <WordList {...list} selection={drag} />
  ) : (
    <span className="hud-empty">{empty}</span>
  )
  return interactive ? (
    <div
      ref={ref}
      className={`hud-draft live ${className}`}
      role="button"
      tabIndex={0}
      aria-label="Your words. Press Enter to edit while you talk."
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen()
      }}
    >
      {body}
    </div>
  ) : (
    <div
      ref={ref}
      className={`hud-draft ${live ? 'live' : ''} ${className}`}
      onPointerDown={down}
      onPointerMove={over}
      onClick={click}
      onKeyDown={key}
    >
      {body}
    </div>
  )
}

type EditFieldProps = {
  initial: string
  /** Gives the overlay keyboard focus, then resolves. */
  focusWindow: () => Promise<void>
  /** The value, or null when cancelled. */
  onDone: (value: string | null) => void
}

/**
 * The inline input over the span being fixed. It stays mounted while new words arrive (keep a stable
 * key), so its text, selection and focus survive re-renders.
 */
export function EditField({ initial, focusWindow, onDone }: EditFieldProps) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  const finish = (result: string | null) => {
    if (done.current) return
    done.current = true
    onDone(result)
  }

  useEffect(() => {
    let live = true
    void focusWindow()
      .catch(() => undefined)
      .then(() => {
        if (!live || !ref.current) return
        ref.current.focus()
        ref.current.select()
      })
    return () => {
      live = false
    }
  }, [])

  return (
    <input
      ref={ref}
      className="hud-edit"
      value={value}
      size={Math.max(3, value.length + 1)}
      aria-label="Fix these words"
      spellCheck={false}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          finish(value)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          finish(null)
        }
      }}
      onBlur={(event) => {
        // Only a real move of focus out of the HUD ends the edit.
        const hud = event.currentTarget.closest('.hud')
        if (event.relatedTarget && hud?.contains(event.relatedTarget as Node)) return
        const input = event.currentTarget
        setTimeout(() => {
          if (ref.current === input && document.activeElement !== input) finish(input.value)
        }, 0)
      }}
    />
  )
}
