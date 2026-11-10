/** Word and line diffs by longest common subsequence, as escaped HTML. */
import { esc } from './markdown.ts'

/** Each token as a number, the same number for the same text: a table fills faster comparing numbers. */
function numbered<T>(x: T[], y: T[]): [Int32Array, Int32Array] {
  const ids = new Map<T, number>()
  const id = (token: T): number => {
    let n = ids.get(token)
    if (n === undefined) {
      n = ids.size
      ids.set(token, n)
    }
    return n
  }
  return [Int32Array.from(x, id), Int32Array.from(y, id)]
}

/**
 * The longest common subsequence of every pair of suffixes. A cell holds a
 * length, which is never more than the shorter list, so two lists under 65,536
 * tokens take half the memory a cell of 32 bits would.
 */
function lcs<T>(x: T[], y: T[]): Uint16Array | Uint32Array {
  const [a, b] = numbered(x, y)
  const cols = b.length + 1
  const cells = (a.length + 1) * cols
  const table =
    Math.min(a.length, b.length) < 2 ** 16 ? new Uint16Array(cells) : new Uint32Array(cells)
  for (let i = a.length - 1; i >= 0; i -= 1) {
    const row = i * cols
    const below = row + cols
    for (let j = b.length - 1; j >= 0; j -= 1)
      table[row + j] =
        a[i] === b[j] ? table[below + j + 1] + 1 : Math.max(table[below + j], table[row + j + 1])
  }
  return table
}

export type Op = 'same' | 'del' | 'ins'

/**
 * The most memory an LCS table may take: 20 MiB. The table is one cell per
 * pair of tokens, so two long texts would otherwise ask for gigabytes and stall
 * the window while they are filled. At two bytes a cell it holds two texts of
 * about 3,200 words that differ all through.
 */
export const DIFF_BUDGET = 20 * 1024 * 1024

/** The bytes the table for two token lists takes: two a cell while the shorter is under 65,536 tokens. */
const tableBytes = (x: number, y: number): number =>
  (x + 1) * (y + 1) * (Math.min(x, y) < 2 ** 16 ? 2 : 4)

/** How many tokens two lists share at their start, and at their end past that. */
function sharedEnds<T>(x: T[], y: T[]): { head: number; tail: number } {
  const most = Math.min(x.length, y.length)
  let head = 0
  while (head < most && x[head] === y[head]) head += 1
  let tail = 0
  while (tail < most - head && x[x.length - 1 - tail] === y[y.length - 1 - tail]) tail += 1
  return { head, tail }
}

/** Whether the parts of two token lists that differ fit one LCS table. */
function fits<T>(x: T[], y: T[]): boolean {
  const { head, tail } = sharedEnds(x, y)
  return tableBytes(x.length - head - tail, y.length - head - tail) <= DIFF_BUDGET
}

/**
 * The steps from `x` to `y`. What the two share at their start and end is set
 * aside first, so the table is only as large as the part that differs. A part
 * too large for the table is given whole: all of it removed, then all added.
 */
function diffTokens<T>(x: T[], y: T[]): Array<[Op, T]> {
  const { head, tail } = sharedEnds(x, y)
  const mx = x.slice(head, x.length - tail)
  const my = y.slice(head, y.length - tail)
  const middle =
    tableBytes(mx.length, my.length) > DIFF_BUDGET ? replaced(mx, my) : lcsSteps(mx, my)
  return [
    ...marked('same', x.slice(0, head)),
    ...middle,
    ...marked('same', x.slice(x.length - tail)),
  ]
}

/** Each token as one step of the same kind. */
const marked = <T>(op: Op, tokens: T[]): Array<[Op, T]> => tokens.map((token) => [op, token])

/** The steps from `x` to `y` when they are too large to compare: all of `x` removed, then all of `y` added. */
const replaced = <T>(x: T[], y: T[]): Array<[Op, T]> => [...marked('del', x), ...marked('ins', y)]

/**
 * The steps from `x` to `y`, read back from their LCS table: a token they
 * share is kept, and where they differ the step taken is the one that keeps
 * the longer common subsequence ahead, a removal when both keep as much.
 */
function lcsSteps<T>(x: T[], y: T[]): Array<[Op, T]> {
  const out: Array<[Op, T]> = []
  const cols = y.length + 1
  const table = lcs(x, y)
  let i = 0
  let j = 0
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      out.push(['same', x[i]])
      i += 1
      j += 1
    } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) {
      out.push(['del', x[i]])
      i += 1
    } else {
      out.push(['ins', y[j]])
      j += 1
    }
  }
  for (; i < x.length; i += 1) out.push(['del', x[i]])
  for (; j < y.length; j += 1) out.push(['ins', y[j]])
  return out
}

/** Words and the runs of space between them, each a token. */
const tokens = (text: string): string[] => text.match(/\s+|[^\s]+/g) ?? []

/** Each word with the space after it: half the tokens, so a table of them reaches twice as far. */
const words = (text: string): string[] => text.match(/^\s+|[^\s]+\s*/g) ?? []

/**
 * The steps from one text to the other, word by word. The words are matched
 * first, each with the space after it; each stretch where they differ is then
 * matched again token by token, so the space the two sides share in it is not
 * marked as changed.
 */
function diffWords(x: string[], y: string[]): Array<[Op, string]> {
  const out: Array<[Op, string]> = []
  let removed = ''
  let added = ''
  const settle = () => {
    if (removed || added) out.push(...diffTokens(tokens(removed), tokens(added)))
    removed = ''
    added = ''
  }
  for (const [op, word] of diffTokens(x, y)) {
    if (op === 'del') removed += word
    else if (op === 'ins') added += word
    else {
      settle()
      out.push(['same', word])
    }
  }
  settle()
  return out
}

/**
 * Removed words struck through, added words marked, as HTML. Null when the
 * two texts differ over too many words to compare one by one: the caller
 * shows them line by line instead.
 */
export function wordDiffHtml(before: string, after: string): string | null {
  const x = words(before)
  const y = words(after)
  if (!fits(x, y)) return null
  return diffWords(x, y)
    .map(([op, token]) => (op === 'same' ? esc(token) : `<${op}>${esc(token)}</${op}>`))
    .join('')
    .replace(/<\/del><del>/g, '')
    .replace(/<\/ins><ins>/g, '')
}

/** Two texts compared word by word, as HTML, or, when they differ over too many words, line by line. */
export type Compared = { kind: 'words'; html: string } | { kind: 'lines'; lines: DiffLine[] }

export const compareTexts = (before: string, after: string): Compared => {
  const html = wordDiffHtml(before, after)
  return html === null ? { kind: 'lines', lines: lineDiff(before, after) } : { kind: 'words', html }
}

/**
 * What a card comparing two outputs shows: that one of them is not text, the
 * comparison once it is read, else the read's failure or that it is on its way.
 */
export type DiffShown =
  | Compared
  | { kind: 'not-text' }
  | { kind: 'failed'; error: string }
  | { kind: 'loading' }

export function diffShown(
  textual: boolean,
  compared: Compared | null,
  error: string | null,
): DiffShown {
  if (!textual) return { kind: 'not-text' }
  if (compared) return compared
  return error ? { kind: 'failed', error } : { kind: 'loading' }
}

export interface DiffLine {
  /** Position in the diff, the line's identity for rendering. */
  n: number
  op: Op | 'fold'
  text: string
}

/** Line diff with unchanged runs folded to the three lines around a change. */
export function lineDiff(before: string, after: string, context = 3): DiffLine[] {
  const ops = diffTokens(before.split('\n'), after.split('\n')).map(([op, text]) => ({
    op,
    text,
  }))
  if (!ops.some((l) => l.op !== 'same')) return []
  const keep = new Array<boolean>(ops.length).fill(false)
  ops.forEach((line, i) => {
    if (line.op === 'same') return
    for (let k = Math.max(0, i - context); k <= Math.min(ops.length - 1, i + context); k += 1)
      keep[k] = true
  })
  const out: DiffLine[] = []
  let folded = false
  ops.forEach((line, i) => {
    if (keep[i]) {
      out.push({ n: out.length, ...line })
      folded = false
    } else if (!folded) {
      out.push({ n: out.length, op: 'fold', text: '' })
      folded = true
    }
  })
  return out
}

/** A diff line as text: `+` added, `-` removed, an ellipsis where unchanged lines are folded. */
export const diffLineText = (line: DiffLine): string =>
  line.op === 'fold'
    ? '   …'
    : `${line.op === 'ins' ? '+ ' : line.op === 'del' ? '- ' : '  '}${line.text}`

/** How much changed, in a few words. An empty side means the file is not there. */
export const changeSummary = (before: string, after: string, lines: DiffLine[]): string =>
  !before
    ? 'added'
    : !after
      ? 'removed'
      : lines.length
        ? `${lines.filter((l) => l.op === 'ins').length} added, ${lines.filter((l) => l.op === 'del').length} removed`
        : 'unchanged'
