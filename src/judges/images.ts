/**
 * Pictures on their way to Jev. Jev reads PNG and JPEG inside fixed size
 * limits and fails the whole request for one picture outside them, so each
 * file is checked first and one that would be refused is left out, with the
 * reason, in place of losing every answer asked with it.
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { jevImageProblem } from '@domain/image.ts'
import { Image, image } from '@typesafe-ai/sdk'

/** A picture Jev can read, or the reason this file is not one. */
export type Readable = { image: Image; problem: null } | { image: null; problem: string }

export function readForJev(path: string): Readable {
  if (!existsSync(path)) return { image: null, problem: 'the file is missing' }
  const bytes = readFileSync(path)
  const problem = jevImageProblem(bytes)
  return problem ? { image: null, problem } : { image: image(bytes), problem: null }
}

/** A picture that came with a case's request, ready to send. */
export interface RequestImage {
  name: string
  image: Image
}

/** The pictures among `paths` that Jev can read; each one left out is logged with its reason. */
export function requestImages(paths: string[], log: (line: string) => void): RequestImage[] {
  return paths.flatMap((path) => {
    const name = basename(path)
    const read = readForJev(path)
    if (read.image) return [{ name, image: read.image }]
    log(`${name} is not shown to Jev: ${read.problem}.`)
    return []
  })
}

/**
 * True when a request's state or questions hold a picture anywhere, however
 * deep. Text made with `withAssets` keeps its pictures in a list of its own,
 * so the same walk finds them.
 */
export function holdsImage(value: unknown): boolean {
  if (value instanceof Image) return true
  if (Array.isArray(value)) return value.some(holdsImage)
  if (value && typeof value === 'object') return Object.values(value).some(holdsImage)
  return false
}
