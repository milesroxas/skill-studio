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
const JEV_IMAGE = {
  minSide: 280,
  maxSide: 1568,
  maxBytes: 16 * 1024 * 1024,
} as const

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
export const imageTypeOf = (path: string): string | null => MEDIA_TYPES[extensionOf(path)] ?? null

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
  if (bytes.length > maxBytes) return 'it is larger than 16 MB'
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
  const scale = long > maxSide ? maxSide / long : short < minSide ? minSide / short : 1
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
