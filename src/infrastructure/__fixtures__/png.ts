/** Writes a PNG for a test: 8 bits a channel, RGBA, no filter. Not for the app, which only reads them. */
import { deflateSync } from 'node:zlib'

const TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

const crc = (bytes: Uint8Array): number => {
  let c = 0xffffffff
  for (const byte of bytes) c = TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, body.length)
  out.set(
    [...type].map((letter) => letter.charCodeAt(0)),
    4,
  )
  out.set(body, 8)
  view.setUint32(8 + body.length, crc(out.subarray(4, 8 + body.length)))
  return out
}

/** A PNG of `width` by `height` whose pixel at (x, y) is `colour(x, y)`, as red, green, blue, alpha. */
export function pngOf(
  width: number,
  height: number,
  colour: (x: number, y: number) => [number, number, number, number],
  header: { depth?: number; interlace?: number } = {},
): Uint8Array {
  const raw = new Uint8Array((width * 4 + 1) * height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) raw.set(colour(x, y), y * (width * 4 + 1) + 1 + x * 4)
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr.set([header.depth ?? 8, 6, 0, 0, header.interlace ?? 0], 8)
  return Buffer.concat([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array()),
  ])
}
