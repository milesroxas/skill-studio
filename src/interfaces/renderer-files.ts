/**
 * Which file of the built renderer a URL path names. The desktop app's scheme
 * and `st serve` both serve that folder, so both ask here and answer alike.
 */
import { join } from 'node:path'
import { isWithin } from '@domain/paths.ts'
import { isFile } from '@infrastructure/fs.ts'

export interface RendererFile {
  path: string
  /** A page: it is sent with the Content Security Policy and its own style nonce. */
  html: boolean
  /** Under `assets/`, where Vite names a file by its content hash, so it never changes under one URL. */
  hashed: boolean
}

/**
 * The file `pathname` names in `dir`, or null for a path outside it or one
 * that does not decode: those are not found. A path that names no file gets
 * `index.html`, since the app routes by hash and any address is the page.
 */
export function rendererFile(dir: string, pathname: string): RendererFile | null {
  let wanted: string
  try {
    wanted = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (wanted.includes('\0')) return null
  const named = join(dir, wanted)
  if (!isWithin(named, dir)) return null
  const path = isFile(named) ? named : join(dir, 'index.html')
  return {
    path,
    html: path.endsWith('.html'),
    hashed: isWithin(path, join(dir, 'assets')),
  }
}
