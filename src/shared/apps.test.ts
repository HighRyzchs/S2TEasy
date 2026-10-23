import { describe, expect, it } from 'vitest'
import { appFromPath } from './apps'

describe('app names', () => {
  it('uses friendly names for common programs and the file name otherwise', () => {
    expect(appFromPath('C:\\Users\\me\\AppData\\Local\\Discord\\app-1.0\\Discord.exe')?.name).toBe('Discord')
    expect(appFromPath('C:\\Program Files\\Microsoft VS Code\\Code.exe')?.name).toBe('VS Code')
    expect(appFromPath('D:\\tools\\my_writer-app.exe')?.name).toBe('My Writer App')
    expect(appFromPath('')).toBeUndefined()
    expect(appFromPath(null)).toBeUndefined()
  })
})
