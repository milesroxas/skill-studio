/** Word and line diffs by longest common subsequence, as escaped HTML. */
import { esc } from './markdown.ts'

function lcs<T>(x: T[], y: T[]): Uint32Array {
  const cols = y.length + 1
  const table = new Uint32Array((x.length + 1) * cols)
  for (let i = x.length - 1; i >= 0; i -= 1)
    for (let j = y.length - 1; j >= 0; j -= 1)
      table[i * cols + j] =
        x[i] === y[j]
          ? table[(i + 1) * cols + j + 1] + 1
          : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1])
  return table
}

export type Op = 'same' | 'del' | 'ins'

function diffTokens<T>(x: T[], y: T[]): Array<[Op, T]> {
  const cols = y.length + 1
  const table = lcs(x, y)
  const out: Array<[Op, T]> = []
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

/** Removed words struck through, added words marked, as HTML. */
export function wordDiffHtml(before: string, after: string): string {
  const tokenize = (text: string) => text.match(/\s+|[^\s]+/g) ?? []
  return diffTokens(tokenize(before), tokenize(after))
    .map(([op, token]) => (op === 'same' ? esc(token) : `<${op}>${esc(token)}</${op}>`))
    .join('')
    .replace(/<\/del><del>/g, '')
    .replace(/<\/ins><ins>/g, '')
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
