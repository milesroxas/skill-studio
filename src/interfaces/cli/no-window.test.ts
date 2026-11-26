/**
 * The processes the command line starts with no window on purpose: the
 * drawing host, the remover the host leaves to take its profile folder, and
 * the server `st open` starts. On Windows each would open a console of its
 * own without `windowsHide`, so every `spawn` in the files that start them
 * passes it.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '../../..')
const FILES = [
  'src/interfaces/cli/drawing.ts',
  'src/interfaces/electron/draw/profile.ts',
  'src/interfaces/cli/open-server.ts',
]

/** The text of each `spawn(...)` call in `source`, its parentheses matched. */
function spawnCalls(source: string): string[] {
  const calls: string[] = []
  for (const found of source.matchAll(/\bspawn\(/g)) {
    let depth = 0
    for (let at = found.index + 'spawn'.length; at < source.length; at++) {
      if (source[at] === '(') depth++
      else if (source[at] === ')' && --depth === 0) {
        calls.push(source.slice(found.index, at + 1))
        break
      }
    }
  }
  return calls
}

describe('a process started with no window', () => {
  it.each(FILES)('is started with windowsHide in %s', (file) => {
    const calls = spawnCalls(readFileSync(resolve(ROOT, file), 'utf8'))
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) expect(call).toMatch(/\bwindowsHide: true\b/)
  })
})
