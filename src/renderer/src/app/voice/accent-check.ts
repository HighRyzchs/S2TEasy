import type { HistoryItem } from '@shared/types'
import { heardForms, type VocabularyEntry } from '@shared/vocabulary'

/** Short sentences built around sounds accents commonly blur: th/s/t, v/b/w, l/r, i/ee, short vowels. */
export const ACCENT_SENTENCES = [
  'I think the third ship sails at three.',
  'Leave the van by the very best berry bush.',
  'Turn the light on the right road.',
  'Grab a quick bite before you ride the bike.',
  'The vet said the wet bed was fine.',
  'Sit in the seat and fill the full cup.'
] as const

/** A word the engine heard as something else: what you said, and what came out. */
export type Swap = { meant: string; heard: string }

const words = (text: string) =>
  text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}'’\s-]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)

/**
 * Line up the sentence with what was heard (longest common run of words) and return the places
 * where one or two of your words came out as one or two other words. Missing or extra words are
 * not accent swaps and are left out.
 */
export function wordSwaps(target: string, heard: string): Swap[] {
  const a = words(target)
  const b = words(heard)
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const swaps: Swap[] = []
  let i = 0
  let j = 0
  let gapA: string[] = []
  let gapB: string[] = []
  const flush = () => {
    if (gapA.length && gapB.length && gapA.length <= 2 && gapB.length <= 2)
      swaps.push({ meant: gapA.join(' '), heard: gapB.join(' ') })
    gapA = []
    gapB = []
  }
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      flush()
      i++
      j++
    } else if (j < b.length && (i === a.length || lcs[i][j + 1] >= lcs[i + 1][j])) gapB.push(b[j++])
    else gapA.push(a[i++])
  }
  flush()
  return swaps
}

export type SentenceResult = {
  sentence: string
  /** Latest take of this sentence, if any. */
  take?: { id: string; heard: string }
  swaps: (Swap & { saved: boolean })[]
}

/** The newest take of each sentence and the swaps in it, marking those already saved as words. */
export function accentResults(history: HistoryItem[], entries: VocabularyEntry[]): SentenceResult[] {
  return ACCENT_SENTENCES.map((sentence) => {
    const latest = history
      .filter((h) => h.source === 'practice' && h.status === 'complete' && h.practiceTarget === sentence)
      .sort((x, y) => y.createdAt - x.createdAt)[0]
    if (!latest) return { sentence, swaps: [] }
    const heard = (latest.rawText ?? '').trim()
    return {
      sentence,
      take: { id: latest.id, heard },
      swaps: wordSwaps(sentence, heard).map((swap) => ({
        ...swap,
        saved: entries.some(
          (e) =>
            e.enabled &&
            e.meant.toLocaleLowerCase() === swap.meant &&
            heardForms(e).some((form) => form.toLocaleLowerCase() === swap.heard)
        )
      }))
    }
  })
}
