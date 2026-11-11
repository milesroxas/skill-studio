/**
 * Pictures in the app: one attached to a case, a check or a request to the
 * assistant. A picture is either a file in the skill's folder or an upload the
 * app holds until something saves it. Jev reads PNG and JPEG inside fixed
 * size limits and rejects the whole request for one picture outside them, so
 * the limits are stated here once and checked before anything is sent.
 * Pure: the page, the backend and the judges all read these.
 */

/** A picture by where it is kept: saved in the skill (`file`) or just added (`upload`). */
export interface ImageRef {
  /** The file name the writer gave it, shown beside it and read to assistive technology. */
  name: string
  /** Skill-relative path of a saved picture; null for one not saved yet. */
  file: string | null
  /** Id of an upload the app holds; null for a saved picture. */
  upload: string | null
}

/** A picture as the page sends it for keeping: the file's bytes in base64, with no `data:` prefix. */
export interface ImageUpload {
  name: string
  data: string
}

/** The most pictures one request to a model or one case carries. */
export const MAX_IMAGES = 6

/** What Jev accepts, from docs.typesafe.ai/images. Both ends are inclusive. */
export const JEV_IMAGE = {
  minSide: 280,
  maxSide: 1568,
  maxBytes: 16 * 1024 * 1024,
} as const

/** Why Jev refuses a picture by its size in bytes alone. */
export const JEV_TOO_LARGE = 'it is larger than 16 MB'

/** How much of a picture holds its size, whatever its format: the header and the segments before it. */
export const PICTURE_HEAD_BYTES = 1024 * 1024

export type ImageFormat = 'png' | 'jpg'

export interface ImageSize {
  format: ImageFormat
  width: number
  height: number
}

const MEDIA_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

const extensionOf = (path: string): string => /\.([a-z0-9]+)$/i.exec(path)?.[1].toLowerCase() ?? ''

/** The media type of a picture a model can read, by its file name; null for any other file. */
export const imageTypeOf = (path: string): string | null => {
  const extension = extensionOf(path)
  return Object.hasOwn(MEDIA_TYPES, extension) ? MEDIA_TYPES[extension] : null
}

/** A PNG or JPEG by name: the two formats Jev reads. */
export const isJevFormat = (path: string): boolean => /^(png|jpe?g)$/.test(extensionOf(path))

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** JPEG markers that open a frame header, which holds the picture's height and width. */
const isFrameStart = (marker: number): boolean =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc

function jpegSize(bytes: Uint8Array): ImageSize | null {
  let at = 2
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null
    const marker = bytes[at + 1]
    // Fill bytes before a marker, and markers that stand alone, carry no length.
    if (marker === 0xff) {
      at += 1
      continue
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      at += 2
      continue
    }
    if (isFrameStart(marker))
      return {
        format: 'jpg',
        height: (bytes[at + 5] << 8) | bytes[at + 6],
        width: (bytes[at + 7] << 8) | bytes[at + 8],
      }
    at += 2 + ((bytes[at + 2] << 8) | bytes[at + 3])
  }
  return null
}

/**
 * The format and pixel size of a PNG or JPEG, read from the file's own header.
 * Null for anything else, a file named `.png` that is not one included.
 */
export function imageSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length >= 24 && PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { format: 'png', width: view.getUint32(16), height: view.getUint32(20) }
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return jpegSize(bytes)
  return null
}

/**
 * Why Jev would refuse this picture, as a line the writer can act on; null
 * when it fits. Jev never resizes: one picture outside the limits fails every
 * question asked with it.
 */
export function jevImageProblem(bytes: Uint8Array): string | null {
  const size = imageSize(bytes)
  if (!size) return 'it is not a PNG or JPEG'
  const { minSide, maxSide, maxBytes } = JEV_IMAGE
  if (bytes.length > maxBytes) return JEV_TOO_LARGE
  const { width, height } = size
  if (Math.min(width, height) < minSide || Math.max(width, height) > maxSide)
    return `it is ${width} × ${height} px, and Jev reads ${minSide} to ${maxSide} px a side`
  return null
}

/**
 * The size to draw a picture at so Jev accepts it: scaled down until the long
 * side fits, or up until the short side does. `width` and `height` are the
 * canvas, `drawWidth` and `drawHeight` the picture on it; they differ only for
 * a strip too long and thin to fit both limits, which is centred on a canvas
 * of the smallest allowed side.
 */
export function fitForJev(
  width: number,
  height: number,
): { width: number; height: number; drawWidth: number; drawHeight: number } {
  const { minSide, maxSide } = JEV_IMAGE
  const long = Math.max(width, height)
  const short = Math.min(width, height)
  const wanted = long > maxSide ? maxSide / long : short < minSide ? minSide / short : 1
  // Scaling the short side up may push the long side past its limit: the long side wins, so the shape is kept.
  const scale = Math.min(wanted, maxSide / long)
  const drawWidth = Math.min(maxSide, Math.max(1, Math.round(width * scale)))
  const drawHeight = Math.min(maxSide, Math.max(1, Math.round(height * scale)))
  return {
    width: Math.max(minSide, drawWidth),
    height: Math.max(minSide, drawHeight),
    drawWidth,
    drawHeight,
  }
}

/** A file name safe to keep in a case folder: the name's own words, lowercased, with its extension. */
export function imageFileName(name: string, format: ImageFormat): string {
  const stem = name
    .replace(/\.[a-z0-9]+$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return `${stem || 'image'}.${format}`
}

const sameImage = (a: ImageRef, b: ImageRef): boolean => a.file === b.file && a.upload === b.upload

/** `images` with `added` at the end, leaving out any already there and anything past the limit. */
export const addImages = (images: ImageRef[], added: ImageRef[]): ImageRef[] =>
  [...images, ...added.filter((a) => !images.some((i) => sameImage(i, a)))].slice(0, MAX_IMAGES)

/** A GIF's logical screen size, little-endian after the six-byte signature. */
function gifSize(bytes: Uint8Array): [number, number] | null {
  const head = String.fromCharCode(...bytes.subarray(0, 6))
  if ((head !== 'GIF87a' && head !== 'GIF89a') || bytes.length < 10) return null
  return [bytes[6] | (bytes[7] << 8), bytes[8] | (bytes[9] << 8)]
}

/** A WebP's size from its first chunk: lossy (VP8), lossless (VP8L) or extended (VP8X). */
function webpSize(bytes: Uint8Array): [number, number] | null {
  const text = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to))
  if (bytes.length < 30 || text(0, 4) !== 'RIFF' || text(8, 12) !== 'WEBP') return null
  const chunk = text(12, 16)
  const b = (i: number) => bytes[i]
  if (chunk === 'VP8X')
    return [1 + (b(24) | (b(25) << 8) | (b(26) << 16)), 1 + (b(27) | (b(28) << 8) | (b(29) << 16))]
  if (chunk === 'VP8L') {
    const bits = b(21) | (b(22) << 8) | (b(23) << 16) | (b(24) << 24)
    return [1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff)]
  }
  if (chunk === 'VP8 ') return [(b(26) | (b(27) << 8)) & 0x3fff, (b(28) | (b(29) << 8)) & 0x3fff]
  return null
}

/** An SVG's size: its root's `width` and `height` in pixels, else its `viewBox`. */
function svgSize(bytes: Uint8Array): [number, number] | null {
  const root = /<svg\b[^>]*>/i.exec(new TextDecoder().decode(bytes.subarray(0, 4096)))?.[0]
  if (!root) return null
  const attr = (name: string) =>
    new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(root)?.[1]
  const px = (value: string | undefined) => {
    const match = value ? /^\s*([\d.]+)\s*(px)?\s*$/.exec(value) : null
    return match ? Math.round(Number(match[1])) : null
  }
  const width = px(attr('width'))
  const height = px(attr('height'))
  if (width && height) return [width, height]
  const box = attr('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number)
  return box?.length === 4 && box[2] > 0 && box[3] > 0
    ? [Math.round(box[2]), Math.round(box[3])]
    : null
}

/**
 * A picture's width and height in pixels, read from the file itself: PNG,
 * JPEG, GIF, WebP and SVG. Null for a file whose size cannot be read.
 */
export function pictureSize(bytes: Uint8Array, path: string): [number, number] | null {
  const read = imageSize(bytes)
  if (read) return [read.width, read.height]
  if (extensionOf(path) === 'svg') return svgSize(bytes)
  return gifSize(bytes) ?? webpSize(bytes)
}
