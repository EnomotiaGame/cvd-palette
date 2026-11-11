#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { checkPalettes, MODES, paletteOf, toCss, type Mode, type Palettes } from './palettes.js'
import { SIMULATION_OF } from './maths.js'
import { repairPalette } from './repair.js'

const USAGE = `cvd-palette check <palettes.json>
cvd-palette repair <palettes.json> --mode protan|deutan|tritan [--seed n]
cvd-palette css <palettes.json> [--attribute data-colour-vision]

check   every mode under its own simulation, and the default for typical
        vision; exits 1 naming each pair that is too close
repair  proposes colours for one mode, moved as little as it can; prints the
        mode's colours as JSON to review and copy into the file
css     prints the stylesheet that switches the modes
`

function read(path: string): Palettes {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Palettes
  } catch (e) {
    throw new Error(`${path}: ${(e as Error).message}`)
  }
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

function main(argv: string[]): number {
  const [command, file, ...rest] = argv
  if (!command || !file || file.startsWith('-')) {
    process.stderr.write(USAGE)
    return 2
  }
  let p: Palettes
  try {
    p = read(file)
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`)
    return 2
  }
  if (command === 'check') {
    const problems = checkPalettes(p)
    for (const pr of problems) process.stdout.write(`${pr.message}\n`)
    const pairs = Object.values(p.sets).reduce((n, s) => n + (s.length * (s.length - 1)) / 2, 0)
    process.stdout.write(`${Object.keys(p.tokens).length} colours, ${pairs} pairs, ${MODES.length} modes: ${problems.length ? `${problems.length} to fix` : 'all told apart'}\n`)
    return problems.length ? 1 : 0
  }
  if (command === 'repair') {
    const mode = flag(rest, '--mode') as Mode | undefined
    if (!mode || !MODES.includes(mode)) {
      process.stderr.write(`--mode is one of ${MODES.join(', ')}\n`)
      return 2
    }
    const seed = Number(flag(rest, '--seed') ?? 1)
    const result = repairPalette({
      colours: paletteOf(p, mode),
      sets: p.sets,
      simulation: SIMULATION_OF[mode],
      fixed: p.check?.fixed,
      text: p.check?.text,
      seed,
    })
    for (const m of result.moved) process.stderr.write(`moved ${m.name}: ${m.from} → ${m.to} (ΔE ${m.deltaE.toFixed(1)})\n`)
    for (const t of result.tightest) process.stderr.write(`tightest ${t.names.join(' / ')}: ΔE ${t.deltaE.toFixed(1)}, grey ${t.greyGap.toFixed(1)}\n`)
    process.stdout.write(`${JSON.stringify({ [mode]: Object.fromEntries(result.moved.map((m) => [m.name, m.to])) }, null, 2)}\n`)
    return 0
  }
  if (command === 'css') {
    process.stdout.write(toCss(p, { attribute: flag(rest, '--attribute') }))
    return 0
  }
  process.stderr.write(USAGE)
  return 2
}

process.exitCode = main(process.argv.slice(2))
