# cvd-palette

[![npm](https://img.shields.io/npm/v/cvd-palette.svg)](https://www.npmjs.com/package/cvd-palette)
[![CI](https://github.com/EnomotiaGame/cvd-palette/actions/workflows/ci.yml/badge.svg)](https://github.com/EnomotiaGame/cvd-palette/actions/workflows/ci.yml)

Make sure the colours in your charts, legends and status badges can be told apart by people with colour-vision deficiency. Test the palette like code, fix it by moving colours as little as possible, and ship a colour-blind mode as CSS.

> **From the ENOMOTIA team.** We build [ENOMOTIA](https://enomotia.net), a strategy game set in ancient Greece that you play in the browser and on your phone. Along the way we keep meeting problems that every web and mobile product meets sooner or later. When one of our fixes turns out to be useful beyond the game, we clean it up and publish it here so you don't have to solve it again. Issues, ideas and pull requests are welcome: see [CONTRIBUTING](https://github.com/EnomotiaGame/.github/blob/main/CONTRIBUTING.md).

A player told us they couldn't tell some of the game's colours apart. About one man in twelve has some form of colour-vision deficiency. A palette that looks fine to its designer can turn two series of a chart into the same brown for them.

We gave the game a colour-vision setting with three modes, one for each kind of deficiency. Each mode swaps the category colours for ones chosen for that condition, and a test fails if two colours that sit side by side get too close. This package is that work, without the game.

## What it does

- **Measures** what people with protanopia, deuteranopia and tritanopia see:
  - simulation from Machado, Oliveira and Fernandes (2009), in linear sRGB;
  - distance as CIEDE2000, checked against Sharma et al. (2005);
  - the lightness gap on a grey screen;
  - WCAG contrast.
- **Checks a palette like code.** You list which colours can meet in one chart (a "set"). `checkPalette` returns every pair that is too close, for whom, and by how much. It returns an empty list when the palette passes, so `expect(checkPalette(…)).toEqual([])` works in any test runner.
- **Fixes it.** `repairPalette` searches for the smallest change that separates the colliding colours:
  - colours already clear of their neighbours stay where they are;
  - text keeps its contrast;
  - colours you mark as fixed never move.

  It proposes; you decide.
- **Ships the modes.** One JSON file holds the default palette and a palette per mode. `toCss` writes the stylesheet that switches them with `<html data-colour-vision="deutan">`.
- **No dependencies**, ESM, typed, and it runs in Node and the browser.

## Use

```sh
npm install --save-dev cvd-palette
```

### In a test

```ts
import { checkPalette } from 'cvd-palette'

test('the chart colours can be told apart', () => {
  expect(
    checkPalette({
      colours: { sales: '#2ca02c', costs: '#d62728', profit: '#1f77b4' },
      sets: { revenueChart: ['sales', 'costs', 'profit'] },
      text: { names: ['costs'], background: '#ffffff' }, // read as text: 4.5:1
    }),
  ).toEqual([])
})
```

```
revenueChart: sales #2ca02c / costs #d62728 are ΔE 4.8 apart for deuteranopia vision, need 12
```

The defaults are CIEDE2000 ≥ 12 under each simulation and with typical vision, a lightness gap of 3 L* on a grey screen, and 4.5:1 for text. All of them are options.

### Colour-blind modes

[`example/palettes.json`](example/palettes.json):

```json
{
  "sets": { "chart": ["sales", "costs", "profit", "forecast"] },
  "tokens": {
    "sales":  { "css": ["--chart-sales"], "default": "#2ca02c" },
    "costs":  { "css": ["--chart-costs"], "default": "#d62728", "deutan": "#b51318" },
    "profit": { "css": ["--chart-profit"], "default": "#1f77b4" }
  },
  "check": { "text": { "names": ["costs"], "background": "#ffffff" }, "fixed": ["profit"] }
}
```

A token keeps its default in a mode that does not name it. `same_as` makes a token take another's colour in every mode, so one kind of thing has one colour on every screen. Each mode is checked under its own simulation: protan under protanopia, and so on. The default palette is checked for typical vision.

```sh
npx cvd-palette check example/palettes.json          # exits 1 naming each pair that is too close
npx cvd-palette repair example/palettes.json --mode deutan   # proposes the mode's colours, as JSON
npx cvd-palette css example/palettes.json > colour-vision.css
```

```css
:root[data-colour-vision='deutan'] {
  --chart-costs: #b51318;
}
```

Declare the default colours in your own `:root`, let users pick a mode in your settings, and set the attribute on `<html>`.

### From code

```ts
import { simulate, apart, contrast, deltaE2000, lab, repairPalette } from 'cvd-palette'

simulate('#d62728', 'deuteranopia')                 // '#…' as they would see it
apart('#d62728', '#2ca02c', 'deuteranopia')          // 4.8, CIEDE2000 under the simulation
repairPalette({ colours, sets, simulation: 'deuteranopia', fixed: ['brand'] })
```

## Colour is never the only signal

A palette that passes is necessary, not sufficient. Every coloured element should also carry its name, a sign or a pattern: a label under the bar, a tooltip on each slice, "+" and "−" next to green and red. The game's rule is that colour is the second signal, never the first. This package makes the colours as good as they can be; it does not replace the words.

## References

- G. M. Machado, M. M. Oliveira, L. A. F. Fernandes, "A Physiologically-based Model for Simulation of Color Vision Deficiency", IEEE TVCG 15(6), 2009.
- G. Sharma, W. Wu, E. N. Dalal, "The CIEDE2000 color-difference formula: implementation notes, supplementary test data, and mathematical observations", Color Research & Application 30(1), 2005.

## Contributing

Bug reports, ideas and pull requests are welcome. Severity levels, anomalous trichromacy and new simulations are all welcome additions. Security problems go through [private vulnerability reporting](https://github.com/EnomotiaGame/cvd-palette/security/advisories/new). The details are in [CONTRIBUTING](https://github.com/EnomotiaGame/.github/blob/main/CONTRIBUTING.md).

## License

MIT © TRUETHINKS LTD
