import { expect, it } from 'vitest'
import { defaultOverlayTheme } from './overlay-theme'
import { overlayTemplate, readOverlayTemplate } from './overlay-template'
it('round-trips styling without accepting arbitrary URLs, markup, fonts or executable settings', () => {
  const theme = { ...defaultOverlayTheme(), font: 'mono' as const }
  expect(readOverlayTemplate(overlayTemplate(theme))).toEqual(theme)
  const malicious = JSON.stringify({
    format: 's2teasy-overlay',
    version: 1,
    apiKey: 'secret',
    theme: {
      ...theme,
      font: 'url(evil)',
      assetDataUrl: 'data:image/svg+xml;base64,AAAA',
      script: 'evil()'
    }
  })
  const imported = readOverlayTemplate(malicious)
  expect(imported.font).toBe('outfit')
  expect(imported.assetDataUrl).toBe('')
  expect(JSON.stringify(imported)).not.toContain('secret')
  expect(JSON.stringify(imported)).not.toContain('evil')
  expect(() => readOverlayTemplate('{"version":2}')).toThrow()
  expect(() => readOverlayTemplate(' '.repeat(2_100_001))).toThrow(/too large/)
})
