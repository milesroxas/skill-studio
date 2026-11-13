/**
 * Whether two pictures show the same thing: a picture an agent exported, and
 * the page beside it as the app drew it. When they do, what was measured on
 * the page holds for the picture. Pure: it is given pixels and reads no file.
 */

/** A picture's pixels, four bytes each: red, green, blue, alpha. */
interface Pixels {
  width: number
  height: number
  data: Uint8Array
}

/** How far one channel of a pixel may be off and still be the same colour: two tools round a colour a step apart. */
const CHANNEL_SLACK = 16

/**
 * The share of pixels two pictures may differ in and still be one picture.
 * Measured on real outputs: a picture and the drawing of its own page differ
 * in under 0.01% of their pixels, and a picture and the drawing of another
 * version of that page in 3% to 40%. A page drawn by another browser, with
 * the edges of its letters shaded another way, may pass this and not match:
 * its picture is then judged by eye, which is the safe way to be wrong.
 */
export const SAME_PICTURE = 0.01

/** One channel of a pixel as it shows on white, so a clear pixel and a white one are the same. */
const onWhite = (value: number, alpha: number): number =>
  (value * alpha + 255 * (255 - alpha)) / 255

/**
 * How many times larger `picture` is than `drawing`, when it is a whole
 * number of times larger on both sides, as an export at 2x is; else null.
 */
export function scaleOf(
  picture: { width: number; height: number },
  drawing: { width: number; height: number },
): number | null {
  const times = picture.width / drawing.width
  return Number.isInteger(times) && times >= 1 && picture.height === drawing.height * times
    ? times
    : null
}

/**
 * The share of `drawing`'s pixels that `picture` shows in another colour,
 * from 0 to 1; null when the two are not the same shape, so they cannot be
 * the same picture. A picture a whole number of times larger is read as the
 * mean of each block of its pixels.
 */
export function differing(picture: Pixels, drawing: Pixels): number | null {
  const times = scaleOf(picture, drawing)
  if (times === null) return null
  const block = times * times
  let off = 0
  for (let y = 0; y < drawing.height; y++)
    for (let x = 0; x < drawing.width; x++) {
      const at = (y * drawing.width + x) * 4
      const sums = [0, 0, 0]
      for (let dy = 0; dy < times; dy++)
        for (let dx = 0; dx < times; dx++) {
          const from = ((y * times + dy) * picture.width + x * times + dx) * 4
          const alpha = picture.data[from + 3]
          for (let c = 0; c < 3; c++) sums[c] += onWhite(picture.data[from + c], alpha)
        }
      const alpha = drawing.data[at + 3]
      if (
        sums.some(
          (sum, c) => Math.abs(sum / block - onWhite(drawing.data[at + c], alpha)) > CHANNEL_SLACK,
        )
      )
        off++
    }
  return off / (drawing.width * drawing.height)
}
