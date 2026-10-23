import { describe, expect, it } from 'vitest'
import { anchorOf, downsample, onFirstLine, placePill, unionBox } from './geometry'
import { countdownFraction, finishLabel, hpColor, stepped } from './timer'

describe('placePill', () => {
  const pill = { width: 200, height: 30 }

  it('centers over the word with the arrow on its middle', () => {
    const p = placePill({
      hudWidth: 600,
      word: { left: 300, top: 100, width: 60, height: 20 },
      pill,
      below: false
    })
    expect(p).toEqual({ left: 230, top: 62, arrow: 100, below: false })
  })

  it('opens below the word when asked', () => {
    const p = placePill({
      hudWidth: 600,
      word: { left: 300, top: 100, width: 60, height: 20 },
      pill,
      below: true
    })
    expect(p.top).toBe(128)
    expect(p.below).toBe(true)
  })

  it('stays inside the HUD and keeps the arrow on the word', () => {
    const left = placePill({
      hudWidth: 600,
      word: { left: 0, top: 50, width: 40, height: 20 },
      pill,
      below: false
    })
    expect(left.left).toBe(4)
    expect(left.arrow).toBe(16)
    const right = placePill({
      hudWidth: 600,
      word: { left: 560, top: 50, width: 40, height: 20 },
      pill,
      below: false
    })
    expect(right.left).toBe(396)
    expect(right.arrow).toBe(184)
  })
})

describe('layout helpers', () => {
  it('knows the first line', () => {
    expect(onFirstLine(10, 8, 20)).toBe(true)
    expect(onFirstLine(40, 8, 20)).toBe(false)
  })

  it('unions boxes', () => {
    expect(
      unionBox([
        { left: 10, top: 5, width: 20, height: 10 },
        { left: 40, top: 8, width: 10, height: 20 }
      ])
    ).toEqual({ left: 10, top: 5, width: 40, height: 23 })
    expect(unionBox([])).toBeNull()
  })

  it('downsamples by averaging', () => {
    expect(downsample([1, 1, 0, 0], 2)).toEqual([1, 0])
    expect(downsample([0.5], 3)).toEqual([0.5, 0.5, 0.5])
    expect(downsample([], 2)).toEqual([0, 0])
  })
})

describe('countdown', () => {
  it('is the share of time left, clamped', () => {
    expect(countdownFraction(7000, 0, 7000)).toBe(1)
    expect(countdownFraction(3500, 0, 7000)).toBe(0.5)
    expect(countdownFraction(1000, 2000, 7000)).toBe(0)
    expect(countdownFraction(9000, 0, 7000)).toBe(1)
    expect(countdownFraction(1, 0, 0)).toBe(0)
  })

  it('drains the 8-bit bar in steps', () => {
    expect(stepped(1)).toBe(1)
    expect(stepped(0.51)).toBeCloseTo(7 / 12)
    expect(stepped(0)).toBe(0)
  })

  it('colors the HP bar by what is left', () => {
    expect(hpColor(0.9)).toBe('#38b848')
    expect(hpColor(0.4)).toBe('#f8c800')
    expect(hpColor(0.1)).toBe('#e83030')
  })

  it('says when it is held or when it finishes', () => {
    expect(finishLabel(undefined, 0)).toBe("On hold while you're here")
    expect(finishLabel(4200, 0)).toBe('Finishes in 5s')
    expect(finishLabel(100, 500)).toBe('Finishes in 0s')
  })
})

describe('anchorOf', () => {
  it('anchors top placements to the top and the rest to the bottom', () => {
    expect(anchorOf('top')).toEqual({ v: 'top', h: 'center' })
    expect(anchorOf('top-left')).toEqual({ v: 'top', h: 'left' })
    expect(anchorOf('top-right')).toEqual({ v: 'top', h: 'right' })
    expect(anchorOf('bottom')).toEqual({ v: 'bottom', h: 'center' })
    expect(anchorOf('bottom-right')).toEqual({ v: 'bottom', h: 'right' })
    expect(anchorOf('left')).toEqual({ v: 'bottom', h: 'left' })
    expect(anchorOf('right')).toEqual({ v: 'bottom', h: 'right' })
    expect(anchorOf('center')).toEqual({ v: 'bottom', h: 'center' })
  })
})
