export type Box = { left: number; top: number; width: number; height: number }

export type PillPlacement = { left: number; top: number; arrow: number; below: boolean }

/**
 * Places the one-line "remember" pill over (or under) a word. All numbers are in the HUD's own
 * pixels, relative to its top-left corner. The pill stays inside the HUD's width and the arrow
 * keeps pointing at the middle of the word.
 */
export function placePill(input: {
  hudWidth: number
  word: Box
  pill: { width: number; height: number }
  /** Words on the draft's first line open the pill downward so it never covers the header. */
  below: boolean
  gap?: number
}): PillPlacement {
  const { hudWidth, word, pill, below } = input
  const gap = input.gap ?? 8
  const center = word.left + word.width / 2
  const left = Math.max(4, Math.min(hudWidth - pill.width - 4, center - pill.width / 2))
  const top = below ? word.top + word.height + gap : word.top - pill.height - gap
  return { left, top, arrow: center - left, below }
}

/** Whether a word sits on the first line of its text block (within one line height of the top). */
export function onFirstLine(wordTop: number, blockTop: number, lineHeight: number): boolean {
  return wordTop - blockTop < lineHeight
}

/** Smallest box holding all the given boxes. */
export function unionBox(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null
  const left = Math.min(...boxes.map((b) => b.left))
  const top = Math.min(...boxes.map((b) => b.top))
  const right = Math.max(...boxes.map((b) => b.left + b.width))
  const bottom = Math.max(...boxes.map((b) => b.top + b.height))
  return { left, top, width: right - left, height: bottom - top }
}

/** Squeezes the waveform into `count` bars by averaging neighbours. */
export function downsample(values: number[], count: number): number[] {
  if (values.length === 0) return new Array<number>(count).fill(0)
  return Array.from({ length: count }, (_, i) => {
    const from = Math.floor((i * values.length) / count)
    const to = Math.max(from + 1, Math.floor(((i + 1) * values.length) / count))
    let sum = 0
    for (let j = from; j < to; j += 1) sum += values[j] ?? 0
    return sum / (to - from)
  })
}

export type Anchor = { v: 'top' | 'bottom'; h: 'left' | 'center' | 'right' }

/** Positions containing "top" grow downward from the top edge; the rest grow upward from the bottom. */
export function anchorOf(position: string): Anchor {
  return {
    v: position.includes('top') ? 'top' : 'bottom',
    h: position.includes('left') ? 'left' : position.includes('right') ? 'right' : 'center'
  }
}
