import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BACKGROUND } from './paint.ts'

const ROOT = join(import.meta.dirname, '../../../..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

type Rgb = [number, number, number]

/** oklch() to sRGB channels from 0 to 1, as a browser paints it. */
function rgb(l: number, c: number, h: number): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const lms = [
    (l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    (l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    (l - 0.0894841775 * a - 1.291485548 * b) ** 3,
  ] as const
  const linear = [
    4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2],
    -1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2],
    -0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2],
  ]
  const encode = (x: number) => {
    const v = Math.min(1, Math.max(0, x))
    return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
  }
  return linear.map(encode) as Rgb
}

const toHex = (color: Rgb): string =>
  `#${color
    .map((x) =>
      Math.round(x * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`

/** `color` at `alpha` over `ground`, as a tint utility paints it. */
const over = (color: Rgb, alpha: number, ground: Rgb): string =>
  toHex(color.map((x, i) => x * alpha + ground[i] * (1 - alpha)) as Rgb)

/** Every value of a token in styles.css, in order: the light scope, then the dark one. */
function values(name: string): Rgb[] {
  const css = read('src/renderer/styles.css')
  const pattern = new RegExp(`--${name}: oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\);`, 'g')
  return [...css.matchAll(pattern)].map((m) => rgb(Number(m[1]), Number(m[2]), Number(m[3])))
}
const light = (name: string): Rgb => values(name)[0]

describe('first-paint colors', () => {
  it('match the page color in styles.css', () => {
    const [lightPage, darkPage] = values('background').map(toHex)
    expect(BACKGROUND).toEqual({ light: lightPage, dark: darkPage })
  })

  it('are the theme-color metas in index.html', () => {
    const html = read('src/renderer/index.html')
    expect(html).toContain(`media="(prefers-color-scheme: light)" content="${BACKGROUND.light}"`)
    expect(html).toContain(`media="(prefers-color-scheme: dark)" content="${BACKGROUND.dark}"`)
  })
})

describe("the guide's diagrams", () => {
  it("use only the light theme's colors", () => {
    const card = light('card')
    const allowed = new Set([
      ...['background', 'card', 'foreground', 'muted-foreground', 'warning', 'destructive'].map(
        (name) => toHex(light(name)),
      ),
      // A control's edge, and a verdict's tint, as the app paints them on a card.
      over(light('foreground'), 0.2, card),
      over(light('warning'), 0.1, card),
      over(light('destructive'), 0.1, card),
    ])
    for (const file of ['docs/images/loop.svg', 'docs/images/which-to-change.svg'])
      for (const [color] of read(file).matchAll(/#[0-9a-fA-F]{6}\b/g))
        expect(allowed, `${file}: ${color}`).toContain(color.toUpperCase())
  })
})
