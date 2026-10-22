import { describe, expect, it } from 'vitest'
import { missingLatestReleaseMessage, pickUpdateAsset, type GithubRelease } from './release'

const release: GithubRelease = {
  tag_name: 'v1.2.0',
  assets: [
    {
      id: 11,
      name: 'S2Teasy-1.2.0-portable.exe',
      size: 80,
      url: 'https://api.github.com/repos/HighRyzchs/S2TEasy/releases/assets/11',
      browser_download_url:
        'https://github.com/HighRyzchs/S2TEasy/releases/download/v1.2.0/S2Teasy-1.2.0-portable.exe'
    },
    {
      id: 12,
      name: 'S2Teasy-1.2.0-win-x64.exe',
      size: 90,
      url: 'https://api.github.com/repos/HighRyzchs/S2TEasy/releases/assets/12',
      browser_download_url:
        'https://github.com/HighRyzchs/S2TEasy/releases/download/v1.2.0/S2Teasy-1.2.0-win-x64.exe'
    }
  ]
}

describe('missingLatestReleaseMessage', () => {
  it('does not infer a private repository from a 404', () => {
    expect(missingLatestReleaseMessage(false)).toMatch(/no published releases|no accessible/i)
    expect(missingLatestReleaseMessage(false)).not.toMatch(/repo is private/)
  })
  it('mentions permissions when a token was configured', () => {
    expect(missingLatestReleaseMessage(true)).toMatch(/token permissions/i)
  })
})

describe('pickUpdateAsset', () => {
  it('selects the portable exe for portable builds', () => {
    expect(pickUpdateAsset(release, 'portable')?.name).toBe('S2Teasy-1.2.0-portable.exe')
  })

  it('selects the NSIS installer for installed builds', () => {
    expect(pickUpdateAsset(release, 'installed')?.name).toBe('S2Teasy-1.2.0-win-x64.exe')
  })

  it('skips drafts', () => {
    expect(pickUpdateAsset({ ...release, draft: true }, 'portable')).toBeNull()
  })
})
