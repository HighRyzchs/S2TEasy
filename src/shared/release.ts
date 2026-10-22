import { UPDATE_OWNER, UPDATE_REPO } from './constants'
import { tagToVersion } from './version'
import type { Packaging } from './types'

export function updateReleasesApi(): string {
  return `https://api.github.com/repos/${UPDATE_OWNER}/${UPDATE_REPO}/releases/latest`
}

export function updateReleasesPage(): string {
  return `https://github.com/${UPDATE_OWNER}/${UPDATE_REPO}/releases`
}

/** A 404 can mean a missing release, inaccessible repository, or private repository. */
export function missingLatestReleaseMessage(hasToken: boolean): string {
  return `No accessible latest release was found for ${UPDATE_OWNER}/${UPDATE_REPO}. The repository may have no published releases or may require access.${hasToken ? ' Check the configured token permissions.' : ''}`
}

export type GithubAsset = {
  id: number
  name: string
  size: number
  url: string
  browser_download_url: string
  digest?: string
}

export type GithubRelease = {
  tag_name: string
  prerelease?: boolean
  draft?: boolean
  assets?: GithubAsset[]
}

export type PickedAsset = {
  version: string
  name: string
  size: number
  apiUrl: string
  browserUrl: string
  digest?: string
}

export function pickUpdateAsset(release: GithubRelease, packaging: Packaging): PickedAsset | null {
  if (release.draft || release.prerelease) return null
  const assets = release.assets ?? []
  const exe = assets.filter((asset) => /\.exe$/i.test(asset.name))
  const match =
    packaging === 'installed'
      ? exe.find((asset) => /win-x64\.exe$/i.test(asset.name) && !/portable/i.test(asset.name)) ||
        exe.find((asset) => !/portable/i.test(asset.name))
      : exe.find((asset) => /portable\.exe$/i.test(asset.name)) ||
        exe.find((asset) => /portable/i.test(asset.name))
  if (!match || !/^[A-Za-z0-9._-]+\.exe$/i.test(match.name)) return null
  try {
    const browser = new URL(match.browser_download_url),
      api = new URL(match.url)
    if (
      browser.protocol !== 'https:' ||
      browser.hostname !== 'github.com' ||
      api.protocol !== 'https:' ||
      api.hostname !== 'api.github.com'
    )
      return null
  } catch {
    return null
  }
  return {
    version: tagToVersion(release.tag_name),
    name: match.name,
    size: match.size,
    apiUrl: match.url,
    browserUrl: match.browser_download_url,
    digest: match.digest
  }
}

export function githubHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'S2Teasy'
  }
  if (token.trim()) headers.Authorization = `Bearer ${token.trim()}`
  return headers
}

export function downloadHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/octet-stream',
    'User-Agent': 'S2Teasy'
  }
  if (token.trim()) headers.Authorization = `Bearer ${token.trim()}`
  return headers
}

export function downloadUrl(asset: PickedAsset, token: string): string {
  return token.trim() ? asset.apiUrl : asset.browserUrl
}
