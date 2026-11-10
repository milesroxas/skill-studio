/** Ways for tests, and only for tests, to make the file system fail or report what it was asked. */
import { createRequire, syncBuiltinESMExports } from 'node:module'

type Fs = typeof import('node:fs')
const fs = createRequire(import.meta.url)('node:fs') as Record<keyof Fs, unknown>

/** Swap one function of `node:fs` for the one `make` builds from it, imports included, until the returned function is called. */
export function patchFs<K extends keyof Fs>(name: K, make: (real: Fs[K]) => Fs[K]): () => void {
  const real = fs[name] as Fs[K]
  fs[name] = make(real)
  syncBuiltinESMExports()
  return () => {
    fs[name] = real
    syncBuiltinESMExports()
  }
}

/** Make each rename `fails` picks throw EBUSY, as a file a virus scanner or an editor holds does. */
export const failRenames = (fails: (from: string, to: string) => boolean): (() => void) =>
  patchFs('renameSync', (real) => (from, to) => {
    if (fails(String(from), String(to)))
      throw Object.assign(new Error(`EBUSY: resource busy or locked, rename '${from}'`), {
        code: 'EBUSY',
      })
    real(from, to)
  })
