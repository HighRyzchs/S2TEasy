import { describe, expect, it } from 'vitest'
import { startError } from './engine'
import { defaultSettings } from './types'

describe('startError', () => {
  it('requires a streaming key for router.audio', () => {
    expect(startError(defaultSettings())).toMatch(/router\.audio/)
    expect(startError({ ...defaultSettings(), apiKey: 'sk-or-v1-test' })).toMatch(
      /streaming provider key/
    )
    expect(startError({ ...defaultSettings(), routerAudioKey: 'provider-key' })).toBeNull()
  })

  it('requires OpenRouter credentials in batch mode', () => {
    expect(startError({ ...defaultSettings(), sttEngine: 'openrouter' })).toMatch(/OpenRouter/)
    expect(
      startError({
        ...defaultSettings(),
        sttEngine: 'openrouter',
        apiKey: 'sk-or-v1-test',
        model: ''
      })
    ).toMatch(/model/)
  })
})
