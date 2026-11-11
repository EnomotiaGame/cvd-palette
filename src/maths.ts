/**
 * The colour-vision maths. Pure, DOM-free, no dependencies.
 *
 * Simulation: Machado, Oliveira and Fernandes (2009) matrices at full
 * severity, applied in linear sRGB. Distance: CIEDE2000 on CIELAB under D65.
 * Contrast: WCAG 2 relative luminance.
 */
export type Simulation = 'protanopia' | 'deuteranopia' | 'tritanopia'

/** Every simulation, in a stable order. */
export const SIMULATIONS: readonly Simulation[] = ['protanopia', 'deuteranopia', 'tritanopia']

const MACHADO: Record<Simulation, number[][]> = {
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
}

/** The simulation each colour-vision mode is judged under. */
export const SIMULATION_OF = { protan: 'protanopia', deutan: 'deuteranopia', tritan: 'tritanopia' } as const

export type Rgb = [number, number, number]

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/** Whether a string is a `#rgb` or `#rrggbb` colour. */
export function isHex(value: string): boolean {
  return HEX.test(value)
}

/** `#rgb` or `#rrggbb` (the `#` optional) as sRGB channels in 0–1. */
export function hexToRgb(hex: string): Rgb {
  const m = HEX.exec(hex.trim())
  if (!m) throw new Error(`cvd-palette: \`${hex}\` is not a #rgb or #rrggbb colour`)
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as Rgb
}

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const delin = (c: number) => {
  const v = Math.max(0, Math.min(1, c))
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
}

export function rgbToHex(rgb: Rgb): string {
  return '#' + rgb.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0')).join('')
}

/** What a colour looks like to somebody with the given condition. */
export function simulate(hex: string, kind: Simulation): string {
  const l = hexToRgb(hex).map(lin)
  const m = MACHADO[kind]
  const out = m.map((row) => row[0]! * l[0]! + row[1]! * l[1]! + row[2]! * l[2]!)
  return rgbToHex(out.map(delin) as Rgb)
}

/** Relative luminance (Rec. 709, linear). */
export function luminance(hex: string): number {
  const l = hexToRgb(hex).map(lin)
  return 0.2126 * l[0]! + 0.7152 * l[1]! + 0.0722 * l[2]!
}

/** WCAG contrast ratio of two colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

export type Lab = [number, number, number]

export function lab(hex: string): Lab {
  const l = hexToRgb(hex).map(lin)
  const x = 0.4124564 * l[0]! + 0.3575761 * l[1]! + 0.1804375 * l[2]!
  const y = 0.2126729 * l[0]! + 0.7151522 * l[1]! + 0.072175 * l[2]!
  const z = 0.0193339 * l[0]! + 0.119192 * l[1]! + 0.9503041 * l[2]!
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116)
  const fx = f(x / 0.95047)
  const fy = f(y / 1.0)
  const fz = f(z / 1.08883)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

export function deltaE2000(l1: Lab, l2: Lab): number {
  const [L1, a1, b1] = l1
  const [L2, a2, b2] = l2
  const C1 = Math.hypot(a1, b1)
  const C2 = Math.hypot(a2, b2)
  const Cm = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)))
  const a1p = (1 + G) * a1
  const a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1)
  const C2p = Math.hypot(a2p, b2)
  const h1p = ((deg(Math.atan2(b1, a1p)) % 360) + 360) % 360
  const h2p = ((deg(Math.atan2(b2, a2p)) % 360) + 360) % 360
  const dLp = L2 - L1
  const dCp = C2p - C1p
  let dhp = 0
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p
    if (dhp > 180) dhp -= 360
    else if (dhp < -180) dhp += 360
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2))
  const Lpm = (L1 + L2) / 2
  const Cpm = (C1p + C2p) / 2
  let hpm: number
  if (C1p * C2p === 0) hpm = h1p + h2p
  else if (Math.abs(h1p - h2p) <= 180) hpm = (h1p + h2p) / 2
  else hpm = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2
  const T =
    1 -
    0.17 * Math.cos(rad(hpm - 30)) +
    0.24 * Math.cos(rad(2 * hpm)) +
    0.32 * Math.cos(rad(3 * hpm + 6)) -
    0.2 * Math.cos(rad(4 * hpm - 63))
  const dTheta = 30 * Math.exp(-(((hpm - 275) / 25) ** 2))
  const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7))
  const Sl = 1 + (0.015 * (Lpm - 50) ** 2) / Math.sqrt(20 + (Lpm - 50) ** 2)
  const Sc = 1 + 0.045 * Cpm
  const Sh = 1 + 0.015 * Cpm * T
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))
}

/** How far apart two colours look to somebody with the given condition (CIEDE2000). */
export function apart(a: string, b: string, kind: Simulation): number {
  return deltaE2000(lab(simulate(a, kind)), lab(simulate(b, kind)))
}

/** How far apart two colours are on a grey screen: the gap in L* of their luminance. */
export function greyGap(a: string, b: string): number {
  const grey = (hex: string) => {
    const y = luminance(hex)
    return rgbToHex([delin(y), delin(y), delin(y)])
  }
  return Math.abs(lab(grey(a))[0] - lab(grey(b))[0])
}

/** CIELAB back to `#rrggbb`, or null when the colour is outside sRGB. */
export function labToHex([L, a, b]: Lab): string | null {
  const fy = (L + 16) / 116
  const fx = fy + a / 500
  const fz = fy - b / 200
  const finv = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27))
  const x = 0.95047 * finv(fx)
  const y = 1.0 * finv(fy)
  const z = 1.08883 * finv(fz)
  const r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z
  const g = -0.969266 * x + 1.8760108 * y + 0.041556 * z
  const bl = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z
  if (Math.min(r, g, bl) < -0.0005 || Math.max(r, g, bl) > 1.0005) return null
  return rgbToHex([delin(r), delin(g), delin(bl)])
}

/** Lightness, chroma and hue (degrees) of a colour. */
export function lch(hex: string): [number, number, number] {
  const [L, a, b] = lab(hex)
  return [L, Math.hypot(a, b), ((deg(Math.atan2(b, a)) % 360) + 360) % 360]
}

/** `#rrggbb` from lightness, chroma and hue, or null outside sRGB. */
export function lchToHex([L, C, H]: [number, number, number]): string | null {
  return labToHex([L, C * Math.cos(rad(H)), C * Math.sin(rad(H))])
}
