/** Pictures for tests, and only for tests: enough of a file for its size to be read, and no more. */

/** The first bytes of a PNG: its signature and the header chunk that holds its size. */
export const pngHeader = (width: number, height: number): Uint8Array => {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

/** A PNG's header followed by more chunks before its pixels, each as `[type, data]`: an `acTL` makes it animated. */
export const pngWith = (
  width: number,
  height: number,
  chunks: Array<[string, Uint8Array]>,
): Uint8Array => {
  const parts = chunks.map(([type, data]) => {
    const chunk = new Uint8Array(12 + data.length)
    new DataView(chunk.buffer).setUint32(0, data.length)
    chunk.set(
      [...type].map((c) => c.charCodeAt(0)),
      4,
    )
    chunk.set(data, 8)
    return chunk
  })
  const head = pngHeader(width, height)
  const bytes = new Uint8Array(head.length + parts.reduce((n, p) => n + p.length, 0))
  bytes.set(head)
  let at = head.length
  for (const part of parts) {
    bytes.set(part, at)
    at += part.length
  }
  return bytes
}

/** A TIFF block, as an Exif note holds one, that names an orientation and nothing else. */
export const exifOrientation = (orientation: number): Uint8Array =>
  new Uint8Array([
    0x4d,
    0x4d,
    0,
    42,
    0,
    0,
    0,
    8,
    0,
    1,
    0x01,
    0x12,
    0,
    3,
    0,
    0,
    0,
    1,
    0,
    orientation,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ])

/**
 * A JPEG up to its frame header: `frame` is the frame's marker (0xc0 saved in
 * one pass, 0xc2 in passes), and `exif` the TIFF block of an Exif segment
 * before it, as cameras write one.
 */
export const jpegWith = (
  width: number,
  height: number,
  { frame = 0xc0, exif }: { frame?: number; exif?: Uint8Array } = {},
): Uint8Array => {
  const app1 = exif
    ? [
        0xff,
        0xe1,
        (exif.length + 8) >> 8,
        (exif.length + 8) & 0xff,
        0x45,
        0x78,
        0x69,
        0x66,
        0,
        0,
        ...exif,
      ]
    : []
  return new Uint8Array([
    0xff,
    0xd8,
    ...app1,
    0xff,
    frame,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x03,
    0,
    0,
    0,
  ])
}
