import { describe, expect, it } from 'vitest'
import { differing, SAME_PICTURE, scaleOf } from './picture-match.ts'

type Colour = [number, number, number, number]
const picture = (width: number, height: number, colour: (x: number, y: number) => Colour) => {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set(colour(x, y), (y * width + x) * 4)
  return { width, height, data }
}
const INK: Colour = [10, 12, 17, 255]
const PAPER: Colour = [244, 242, 235, 255]

describe('scaleOf', () => {
  it('is how many whole times larger a picture is than a drawing, on both sides', () => {
    const drawing = { width: 1536, height: 864 }
    expect(scaleOf({ width: 1536, height: 864 }, drawing)).toBe(1)
    expect(scaleOf({ width: 3072, height: 1728 }, drawing)).toBe(2)
    expect(scaleOf({ width: 3072, height: 864 }, drawing)).toBeNull()
    expect(scaleOf({ width: 2000, height: 1125 }, drawing)).toBeNull()
    expect(scaleOf({ width: 768, height: 432 }, drawing)).toBeNull()
  })
})

describe('differing', () => {
  const drawing = picture(20, 10, (x) => (x < 10 ? INK : PAPER))

  it('is 0 for the same picture, and for one a rounding step off in every pixel', () => {
    expect(differing(drawing, drawing)).toBe(0)
    const rounded = picture(20, 10, (x) => (x < 10 ? [14, 9, 20, 255] : [240, 245, 231, 255]))
    expect(differing(rounded, drawing)).toBe(0)
  })

  it('is the share of pixels that show another colour', () => {
    // A block moved two pixels along: two columns in twenty are another colour.
    const moved = picture(20, 10, (x) => (x < 12 ? INK : PAPER))
    expect(differing(moved, drawing)).toBeCloseTo(0.1)
    expect(differing(moved, drawing)).toBeGreaterThan(SAME_PICTURE)
  })

  it('reads a picture twice the size as the mean of each block of its pixels', () => {
    const twice = picture(40, 20, (x) => (x < 20 ? INK : PAPER))
    expect(differing(twice, drawing)).toBe(0)
    const twiceMoved = picture(40, 20, (x) => (x < 24 ? INK : PAPER))
    expect(differing(twiceMoved, drawing)).toBeCloseTo(0.1)
  })

  it('takes a clear pixel for a white one', () => {
    const clear = picture(20, 10, (x) => (x < 10 ? INK : [0, 0, 0, 0]))
    const white = picture(20, 10, (x) => (x < 10 ? INK : [255, 255, 255, 255]))
    expect(differing(clear, white)).toBe(0)
  })

  it('cannot say of two pictures of another shape', () => {
    expect(
      differing(
        picture(21, 10, () => INK),
        drawing,
      ),
    ).toBeNull()
    expect(
      differing(
        picture(10, 5, () => INK),
        drawing,
      ),
    ).toBeNull()
  })
})
