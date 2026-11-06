import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BACKGROUND } from './paint.ts'

const ROOT = join(import.meta.dirname, '../../../..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

/** oklch() to an sRGB hex, as a browser paints it. */
function hex(l: number, c: number, h: number): string {
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
  return `#${linear
    .map((x) =>
      Math.round(encode(x) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`
}

/** Every --background in styles.css, in order: the light scope, then the dark one. */
function backgrounds(): string[] {
  const css = read('src/renderer/styles.css')
  return [...css.matchAll(/--background: oklch\(([\d.]+) ([\d.]+) ([\d.]+)\);/g)].map((m) =>
    hex(Number(m[1]), Number(m[2]), Number(m[3])),
  )
}

describe('first-paint colors', () => {
  it('match the page color in styles.css', () => {
    const [light, dark] = backgrounds()
    expect(BACKGROUND).toEqual({ light, dark })
  })

  it('are the theme-color metas in index.html', () => {
    const html = read('src/renderer/index.html')
    expect(html).toContain(`media="(prefers-color-scheme: light)" content="${BACKGROUND.light}"`)
    expect(html).toContain(`media="(prefers-color-scheme: dark)" content="${BACKGROUND.dark}"`)
  })
})
