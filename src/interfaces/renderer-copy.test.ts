import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Words that name how the app works, which its text never uses: docs/design/copy.md
 * says what to write in their place. Each is looked for in the text a reader
 * can see, not in the names the code uses.
 */
const PLUMBING: ReadonlyArray<[word: RegExp, say: string]> = [
  [/\b(on|from) disk\b/i, '"saved", "outside the app", or nothing'],
  [/\bcode checks?\b/i, 'what is missing: "no rule or check is marked"'],
  [/\bproviders?\b/i, 'the thing itself: "Claude Code or Codex", "the assistant"'],
  [/\bkeychain\b/i, '"stored on this computer"'],
  [/\bsnapshots?\b/i, '"past runs"'],
]

const ROOT = join(import.meta.dirname, '../renderer')

/** Every source file of the renderer, tests left out. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : []
  })
}

/** The text of a source file a reader could be shown: quoted strings and the text between tags, of three words or more. */
function shown(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1')
    .replace(/^import [\s\S]*?from '[^']*'$/gm, '')
  const found: string[] = []
  const strings = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g
  for (const match of code.matchAll(strings)) found.push(match[1] ?? match[2] ?? match[3] ?? '')
  for (const match of code.matchAll(/>([^<>{}]*[A-Za-z]{3}[^<>{}]*)(?=[<{])/g))
    found.push(match[1] ?? '')
  return (
    found
      .map((text) => text.replace(/\s+/g, ' ').trim())
      // Code between two tags, such as the arm of a ternary, is not text.
      .filter(
        (text) => text.split(' ').length >= 3 && !/[;=]|=>|\bconst\b|\breturn\b|^\)|\($/.test(text),
      )
  )
}

describe('the app’s words', () => {
  it('never name how the app works', () => {
    const slips = sources(ROOT).flatMap((path) =>
      shown(readFileSync(path, 'utf8')).flatMap((text) =>
        PLUMBING.filter(([word]) => word.test(text)).map(
          ([, say]) => `${path.slice(ROOT.length + 1)}: “${text}”. Say ${say}.`,
        ),
      ),
    )
    expect(slips).toEqual([])
  })
})
