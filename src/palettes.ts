import { checkPalette, type CheckOptions, type Problem } from './check.js'
import { SIMULATION_OF } from './maths.js'

/**
 * PALETTES WITH COLOUR-VISION MODES.
 *
 * An app can offer a setting such as "I have trouble telling red apart" and
 * swap its category colours for ones chosen for that condition. One JSON file
 * holds every mode:
 *
 *     {
 *       "sets":   { "chart": ["sales", "costs", "profit"] },
 *       "tokens": {
 *         "sales":  { "css": ["--chart-sales"], "default": "#2e7d32", "deutan": "#1f5fa8" },
 *         "costs":  { "css": ["--chart-costs"], "default": "#c62828" },
 *         "profit": { "css": ["--chart-profit"], "default": "#6a1b9a", "same_as": "sales" }
 *       }
 *     }
 *
 * A token without a value for a mode keeps its default there. `same_as` makes a
 * token take another's colour in every mode but the default. Each mode is
 * checked under its own simulation: protan under protanopia, and so on.
 */
export const MODES = ['protan', 'deutan', 'tritan'] as const
export type Mode = (typeof MODES)[number]

export interface PaletteToken {
  /** CSS custom properties that carry this colour (for toCss). */
  css?: string[]
  default: string
  protan?: string
  deutan?: string
  tritan?: string
  /** In every mode but the default, take this other token's colour. */
  same_as?: string
}

export interface Palettes {
  sets: Record<string, string[]>
  tokens: Record<string, PaletteToken>
  /** How strict the check is, kept with the palette so the CLI and your tests agree. */
  check?: {
    minDeltaE?: number
    minGreyGap?: number
    text?: { names: string[]; background: string; minContrast?: number }
    /** Tokens repair must never move. */
    fixed?: string[]
  }
}

/** A token's colour in a mode (or `default`), following `same_as`. */
export function tokenColour(p: Palettes, name: string, mode: Mode | 'default', seen: string[] = []): string {
  const t = Object.hasOwn(p.tokens, name) ? p.tokens[name] : undefined
  if (!t) throw new Error(`cvd-palette: unknown token \`${name}\``)
  if (mode !== 'default' && t.same_as) {
    if (seen.includes(name)) throw new Error(`cvd-palette: \`same_as\` loops through ${[...seen, name].join(' → ')}`)
    return tokenColour(p, t.same_as, mode, [...seen, name])
  }
  return (mode === 'default' ? t.default : t[mode]) ?? t.default
}

/** Every token's colour in a mode. */
export function paletteOf(p: Palettes, mode: Mode | 'default'): Record<string, string> {
  return Object.fromEntries(Object.keys(p.tokens).map((name) => [name, tokenColour(p, name, mode)]))
}

export interface CheckPalettesOptions extends Omit<CheckOptions, 'colours' | 'sets' | 'simulations' | 'typical'> {
  /** Also check the default palette, for typical vision only (CIEDE2000 and text contrast, no grey gap). True by default. */
  checkDefault?: boolean
}

/**
 * Every mode under its own simulation, and the default for typical vision.
 * Each problem's message starts with the mode it was found in.
 */
export function checkPalettes(p: Palettes, options: CheckPalettesOptions = {}): Problem[] {
  const { checkDefault = true, ...given } = options
  const { fixed: _fixed, ...fromFile } = p.check ?? {}
  const rest = { ...fromFile, ...given }
  const out: Problem[] = []
  if (checkDefault) {
    // The default palette is for typical colour vision: told apart by hue, so
    // the grey-screen gap is asked of the modes only.
    for (const pr of checkPalette({ ...rest, minGreyGap: 0, colours: paletteOf(p, 'default'), sets: p.sets, simulations: [], typical: true })) {
      out.push({ ...pr, message: `default: ${pr.message}` })
    }
  }
  for (const mode of MODES) {
    const problems = checkPalette({ ...rest, colours: paletteOf(p, mode), sets: p.sets, simulations: [SIMULATION_OF[mode]], typical: false })
    for (const pr of problems) out.push({ ...pr, message: `${mode}: ${pr.message}` })
  }
  return out
}

export interface CssOptions {
  /** The attribute on the root that picks a mode. `data-colour-vision` by default. */
  attribute?: string
  /** A comment at the top of the file. */
  header?: string
}

/**
 * The stylesheet for the modes: one block per mode, holding only the custom
 * properties whose colour differs from the default. Declare the defaults in
 * your own `:root`; set `<html data-colour-vision="deutan">` to switch.
 */
export function toCss(p: Palettes, options: CssOptions = {}): string {
  const attribute = options.attribute ?? 'data-colour-vision'
  if (!/^[a-z][a-z0-9-]*$/.test(attribute)) throw new Error(`cvd-palette: \`${attribute}\` is not an attribute name`)
  const head = options.header ? `/* ${options.header.replace(/\*\//g, '* /')} */\n\n` : ''
  const blocks = MODES.map((mode) => {
    const lines: string[] = []
    for (const [name, t] of Object.entries(p.tokens)) {
      const v = tokenColour(p, name, mode)
      if (v.toLowerCase() === t.default.toLowerCase()) continue
      for (const prop of t.css ?? []) lines.push(`  ${prop}: ${v};`)
    }
    return `:root[${attribute}='${mode}'] {\n${lines.join('\n')}\n}\n`
  })
  return head + blocks.join('\n')
}
