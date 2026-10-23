import { expect, it } from 'vitest'
import { captureFromSettings, normalizeDisplayName, normalizeSettings } from './types'
it('normalizes optional Unicode nicknames and removes invisible direction/control characters', () => {
  expect(normalizeDisplayName('  Zoë\n @studio  ')).toBe('Zoë @studio')
  expect(normalizeDisplayName('e\u0301')).toBe('é')
  expect(normalizeDisplayName('hi\u202E\u0000there')).toBe('hithere')
  expect(normalizeDisplayName('🧑‍💻')).toBe('🧑‍💻')
  expect(normalizeDisplayName(null)).toBe('')
  expect(normalizeDisplayName('🦊'.repeat(70))).toBe('🦊'.repeat(60))
})
it('migrates an existing profile to an optional tour without changing speech settings or retaining more audio', () => {
  const settings = normalizeSettings({
    sttEngine: 'openrouter',
    apiKey: 'existing-key',
    model: 'speech/model',
    recoveryAudio: false,
    keepAudioForTraining: true
  })
  expect(settings).toMatchObject({
    displayName: '',
    welcomeCompleted: false,
    setupChecklistDismissed: false,
    sttEngine: 'openrouter',
    apiKey: 'existing-key',
    model: 'speech/model',
    recoveryAudio: false,
    keepAudioForTraining: true
  })
  expect(
    normalizeSettings({
      ...settings,
      displayName: '  @studio ',
      welcomeCompleted: true,
      setupChecklistDismissed: true
    })
  ).toMatchObject({ displayName: '@studio', welcomeCompleted: true, setupChecklistDismissed: true })
  expect(normalizeSettings({ welcomeCompleted: 'yes' as never }).welcomeCompleted).toBe(false)
})
it('keeps the personal name out of the recorder configuration', () => {
  const capture = captureFromSettings(
    normalizeSettings({ displayName: 'Private Nickname', welcomeCompleted: true })
  )
  expect(JSON.stringify(capture)).not.toContain('Private Nickname')
  expect(capture).not.toHaveProperty('displayName')
})
