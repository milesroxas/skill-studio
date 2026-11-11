/**
 * Where input files picked for a case wait until it is saved, as pictures do:
 * one folder for each pick under `~/.skill-studio/uploads/inputs/`, named
 * from its bytes, so the same pick made twice is one copy. Saving the case
 * copies the pick into the case's `files/`.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { imageTypeOf } from '@domain/image.ts'
import {
  type InputPick,
  type InputUpload,
  inputLimitProblem,
  skippedInput,
} from '@domain/inputs.ts'
import { assertSafePath, isDir, listDirs } from './fs.ts'
import { STUDIO_DIR } from './library.ts'

const INPUTS = join(STUDIO_DIR, 'uploads', 'inputs')
const INPUT_ID = /^[0-9a-f]{24}$/

/** A pick nothing has used for this long is removed: a draft left that long ago. */
const KEPT_MS = 30 * 86_400_000

function prune(now: number): void {
  for (const name of listDirs(INPUTS)) {
    const path = join(INPUTS, name)
    if (now - statSync(path).mtimeMs > KEPT_MS) rmSync(path, { recursive: true, force: true })
  }
}

/**
 * Where a kept pick is on disk: the folder that holds the entry under its own
 * name. Marked as used, so it is kept while a draft still names it. Throws for
 * an id that is not one, or whose copy is gone.
 */
export function inputUploadPath(id: string): string {
  const path = join(INPUTS, id)
  if (!INPUT_ID.test(id) || !isDir(path))
    throw new Error('A file you added is no longer kept. Add it again.')
  const now = new Date()
  utimesSync(path, now, now)
  return path
}

/**
 * Keep a pick the page sent. Its name is one file or folder name; each file's
 * path starts with it, and a picture alone is sent as one of the case's
 * pictures, which makes it one the judge can read.
 */
export function saveInputUpload({ name, files }: InputPick): InputUpload {
  if (name.includes('/')) throw new Error('Bad file name.')
  assertSafePath(name, 'file name')
  if (!files.length) throw new Error(`${name} holds no files.`)
  const folder = files.some((f) => f.path !== name)
  if (!folder && imageTypeOf(name))
    throw new Error(`${name} is a picture. Add it as one of the case’s pictures.`)
  const decoded = files.map((f) => {
    const path = assertSafePath(f.path, 'file path')
    if ((path !== name && !path.startsWith(`${name}/`)) || skippedInput(path))
      throw new Error(`${path} is not in ${name}.`)
    return { path, bytes: new Uint8Array(Buffer.from(f.data, 'base64')) }
  })
  const problem = inputLimitProblem(
    decoded.length,
    decoded.reduce((sum, f) => sum + f.bytes.length, 0),
  )
  if (problem) throw new Error(problem)
  const hash = createHash('sha256')
  for (const f of [...decoded].sort((a, b) => a.path.localeCompare(b.path, 'en'))) {
    hash.update(f.path).update('\0').update(f.bytes).update('\0')
  }
  const id = hash.digest('hex').slice(0, 24)
  mkdirSync(INPUTS, { recursive: true })
  prune(Date.now())
  const dir = join(INPUTS, id)
  rmSync(dir, { recursive: true, force: true })
  for (const f of decoded) {
    const dest = join(dir, f.path)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, f.bytes)
  }
  return { name, upload: id, files: decoded.length, folder }
}
