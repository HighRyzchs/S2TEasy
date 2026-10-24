export function parseVersion(input: string): [number, number, number] {
  const cleaned = input.trim().replace(/^v/i, '').split(/[-+]/)[0] ?? '0'
  const parts = cleaned.split('.').map((part) => {
    const n = Number.parseInt(part, 10)
    return Number.isFinite(n) ? n : 0
  })
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

/** @returns 1 if a > b, -1 if a < b, 0 if equal */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return 1
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return -1
  }
  // A pre-release comes before its release: 1.10.0-beta.1 < 1.10.0, and beta.2 > beta.1.
  const ra = prerelease(a)
  const rb = prerelease(b)
  if (ra === rb) return 0
  if (!ra) return 1
  if (!rb) return -1
  return ra.localeCompare(rb, 'en', { numeric: true }) > 0 ? 1 : -1
}

function prerelease(version: string): string {
  return version.trim().replace(/^v/i, '').split('+')[0]?.split('-').slice(1).join('-') ?? ''
}

export function isNewerVersion(remote: string, current: string): boolean {
  return compareVersions(remote, current) > 0
}

export function tagToVersion(tag: string): string {
  return tag.trim().replace(/^v/i, '')
}
