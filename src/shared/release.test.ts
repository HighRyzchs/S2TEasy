import { describe, expect, it } from 'vitest'
import {
  buildApplyScript,
  missingLatestReleaseMessage,
  pickUpdateAsset,
  type GithubRelease
} from './release'

const release: GithubRelease = {
  tag_name: 'v1.2.0',
  assets: [
    {
      id: 11,
      name: 'S2Teasy-1.2.0-portable.exe',
      size: 80,
      url: 'https://api.github.com/repos/roshan63/S2Teasy/releases/assets/11',
      browser_download_url:
        'https://github.com/roshan63/S2Teasy/releases/download/v1.2.0/S2Teasy-1.2.0-portable.exe'
    },
    {
      id: 12,
      name: 'S2Teasy-1.2.0-win-x64.exe',
      size: 90,
      url: 'https://api.github.com/repos/roshan63/S2Teasy/releases/assets/12',
      browser_download_url:
        'https://github.com/roshan63/S2Teasy/releases/download/v1.2.0/S2Teasy-1.2.0-win-x64.exe'
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

describe('buildApplyScript', () => {
  it('copies over a portable exe after the process exits', () => {
    const script = buildApplyScript({
      kind: 'portable',
      currentExe: 'C:\\Apps\\S2Teasy.exe',
      payloadPath: 'C:\\Temp\\S2Teasy-new.exe',
      pid: 4242
    })
    expect(script).toContain('copy /Y "C:\\Temp\\S2Teasy-new.exe" "C:\\Apps\\S2Teasy.exe"')
    expect(script).toContain('PID eq 4242')
    expect(script).not.toContain('/S')
  })

  it('runs the NSIS installer silently for installed builds', () => {
    const script = buildApplyScript({
      kind: 'installed',
      currentExe: 'C:\\Users\\me\\AppData\\Local\\Programs\\s2teasy\\S2Teasy.exe',
      payloadPath: 'C:\\Temp\\S2Teasy-setup.exe',
      pid: 99
    })
    expect(script).toContain('"C:\\Temp\\S2Teasy-setup.exe" /S')
    expect(script).toContain(
      'start "" "C:\\Users\\me\\AppData\\Local\\Programs\\s2teasy\\S2Teasy.exe"'
    )
  })
})
