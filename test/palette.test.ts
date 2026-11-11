import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  apart,
  checkPalette,
  checkPalettes,
  paletteOf,
  repairPalette,
  toCss,
  tokenColour,
  type Palettes,
} from '../src/index.js'

const ROOT = resolve(__dirname, '..')
const example = JSON.parse(readFileSync(join(ROOT, 'example/palettes.json'), 'utf8')) as Palettes

// The textbook problem: a chart whose series are told apart by red and green.
const chart = { sales: '#2ca02c', costs: '#d62728', profit: '#1f77b4', forecast: '#ff7f0e' }

describe('checkPalette', () => {
  it('names the pairs that collapse, and for whom', () => {
    const problems = checkPalette({ colours: chart, sets: { chart: Object.keys(chart) } })
    const deutan = problems.filter((p) => p.vision === 'deuteranopia').map((p) => p.names.join(' / '))
    expect(deutan).toContain('sales / costs')
    expect(problems.every((p) => p.message.startsWith('chart: '))).toBe(true)
    expect(problems.some((p) => p.vision === 'typical')).toBe(false)
  })

  it('passes a palette chosen for it, and checks text contrast', () => {
    const okabeIto = { orange: '#e69f00', sky: '#56b4e9', green: '#009e73', blue: '#0072b2', vermillion: '#d55e00' }
    expect(checkPalette({ colours: okabeIto, sets: { all: Object.keys(okabeIto) }, minDeltaE: 8, minGreyGap: 0 })).toEqual([])
    const text = checkPalette({ colours: okabeIto, sets: {}, text: { names: ['sky', 'blue'], background: '#ffffff' } })
    expect(text.map((p) => p.names[0])).toEqual(['sky'])
  })

  it('reports names it does not know instead of guessing', () => {
    expect(checkPalette({ colours: chart, sets: { chart: ['sales', 'revenue'] } })).toEqual([
      expect.objectContaining({ kind: 'unknown', message: 'no colour named revenue (set chart)' }),
    ])
  })
})

describe('palettes with modes', () => {
  const p: Palettes = {
    sets: { s: ['a', 'b'] },
    tokens: {
      a: { css: ['--a'], default: '#d62728', protan: '#0072b2' },
      b: { css: ['--b', '--b-alt'], default: '#2ca02c' },
      c: { default: '#123456', same_as: 'a' },
    },
  }

  it('takes a mode colour, falls back to the default, and follows same_as', () => {
    expect(tokenColour(p, 'a', 'protan')).toBe('#0072b2')
    expect(tokenColour(p, 'a', 'deutan')).toBe('#d62728')
    expect(tokenColour(p, 'c', 'default')).toBe('#123456')
    expect(tokenColour(p, 'c', 'protan')).toBe('#0072b2')
    expect(() => tokenColour({ sets: {}, tokens: { x: { default: '#000', same_as: 'y' }, y: { default: '#fff', same_as: 'x' } } }, 'x', 'protan')).toThrow('loops')
    expect(() => tokenColour(p, 'constructor', 'default')).toThrow('unknown token')
  })

  it('writes only what a mode changes as CSS', () => {
    expect(toCss(p, { header: 'generated' })).toBe(
      "/* generated */\n\n:root[data-colour-vision='protan'] {\n  --a: #0072b2;\n}\n\n:root[data-colour-vision='deutan'] {\n\n}\n\n:root[data-colour-vision='tritan'] {\n\n}\n",
    )
    expect(() => toCss(p, { attribute: 'x"]{}' })).toThrow('not an attribute name')
  })

  it('checks each mode under its own simulation', () => {
    // Red and green collapse for deuteranopia (ΔE about 5), not for
    // protanopia (about 25) or tritanopia; protan swapped the red anyway.
    const problems = checkPalettes(p, { minGreyGap: 0 })
    expect(problems.map((x) => `${x.message.split(':')[0]} ${x.names.join('/')}`)).toEqual(['deutan a/b'])
  })

  it('finds the example palette told apart in every mode', () => {
    expect(checkPalettes(example)).toEqual([])
    expect(paletteOf(example, 'default').sales).toBe('#2ca02c')
  })
})

describe('repairPalette', () => {
  it('moves the colliding colours until they pass, and leaves the rest alone', () => {
    const fixed = ['profit']
    const result = repairPalette({ colours: chart, sets: { chart: Object.keys(chart) }, simulation: 'deuteranopia', fixed, seed: 7 })
    expect(checkPalette({ colours: result.colours, sets: { chart: Object.keys(chart) }, simulations: ['deuteranopia'], typical: false })).toEqual([])
    expect(result.colours.profit).toBe(chart.profit)
    expect(result.moved.length).toBeLessThan(Object.keys(chart).length)
    expect(apart(result.colours.sales!, result.colours.costs!, 'deuteranopia')).toBeGreaterThan(12)
  })

  it('is the same for the same seed', () => {
    const a = repairPalette({ colours: chart, sets: { chart: Object.keys(chart) }, simulation: 'protanopia', steps: 3000, seed: 3 })
    const b = repairPalette({ colours: chart, sets: { chart: Object.keys(chart) }, simulation: 'protanopia', steps: 3000, seed: 3 })
    expect(a.colours).toEqual(b.colours)
  })

  it('keeps text readable while it moves it', () => {
    const status = { ok: '#2ca02c', error: '#d62728', warn: '#ff7f0e' }
    const r = repairPalette({
      colours: status,
      sets: { status: Object.keys(status) },
      simulation: 'deuteranopia',
      text: { names: Object.keys(status), background: '#ffffff' },
      seed: 11,
    })
    expect(checkPalette({ colours: r.colours, sets: {}, text: { names: Object.keys(status), background: '#ffffff' } })).toEqual([])
  })
})

describe('the command', () => {
  const cli = join(ROOT, 'dist/cli.js')
  beforeAll(() => {
    execFileSync(process.execPath, [join(ROOT, 'node_modules/typescript/bin/tsc'), '-p', join(ROOT, 'tsconfig.build.json')])
  }, 60_000)
  const run = (...args: string[]) => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
    } catch (e) {
      const err = e as { status: number; stdout: string }
      return { code: err.status, out: err.stdout }
    }
  }

  it('checks, repairs and writes CSS', () => {
    const file = join(ROOT, 'example/palettes.json')
    const ok = run('check', file)
    expect(ok.code).toBe(0)
    expect(ok.out).toMatch(/all told apart\n$/)
    const repaired = JSON.parse(run('repair', file, '--mode', 'deutan').out) as Record<string, Record<string, string>>
    expect(Object.keys(repaired)).toEqual(['deutan'])
    expect(run('css', file).out).toContain(":root[data-colour-vision='deutan']")
    expect(run('repair', file).code).toBe(2)
    expect(run('lint', file).code).toBe(2)
  })
})
