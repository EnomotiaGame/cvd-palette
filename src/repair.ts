import { apart, contrast, deltaE2000, greyGap, lab, lch, lchToHex, type Simulation } from './maths.js'

/**
 * MOVING A PALETTE AS LITTLE AS IT CAN UNTIL IT PASSES.
 *
 * Given the colours, the sets they meet in and one simulation, it searches
 * (simulated annealing in LCh) for colours that
 *
 *   (a) keep every pair inside a set at least `targetDeltaE` apart under the
 *       simulation (aim a little above what your test demands, so rounding to
 *       hex cannot undo it),
 *   (b) keep a lightness gap on a grey screen,
 *   (c) keep text colours readable on the background, and other colours at
 *       least as readable as they were,
 *   (d) stay close to where they started, and leave alone the colours that
 *       were already clear of their neighbours.
 *
 * "As little as it can" is the point: the palette should still look like
 * yours. The result is a proposal to review and write into your palette by
 * hand; check it again with checkPalette. It is deterministic for a seed.
 */
export interface RepairOptions {
  colours: Readonly<Record<string, string>>
  sets: Readonly<Record<string, readonly string[]>>
  simulation: Simulation
  /** Colours that are neighbours but must not move. */
  fixed?: readonly string[]
  /** The distance to aim for. 13.5 by default. */
  targetDeltaE?: number
  /** The grey lightness gap to aim for. 10 by default. */
  targetGreyGap?: number
  /** Colours read as text, the background they sit on, and the contrast they need. */
  text?: { names: readonly string[]; background: string; minContrast?: number }
  /** Colours that must not lose contrast on this background (thin lines, dots). */
  background?: string
  steps?: number
  restarts?: number
  seed?: number
}

export interface RepairResult {
  colours: Record<string, string>
  /** The colours that moved, with how far (CIEDE2000, typical vision). */
  moved: { name: string; from: string; to: string; deltaE: number }[]
  /** The tightest pairs left, under the simulation. */
  tightest: { names: [string, string]; deltaE: number; greyGap: number }[]
  cost: number
}

/** A small, fast, seedable generator (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const gauss = () => {
    const u = Math.max(next(), 1e-12)
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next())
  }
  return { next, gauss }
}

export function repairPalette(options: RepairOptions): RepairResult {
  const {
    colours,
    sets,
    simulation,
    fixed = [],
    targetDeltaE = 13.5,
    targetGreyGap = 10,
    text,
    background,
    steps = 30000,
    restarts = 3,
    seed = 1,
  } = options
  const names = Object.keys(colours)
  const pairs = new Map<string, [string, string]>()
  for (const set of Object.values(sets)) {
    for (let i = 0; i < set.length; i++) {
      for (let j = i + 1; j < set.length; j++) {
        const [x, y] = [set[i]!, set[j]!].sort() as [string, string]
        if (!Object.hasOwn(colours, x) || !Object.hasOwn(colours, y)) throw new Error(`cvd-palette: a set names a colour that is not in colours: ${x} / ${y}`)
        pairs.set(`${x}\u0000${y}`, [x, y])
      }
    }
  }
  const pairList = [...pairs.values()]
  const textNames = new Set(text?.names ?? [])
  const textNeed = text?.minContrast ?? 4.5
  const ground = text?.background ?? background
  const start = { ...colours }
  const startLab = Object.fromEntries(names.map((n) => [n, lab(start[n]!)]))

  const cost = (c: Record<string, string>): number => {
    let total = 0
    for (const [x, y] of pairList) {
      const de = apart(c[x]!, c[y]!, simulation)
      const dn = deltaE2000(lab(c[x]!), lab(c[y]!))
      const dl = greyGap(c[x]!, c[y]!)
      if (de < targetDeltaE) total += (targetDeltaE - de) ** 2 * 6
      if (dl < targetGreyGap) total += (targetGreyGap - dl) ** 2 * 0.35
      if (dl < 4.5) total += (4.5 - dl) ** 2 * 12
      if (dn < 10) total += (10 - dn) ** 2 * 0.5
    }
    for (const n of names) {
      if (fixed.includes(n)) continue
      const L = lab(c[n]!)
      const L0 = startLab[n]!
      const moved = deltaE2000(L0, L)
      // A colour that has to move may; one that does not, stays. The charge
      // for moving at all keeps clear colours where they are.
      total += moved * 1.1 + (moved > 2 ? 6 : 0)
      const C = Math.hypot(L[1], L[2])
      const C0 = Math.hypot(L0[1], L0[2])
      if (C > C0 + 22) total += (C - C0 - 22) ** 2 * 0.3
      if (C < C0 - 14) total += (C0 - C + 14) ** 2 * 0.3
      if (ground) {
        // Aim a little above the line, so rounding to hex cannot undo it.
        const need = textNames.has(n) ? textNeed + 0.15 : Math.min(3, contrast(start[n]!, ground))
        const have = contrast(c[n]!, ground)
        if (have < need) total += (need - have) ** 2 * 600
      }
    }
    return total
  }

  const free = names.filter((n) => !fixed.includes(n))
  let best = { ...start }
  let bestCost = cost(best)
  for (let r = 0; r < restarts && free.length; r++) {
    const g = rng(seed + r * 7919)
    const cur = { ...start }
    const state = Object.fromEntries(free.map((n) => [n, lch(cur[n]!)]))
    let c = cost(cur)
    for (let i = 0; i < steps; i++) {
      const progress = i / steps
      const temp = 6 * (1 - progress) ** 2 + 0.02
      const n = free[Math.floor(g.next() * free.length)]!
      const v = [...state[n]!] as [number, number, number]
      const s = 1 + 2.5 * (1 - progress)
      v[0] += g.gauss() * 3.5 * s
      v[1] = Math.max(0, v[1] + g.gauss() * 5 * s)
      v[2] = (((v[2] + g.gauss() * 14 * s) % 360) + 360) % 360
      const hex = lchToHex(v)
      if (!hex) continue
      const old = cur[n]!
      cur[n] = hex
      const nc = cost(cur)
      if (nc <= c || g.next() < Math.exp((c - nc) / temp)) {
        c = nc
        state[n] = lch(hex)
        if (c < bestCost) {
          best = { ...cur }
          bestCost = c
        }
      } else {
        cur[n] = old
      }
    }
  }

  // SNAP BACK: a colour the search nudged but did not need to move goes home.
  // Each is tried on its own, the largest move first, and kept home if the
  // palette is no worse for it.
  let improved = true
  while (improved) {
    improved = false
    const nudged = names
      .filter((n) => best[n]!.toLowerCase() !== start[n]!.toLowerCase())
      .sort((x, y) => deltaE2000(startLab[y]!, lab(best[y]!)) - deltaE2000(startLab[x]!, lab(best[x]!)))
    for (const n of nudged) {
      const trial = { ...best, [n]: start[n]! }
      const c = cost(trial)
      if (c <= bestCost) {
        best = trial
        bestCost = c
        improved = true
      }
    }
  }

  const moved = names
    .filter((n) => best[n]!.toLowerCase() !== start[n]!.toLowerCase())
    .map((n) => ({ name: n, from: start[n]!, to: best[n]!, deltaE: deltaE2000(lab(start[n]!), lab(best[n]!)) }))
  const tightest = pairList
    .map(([x, y]) => ({ names: [x, y] as [string, string], deltaE: apart(best[x]!, best[y]!, simulation), greyGap: greyGap(best[x]!, best[y]!) }))
    .sort((a, b) => a.deltaE - b.deltaE)
    .slice(0, 5)
  return { colours: best, moved, tightest, cost: bestCost }
}
