import { heardForms, type VocabularyEntry, type VocabularyHit } from './vocabulary'

/**
 * An accent swap ("bike" → "bite") is right most of the time but not always. After a session, each
 * place the swapped word appears becomes a slot with exactly two choices: keep it, or put back what
 * was heard. A model may only pick between those two, so the check can never add or reword text.
 */
export type AccentSlot = {
  slot: number
  start: number
  end: number
  /** The word now in the text. */
  kept: string
  /** What the engine heard before the swap. */
  heard: string
  entryId: string
}

export const MAX_SLOTS = 20
export const MAX_CONTEXT_CHARS = 4000

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Slots for the accent entries this session actually swapped. Empty when there is nothing to check. */
export function accentSlots(text: string, entries: VocabularyEntry[], hits: VocabularyHit[]): AccentSlot[] {
  if (!text || text.length > MAX_CONTEXT_CHARS) return []
  const swapped = new Map<string, VocabularyHit>()
  for (const hit of hits) if (!swapped.has(hit.entryId)) swapped.set(hit.entryId, hit)
  const accents = entries.filter((entry) => entry.enabled && entry.kind === 'accent' && swapped.has(entry.id))
  const slots: AccentSlot[] = []
  for (const entry of accents) {
    const heard = (swapped.get(entry.id)!.from || heardForms(entry)[0] || '').toLocaleLowerCase()
    if (!heard || heard.toLocaleLowerCase() === entry.meant.toLocaleLowerCase()) continue
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escape(entry.meant)}(?![\\p{L}\\p{N}_])`, 'giu')
    for (const match of text.matchAll(pattern)) {
      slots.push({ slot: 0, start: match.index, end: match.index + match[0].length, kept: match[0], heard, entryId: entry.id })
    }
  }
  return slots
    .sort((a, b) => a.start - b.start)
    .slice(0, MAX_SLOTS)
    .map((slot, i) => ({ ...slot, slot: i + 1 }))
}

/** The text the model reads: every slot marked as ⟦n: kept | heard⟧, nothing else changed. */
export function markedText(text: string, slots: AccentSlot[]): string {
  let out = ''
  let at = 0
  for (const slot of slots) {
    out += `${text.slice(at, slot.start)}⟦${slot.slot}: ${slot.kept} | ${slot.heard}⟧`
    at = slot.end
  }
  return out + text.slice(at)
}

/** Put back the heard word in each slot the model chose it for. Unknown or malformed answers keep the text. */
export function applyAccentChoices(
  text: string,
  slots: AccentSlot[],
  choices: unknown
): { text: string; reverted: AccentSlot[] } {
  const pick = new Map<number, string>()
  if (Array.isArray(choices))
    for (const row of choices as { slot?: unknown; word?: unknown }[])
      if (row && Number.isInteger(row.slot) && typeof row.word === 'string') pick.set(row.slot as number, row.word)
  const reverted = slots.filter((slot) => {
    const word = pick.get(slot.slot)
    return word !== undefined && word.trim().toLocaleLowerCase() === slot.heard.toLocaleLowerCase()
  })
  let out = text
  for (const slot of [...reverted].reverse()) out = out.slice(0, slot.start) + matchCase(slot.heard, slot.kept) + out.slice(slot.end)
  return { text: out, reverted }
}

/** "Bite" → "Bike", "bite" → "bike": keep the capital the text already had. */
function matchCase(word: string, like: string): string {
  const first = like.charAt(0)
  return first && first === first.toLocaleUpperCase() && first !== first.toLocaleLowerCase()
    ? word.charAt(0).toLocaleUpperCase() + word.slice(1)
    : word
}
