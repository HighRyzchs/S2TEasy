import { describe, expect, it } from 'vitest'
import { appFromPath, appKey, cuesForApp } from './apps'

describe('app names', () => {
  it('uses friendly names for common programs and the file name otherwise', () => {
    expect(appFromPath('C:\\Users\\me\\AppData\\Local\\Discord\\app-1.0\\Discord.exe')?.name).toBe('Discord')
    expect(appFromPath('C:\\Program Files\\Microsoft VS Code\\Code.exe')?.name).toBe('VS Code')
    expect(appFromPath('D:\\tools\\my_writer-app.exe')?.name).toBe('My Writer App')
    expect(appFromPath('')).toBeUndefined()
    expect(appFromPath(null)).toBeUndefined()
  })
})

describe('cuesForApp', () => {
  const discord = { exe: 'C:\\Users\\me\\AppData\\Local\\Discord\\Discord.exe' }
  it('lets a per-app rule override the global switch', () => {
    expect(appKey(discord)).toBe('discord')
    expect(cuesForApp({ discord: true }, discord, false)).toBe(true)
    expect(cuesForApp({ discord: false }, discord, true)).toBe(false)
    expect(cuesForApp({ slack: false }, discord, true)).toBe(true)
    expect(cuesForApp({ discord: false }, undefined, true)).toBe(true)
  })
})
