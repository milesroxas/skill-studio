/**
 * Reads a PNG's pixels, to tell whether two pictures show the same thing: the
 * picture an agent exported and the page the app drew from the file beside it.
 * It reads what a browser or a screenshot tool writes: 8 bits a channel, not
 * interlaced. Anything else is not read, and the pictures are not compared.
 *
 * The file is one an agent wrote, so nothing in it is trusted: its size is
 * held to a limit before any memory is asked for, and its data is inflated to
 * no more than its header says it holds.
 */
import { inflateSync } from 'node:zlib'

/** A picture's pixels, four bytes each: red, green, blue, alpha. */
export interface Pixels {
  width: number
  height: number
  data: Uint8Array
}

/** The most pixels a side, and in all, a picture is read at: past it, it is not compared. */
const SIDE_MAX = 10_000
const PIXELS_MAX = 40_000_000

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** The channels a pixel has, by PNG colour type. A palette entry is one byte. */
const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

/** Undo one scanline's filter in place; `prior` is the line above, already undone. */
function unfilter(
  type: number,
  line: Uint8Array,
  prior: Uint8Array | null,
  bytes: number,
): boolean {
  for (let i = 0; i < line.length; i++) {
    const left = i >= bytes ? line[i - bytes] : 0
    const up = prior ? prior[i] : 0
    const corner = prior && i >= bytes ? prior[i - bytes] : 0
    let add: number
    if (type === 0) return true
    if (type === 1) add = left
    else if (type === 2) add = up
    else if (type === 3) add = (left + up) >> 1
    else if (type === 4) {
      const estimate = left + up - corner
      const [byLeft, byUp, byCorner] = [left, up, corner].map((v) => Math.abs(estimate - v))
      add = byLeft <= byUp && byLeft <= byCorner ? left : byUp <= byCorner ? up : corner
    } else return false
    line[i] = (line[i] + add) & 0xff
  }
  return true
}

/** The pixels of a PNG, or null when it is not one this reads. */
export function readPng(file: Uint8Array): Pixels | null {
  if (file.length < 33 || SIGNATURE.some((byte, i) => file[i] !== byte)) return null
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  let width = 0
  let height = 0
  let colour = -1
  let palette: Uint8Array | null = null
  let clear: Uint8Array | null = null
  const data: Uint8Array[] = []
  for (let at = 8; at + 12 <= file.length; ) {
    const length = view.getUint32(at)
    const type = String.fromCharCode(...file.subarray(at + 4, at + 8))
    const body = file.subarray(at + 8, at + 8 + length)
    if (body.length !== length) return null
    if (type === 'IHDR') {
      if (length !== 13) return null
      width = view.getUint32(at + 8)
      height = view.getUint32(at + 12)
      colour = body[9]
      // 8 bits a channel, no interlacing: what a browser and a screenshot tool write.
      if (body[8] !== 8 || body[10] !== 0 || body[11] !== 0 || body[12] !== 0) return null
    } else if (type === 'PLTE') palette = body
    else if (type === 'tRNS') clear = body
    else if (type === 'IDAT') data.push(body)
    else if (type === 'IEND') break
    at += 12 + length
  }
  const channels = CHANNELS[colour]
  if (!channels || width < 1 || height < 1) return null
  if (width > SIDE_MAX || height > SIDE_MAX || width * height > PIXELS_MAX) return null
  if (colour === 3 && !palette) return null
  const stride = width * channels
  let raw: Uint8Array
  try {
    raw = inflateSync(Buffer.concat(data), { maxOutputLength: (stride + 1) * height })
  } catch {
    return null
  }
  if (raw.length !== (stride + 1) * height) return null

  const out = new Uint8Array(width * height * 4)
  let prior: Uint8Array | null = null
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1)
    const line = raw.subarray(start + 1, start + 1 + stride)
    if (!unfilter(raw[start], line, prior, channels)) return null
    prior = line
    for (let x = 0; x < width; x++) {
      const to = (y * width + x) * 4
      const from = x * channels
      if (colour === 2 || colour === 6) {
        out[to] = line[from]
        out[to + 1] = line[from + 1]
        out[to + 2] = line[from + 2]
        out[to + 3] = colour === 6 ? line[from + 3] : 255
      } else if (colour === 3 && palette) {
        const entry = line[from]
        out[to] = palette[entry * 3] ?? 0
        out[to + 1] = palette[entry * 3 + 1] ?? 0
        out[to + 2] = palette[entry * 3 + 2] ?? 0
        out[to + 3] = clear?.[entry] ?? 255
      } else {
        out[to] = out[to + 1] = out[to + 2] = line[from]
        out[to + 3] = colour === 4 ? line[from + 1] : 255
      }
    }
  }
  return { width, height, data: out }
}
