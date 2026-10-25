/** The Settings page is one scroll of cards; these ids are the stable targets other screens link to. */
export const SECTIONS = [
  { id: 'engine', label: 'Speech engine' },
  { id: 'mic', label: 'Microphone' },
  { id: 'shortcut', label: 'Shortcut' },
  { id: 'tidy', label: 'Speech tidy' },
  { id: 'privacy', label: 'Privacy & data' },
  { id: 'app', label: 'App & updates' }
] as const

export type SectionId = (typeof SECTIONS)[number]['id']

/** A navigation target such as `{ section: 'mic' }` becomes a known section id, or nothing. */
export function resolveSection(value: string | undefined): SectionId | undefined {
  return SECTIONS.find((section) => section.id === value)?.id
}

/**
 * Which section the reader is in: the last one whose top edge has reached `threshold`
 * (distance from the top of the scroll area). At the very bottom the last card is active,
 * since a short last card may never reach the threshold. Falls back to the first section.
 */
export function activeSection(
  tops: Record<SectionId, number>,
  options: { threshold?: number; atEnd?: boolean } = {}
): SectionId {
  if (options.atEnd) return SECTIONS[SECTIONS.length - 1].id
  const threshold = options.threshold ?? 96
  let current: SectionId = SECTIONS[0].id
  for (const { id } of SECTIONS) if (tops[id] <= threshold) current = id
  return current
}
