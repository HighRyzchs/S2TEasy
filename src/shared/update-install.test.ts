import { describe, expect, it } from 'vitest'
import { buildVerifiedApplyScript, updateTargetPath } from './update-install'
const options = {
  kind: 'portable' as const,
  currentExe: "C:\\My apps\\Pat's 100% & notes\\S2Teasy.exe",
  payloadPath: 'C:\\Temp\\new.exe',
  pid: 42,
  expectedSha256: 'a'.repeat(64),
  receiptPath: 'C:\\Data\\update-result.json',
  fromVersion: '1.4.1',
  toVersion: '1.5.0'
}
describe('persistent Windows updates', () => {
  it('targets the original portable launcher instead of the extracted app', () => {
    expect(
      updateTargetPath('portable', 'C:\\Temp\\extracted\\S2Teasy.exe', {
        PORTABLE_EXECUTABLE_FILE: 'D:\\Apps\\S2Teasy.exe'
      })
    ).toBe('D:\\Apps\\S2Teasy.exe')
    expect(() => updateTargetPath('portable', 'C:\\Temp\\extracted.exe', {})).toThrow(/manually/)
    expect(updateTargetPath('installed', 'C:\\Programs\\S2Teasy.exe', {})).toBe(
      'C:\\Programs\\S2Teasy.exe'
    )
  })
  it('quotes literal paths and verifies again before copying, retaining a rollback copy', () => {
    const script = buildVerifiedApplyScript(options)
    expect(script).toContain("'C:\\My apps\\Pat''s 100% & notes\\S2Teasy.exe'")
    expect(script.indexOf('Get-FileHash -LiteralPath $payload')).toBeLessThan(
      script.indexOf('Copy-Item -LiteralPath $target')
    )
    expect(script).toContain("$backup = $target + '.previous'")
    expect(script).toContain('Copy-Item -LiteralPath $backup -Destination $target')
    expect(script).toContain('Wait-Process -Timeout 120')
    expect(script).toContain("Write-Receipt 'applied'")
    expect(script).toContain("Write-Receipt 'failed'")
  })
  it('waits for the installed-app upgrade and checks its result before restart', () => {
    const script = buildVerifiedApplyScript({ ...options, kind: 'installed' })
    expect(script).toContain("@('/S', '--updated', ('/D=' + $installDirectory))")
    expect(script).toContain('WaitForExit(180000)')
    expect(script).toContain('$installer.ExitCode')
    expect(script).toContain('FileVersionInfo')
    expect(script.indexOf('$installedVersion -ne $wanted')).toBeLessThan(
      script.indexOf("Write-Receipt 'applied'")
    )
    expect(script).not.toContain('Copy-Item -LiteralPath $target')
  })
  it('acknowledges verified startup and checks cancellation before modifying the app', () => {
    const script = buildVerifiedApplyScript({
      ...options,
      attemptId: 'new-attempt',
      cancelPath: 'C:\\Data\\cancelled'
    })
    expect(script.indexOf("Write-Receipt 'waiting'")).toBeLessThan(
      script.indexOf('Wait-Process -Timeout 120')
    )
    expect(script.indexOf('Test-Path -LiteralPath $cancel')).toBeLessThan(
      script.indexOf('Copy-Item -LiteralPath $target')
    )
    expect(script).toContain("attemptId = 'new-attempt'")
  })
  it('refuses unverifiable helper inputs', () => {
    expect(() => buildVerifiedApplyScript({ ...options, expectedSha256: '' })).toThrow()
  })
})
