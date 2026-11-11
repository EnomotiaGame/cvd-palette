import { apart, contrast, deltaE2000, greyGap, hexToRgb, lab, SIMULATIONS, type Simulation } from './maths.js'

/**
 * WHETHER A PALETTE CAN BE TOLD APART.
 *
 * A chart, a legend or a stacked bar puts colours side by side. For each group
 * of colours that can meet (a "set"), every pair must stay apart:
 *
 *   - under each colour-vision simulation, by CIEDE2000 (`minDeltaE`);
 *   - on a grey screen, by lightness (`minGreyGap`), which is also what a
 *     reader with achromatopsia, or a black-and-white printout, sees;
 *
 * and a colour read as text must keep its contrast on the background.
 *
 * The result is a list of problems, empty when the palette passes, so a test
 * can say `expect(checkPalette(...)).toEqual([])` and fail naming the pair.
 */
export interface CheckOptions {
  /** The colours, by name. */
  colours: Readonly<Record<string, string>>
  /** Which colours can sit side by side, by group. Every pair inside a set is checked. */
  sets: Readonly<Record<string, readonly string[]>>
  /** The simulations to check under. All three by default. */
  simulations?: readonly Simulation[]
  /** Also check the pairs with typical colour vision. True by default. */
  typical?: boolean
  /** The least CIEDE2000 distance a pair may have. 12 by default. */
  minDeltaE?: number
  /** The least lightness gap (L*) a pair may have on a grey screen. 3 by default; 0 turns it off. */
  minGreyGap?: number
  /** Colours read as text, and what they are read on. */
  text?: { names: readonly string[]; background: string; minContrast?: number }
}

export interface Problem {
  kind: 'deltaE' | 'grey' | 'contrast' | 'unknown'
  set?: string
  names: string[]
  /** `typical`, a simulation, or `grey`. */
  vision?: Simulation | 'typical' | 'grey'
  value: number
  required: number
  message: string
}

export const DEFAULT_MIN_DELTA_E = 12
export const DEFAULT_MIN_GREY_GAP = 3
export const DEFAULT_MIN_CONTRAST = 4.5

const fmt = (n: number) => n.toFixed(1)

export function checkPalette(options: CheckOptions): Problem[] {
  const {
    colours,
    sets,
    simulations = SIMULATIONS,
    typical = true,
    minDeltaE = DEFAULT_MIN_DELTA_E,
    minGreyGap = DEFAULT_MIN_GREY_GAP,
    text,
  } = options
  const out: Problem[] = []
  const colour = (name: string): string | undefined => (Object.hasOwn(colours, name) ? colours[name] : undefined)

  const unknown = new Set<string>()
  for (const [set, names] of Object.entries(sets)) {
    for (const n of names) {
      const c = colour(n)
      if (c === undefined) unknown.add(`${n} (set ${set})`)
      else hexToRgb(c)
    }
  }
  for (const n of text?.names ?? []) if (colour(n) === undefined) unknown.add(`${n} (text)`)
  for (const u of unknown) {
    out.push({ kind: 'unknown', names: [u], value: 0, required: 0, message: `no colour named ${u}` })
  }
  if (unknown.size) return out

  for (const [set, names] of Object.entries(sets)) {
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const [x, y] = [names[i]!, names[j]!]
        const [a, b] = [colour(x)!, colour(y)!]
        const visions: (Simulation | 'typical')[] = [...(typical ? (['typical'] as const) : []), ...simulations]
        for (const v of visions) {
          const de = v === 'typical' ? deltaE2000(lab(a), lab(b)) : apart(a, b, v)
          if (de < minDeltaE) {
            out.push({
              kind: 'deltaE', set, names: [x, y], vision: v, value: de, required: minDeltaE,
              message: `${set}: ${x} ${a} / ${y} ${b} are ΔE ${fmt(de)} apart for ${v} vision, need ${minDeltaE}`,
            })
          }
        }
        if (minGreyGap > 0) {
          const gap = greyGap(a, b)
          if (gap < minGreyGap) {
            out.push({
              kind: 'grey', set, names: [x, y], vision: 'grey', value: gap, required: minGreyGap,
              message: `${set}: ${x} ${a} / ${y} ${b} differ by ${fmt(gap)} L* on a grey screen, need ${minGreyGap}`,
            })
          }
        }
      }
    }
  }

  if (text) {
    const need = text.minContrast ?? DEFAULT_MIN_CONTRAST
    for (const n of text.names) {
      const c = contrast(colour(n)!, text.background)
      if (c < need) {
        out.push({
          kind: 'contrast', names: [n], value: c, required: need,
          message: `${n} ${colour(n)} has contrast ${c.toFixed(2)}:1 on ${text.background}, need ${need}:1`,
        })
      }
    }
  }
  return out
}
