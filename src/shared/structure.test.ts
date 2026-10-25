import { describe, expect, it } from 'vitest'
import { applyCommands, defaultStructureSettings, normalizeStructure, renderNext, renderStructure } from './structure'

const on = defaultStructureSettings()
const run = (text: string) => renderStructure(applyCommands(text, on).text)

describe('voice commands', () => {
  it('turns a command said on its own into structure', () => {
    expect(run('That was the intro. New paragraph. Now the main point.')).toBe('That was the intro. \n\nNow the main point.')
    expect(run('Roses are red, new line, violets are blue')).toBe('Roses are red, \nviolets are blue')
    expect(run('First verse ends here. New stanza. Second verse.')).toBe('First verse ends here. \n\nSecond verse.')
    expect(run('Shopping list. Bullet point milk. Bullet point eggs.')).toBe('Shopping list. \n- milk. \n- eggs.')
  })
  it('numbers points and starts again after a paragraph', () => {
    expect(run('Steps. Next number open it. Next number close it. New paragraph. Next number again.')).toBe(
      'Steps. \n1. open it. \n2. close it. \n\n1. again.'
    )
  })
  it('leaves the words alone inside a sentence', () => {
    expect(run('I started a new paragraph today.')).toBe('I started a new paragraph today.')
    expect(run('Write it on a new line please')).toBe('Write it on a new line please')
    expect(run('I wrote. New paragraph is hard to start')).toBe('I wrote. New paragraph is hard to start')
  })
  it('works at the start of a take and back to back', () => {
    expect(run('New paragraph. So here we go')).toBe('\n\nSo here we go')
    expect(run('Done. New paragraph new paragraph. Next.')).toBe('Done. \n\n\n\nNext.')
  })
  it('is off when switched off', () => {
    expect(applyCommands('New paragraph. Hi', { ...on, enabled: false }).text).toBe('New paragraph. Hi')
  })
  it('uses your own phrases', () => {
    const mine = normalizeStructure({ enabled: true, phrases: { ...on.phrases, paragraph: ['break it here'] } })
    expect(renderStructure(applyCommands('Okay. Break it here. Next part', mine).text)).toBe('Okay. \n\nNext part')
    expect(normalizeStructure({ phrases: { line: ['line'] } }).phrases.line).toEqual([])
  })
  it('renders the same in pieces as in one go', () => {
    const whole = 'Steps. № open it. № close it. ¶ Done '
    const pieces = ['Steps. ', '№ open it. ', '№ close it. ', '¶ ', 'Done ']
    let before = ''
    let typed = ''
    for (const piece of pieces) {
      typed += renderNext(before, piece)
      before += piece
    }
    expect(typed).toBe(renderStructure(whole))
  })
})
