/**
 * Where pictures are kept. One just added waits in `~/.skill-studio/uploads/`
 * under a name made from its bytes, so the same picture added twice is one
 * file; saving a case copies it into the case folder. A picture is then found
 * by its `ImageRef`: an upload id, or a path inside the skill.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type ImageRef,
  type ImageUpload,
  imageSize,
  imageTypeOf,
  jevImageProblem,
} from '@domain/image.ts'
import { isWithin } from '@domain/paths.ts'
import { assertInside, isFile, listFiles } from './fs.ts'
import { STUDIO_DIR } from './library.ts'

const UPLOADS = join(STUDIO_DIR, 'uploads')
const UPLOAD_ID = /^[0-9a-f]{24}\.(png|jpg)$/

/** An upload nothing has used for this long is removed: a draft or a conversation left that long ago. */
const KEPT_MS = 30 * 86_400_000

function prune(now: number): void {
  for (const name of listFiles(UPLOADS)) {
    const path = join(UPLOADS, name)
    if (now - statSync(path).mtimeMs > KEPT_MS) rmSync(path, { force: true })
  }
}

/** Where an upload is on disk. Throws for an id that is not one, or whose file is gone. */
export function uploadPath(id: string): string {
  const path = join(UPLOADS, id)
  if (!UPLOAD_ID.test(id) || !isFile(path))
    throw new Error('That picture is no longer kept. Add it again.')
  return path
}

/**
 * Keep a picture the page sent. Only a PNG or JPEG inside Jev's size limits is
 * kept, so every upload can go to the judge as it is; the page resizes before
 * it sends, and any other client is told what is wrong.
 */
export function saveUpload({ name, data }: ImageUpload): ImageRef {
  const bytes = new Uint8Array(Buffer.from(data, 'base64'))
  const problem = jevImageProblem(bytes)
  const size = imageSize(bytes)
  if (problem || !size) throw new Error(`Could not add ${name || 'the picture'}: ${problem}.`)
  const id = `${createHash('sha256').update(bytes).digest('hex').slice(0, 24)}.${size.format}`
  mkdirSync(UPLOADS, { recursive: true })
  prune(Date.now())
  writeFileSync(join(UPLOADS, id), bytes)
  return { name: name || id, file: null, upload: id }
}

/** A picture on disk, with the media type a model is told it has. */
export interface StoredImage {
  name: string
  path: string
  type: string
}

/**
 * Find the file an `ImageRef` names. A saved picture must be an image inside
 * `skillDir`; an upload is marked as used, so it is kept while something
 * still shows it. Throws when there is no such picture.
 */
export function findImage(skillDir: string | null, ref: ImageRef): StoredImage {
  if (ref.upload) {
    const path = uploadPath(ref.upload)
    const now = new Date()
    utimesSync(path, now, now)
    return { name: ref.name, path, type: imageTypeOf(path) ?? '' }
  }
  const path = skillDir && ref.file ? join(skillDir, ref.file) : ''
  const type = imageTypeOf(path)
  if (!skillDir || !type || !isWithin(path, skillDir) || !isFile(path))
    throw new Error(`No picture at ${ref.file ?? 'that path'}.`)
  // A link inside the skill that leads out of it is not one of the skill's pictures.
  return { name: ref.name, path: assertInside(skillDir, path), type }
}

export const readImage = (image: StoredImage): Uint8Array =>
  new Uint8Array(readFileSync(image.path))

/** The picture's bytes in base64, the form every model API takes them in. */
export const imageBase64 = (image: StoredImage): string =>
  readFileSync(image.path).toString('base64')
