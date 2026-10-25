import { useEffect, useMemo, useRef, useState } from 'react'
import { defaultTidySettings, tidySpeech } from '@shared/tidy'
import { defaultSettings, type OverlayState } from '@shared/types'
import type { HudApi } from './types'
import { replaceRange } from './tokens'

export type PreviewMode = 'listening' | 'open' | 'paused' | 'success'

const SENTENCE =
  '[calm] Yeah, I just talked to Ryzchs about the stream tonight. [excited] He wants to demo the new S2Teasy overlay live.'
const WORD_MS = 230
const SETTLE_MS = 700
const IDLE_MS = 7000

/**
 * A simulated dictation session for the browser preview: words arrive one by one, live typing
 * settles them, and Pause / Done / edits work locally. No IPC.
 */
export function usePreviewSession(mode: PreviewMode, cues: boolean) {
  const complete = mode === 'paused' || mode === 'success'
  const [state, setState] = useState<OverlayState>(() => ({
    status: mode === 'paused' ? 'paused' : mode === 'success' ? 'success' : 'listening',
    partial: complete ? SENTENCE : '',
    typedLength: complete ? SENTENCE.length : 0,
    message: mode === 'success' ? 'Saved' : 'Listening',
    rms: 0.08,
    elapsedMs: 0,
    bars: [],
    cues,
    sessionId: 'preview',
    finishAt: mode === 'paused' ? Date.now() + 6500 : undefined
  }))
  const held = useRef(false)
  const latest = useRef(state)
  latest.current = state
  const update = (change: (s: OverlayState) => OverlayState) => {
    latest.current = change(latest.current)
    setState(latest.current)
  }
  const updateRef = useRef(update)
  updateRef.current = update

  useEffect(() => {
    const words = SENTENCE.split(' ')
    let spoken = complete ? words.length : 0
    let lastWord = 0
    const added: { end: number; at: number }[] = []
    const timer = window.setInterval(() => {
      const now = Date.now()
      updateRef.current((s) => {
        let out: OverlayState = { ...s, rms: 0.07 + 0.03 * Math.sin(now / 420) }
        if (s.status === 'listening' && spoken < words.length && now - lastWord >= WORD_MS) {
          const partial = s.partial ? `${s.partial} ${words[spoken]}` : words[spoken]
          spoken += 1
          lastWord = now
          added.push({ end: partial.length, at: now })
          out = { ...out, partial }
        }
        // Words settle into the target app a moment after they are said.
        const settled = added.filter((w) => now - w.at >= SETTLE_MS).pop()
        if (settled && !complete) {
          out = { ...out, typedLength: Math.min(settled.end, out.partial.length) }
        }
        if (s.status === 'paused') {
          if (held.current) out = { ...out, finishAt: undefined }
          else if (s.finishAt === undefined) out = { ...out, finishAt: now + 4000 }
          else if (s.finishAt <= now) out = { ...out, status: 'success', message: 'Saved' }
        }
        return out
      })
    }, 100)
    return () => window.clearInterval(timer)
  }, [complete])

  const api = useMemo<HudApi>(
    () => ({
      hudEdit: async (_id, start, end, text) => {
        updateRef.current((s) => ({ ...s, partial: replaceRange(s.partial, { start, end }, text) }))
        return 'typed'
      },
      hudTidy: async () => {
        updateRef.current((s) => ({ ...s, partial: tidySpeech(s.partial, defaultTidySettings()).text }))
        return 'typed'
      },
      hudPause: async () =>
        updateRef.current((s) =>
          s.status === 'listening'
            ? { ...s, status: 'paused', finishAt: Date.now() + IDLE_MS }
            : { ...s, status: 'listening', finishAt: undefined }
        ),
      hudFinish: async () => updateRef.current((s) => ({ ...s, status: 'success', message: 'Saved' })),
      hudHold: (value) => {
        held.current = value
      },
      hudCues: async (on) => updateRef.current((s) => ({ ...s, cues: on })),
      hudFocus: async () => undefined,
      hudPointer: () => undefined,
      hudArea: () => undefined,
      learnWord: async () => defaultSettings(),
      copyHistory: async (text) => {
        try {
          await navigator.clipboard.writeText(text)
        } catch {
          // Clipboard access is blocked in some previews; the check mark still shows.
        }
        return true
      },
      cancelRecording: async () =>
        updateRef.current((s) => ({ ...s, status: 'success', message: 'Discarded' }))
    }),
    []
  )

  return { state, api }
}
