import { describe, expect, it } from 'vitest'
import {
  apart,
  contrast,
  deltaE2000,
  greyGap,
  hexToRgb,
  isHex,
  lab,
  labToHex,
  lch,
  lchToHex,
  simulate,
  SIMULATIONS,
  type Lab,
} from '../src/index.js'

describe('CIEDE2000', () => {
  // Test pairs from Sharma, Wu and Dalal (2005), "The CIEDE2000 color-difference
  // formula: implementation notes, supplementary test data, and mathematical
  // observations", the reference every implementation is checked against.
  const pairs: [Lab, Lab, number][] = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[50, 2.5, 0], [61, -5, 29], 22.8977],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  ]
  it.each(pairs)('matches the published value for %j / %j', (a, b, want) => {
    expect(deltaE2000(a, b)).toBeCloseTo(want, 4)
    expect(deltaE2000(b, a)).toBeCloseTo(want, 4)
  })
})

describe('the colour maths', () => {
  it('reads #rgb and #rrggbb, and refuses anything else', () => {
    expect(hexToRgb('#abc')).toEqual(hexToRgb('#aabbcc'))
    expect(hexToRgb('FFFFFF')).toEqual([1, 1, 1])
    for (const bad of ['', '#ab', '#abcd', 'red', '#ggg000', 'rgb(0,0,0)']) {
      expect(isHex(bad)).toBe(false)
      expect(() => hexToRgb(bad)).toThrow('is not a #rgb or #rrggbb colour')
    }
  })

  it('gives WCAG contrast', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
    expect(contrast('#ffffff', '#ffffff')).toBe(1)
  })

  it('leaves greys grey and pure white white under every simulation', () => {
    for (const s of SIMULATIONS) {
      expect(simulate('#ffffff', s)).toBe('#ffffff')
      expect(simulate('#000000', s)).toBe('#000000')
      const [r, g, b] = hexToRgb(simulate('#808080', s))
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(0.02)
    }
  })

  it('collapses red and green for protanopia and deuteranopia, not for tritanopia', () => {
    const [red, green] = ['#d62728', '#2ca02c']
    expect(deltaE2000(lab(red), lab(green))).toBeGreaterThan(60)
    expect(apart(red, green, 'deuteranopia')).toBeLessThan(apart(red, green, 'tritanopia'))
    expect(apart(red, green, 'protanopia')).toBeLessThan(apart(red, green, 'tritanopia'))
  })

  it('measures the lightness gap a grey screen leaves', () => {
    expect(greyGap('#000000', '#ffffff')).toBeCloseTo(100, 1)
    expect(greyGap('#ff0000', '#ff0000')).toBe(0)
  })

  it('goes from Lab and LCh back to hex, and says so when a colour is outside sRGB', () => {
    for (const hex of ['#8b5e33', '#2e5e70', '#c9a227', '#123456', '#fedcba']) {
      expect(labToHex(lab(hex))).toBe(hex)
      expect(lchToHex(lch(hex))).toBe(hex)
    }
    expect(labToHex([50, 120, 0])).toBeNull()
  })
})
