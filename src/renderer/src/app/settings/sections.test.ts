import { expect, it } from 'vitest'
import { SECTIONS, activeSection, resolveSection, type SectionId } from './sections'

const tops = (values: Partial<Record<SectionId, number>>) =>
  Object.fromEntries(SECTIONS.map(({ id }, i) => [id, values[id] ?? 400 + i * 300])) as Record<
    SectionId,
    number
  >

it('keeps the section ids other screens link to', () => {
  expect(SECTIONS.map((s) => s.id)).toEqual(['engine', 'mic', 'shortcut', 'tidy', 'privacy', 'app'])
})

it('resolves a navigation target to a known section only', () => {
  expect(resolveSection('mic')).toBe('mic')
  expect(resolveSection('engine')).toBe('engine')
  expect(resolveSection('nope')).toBeUndefined()
  expect(resolveSection(undefined)).toBeUndefined()
})

it('picks the last section whose top has reached the threshold', () => {
  expect(activeSection(tops({ engine: 10 }))).toBe('engine')
  expect(activeSection(tops({ engine: -500, mic: 40 }))).toBe('mic')
  expect(activeSection(tops({ engine: -900, mic: -600, shortcut: 300 }))).toBe('mic')
})

it('falls back to the first section and to the last at the bottom of the page', () => {
  expect(activeSection(tops({ engine: 300 }))).toBe('engine')
  expect(activeSection(tops({ engine: 0 }), { atEnd: true })).toBe('app')
})
