import { describe, expect, it } from 'vitest'
import { DIFF_BUDGET, lineDiff, wordDiffHtml } from './diff.ts'

describe('wordDiffHtml', () => {
  it('strikes what was removed and marks what was added', () => {
    expect(wordDiffHtml('a quick fox', 'a slow fox')).toBe('a <del>quick</del><ins>slow</ins> fox')
  })

  it('escapes the text it shows', () => {
    expect(wordDiffHtml('<b>', '<i>')).toBe('<del>&lt;b&gt;</del><ins>&lt;i&gt;</ins>')
  })

  it('says nothing changed with no marks', () => {
    expect(wordDiffHtml('same text', 'same text')).toBe('same text')
  })

  it('compares two long texts that differ in one place', () => {
    // 40,000 tokens a side: a table of them all would be 6 GB.
    const shared = Array.from({ length: 20_000 }, (_, i) => `w${i}`)
    const before = [...shared.slice(0, 10_000), 'old', ...shared.slice(10_000)].join(' ')
    const after = [...shared.slice(0, 10_000), 'new', ...shared.slice(10_000)].join(' ')
    const html = wordDiffHtml(before, after)
    expect(html).toContain('<del>old</del><ins>new</ins>')
    expect(html?.match(/<del>/g)).toHaveLength(1)
  })

  it('leaves the space two changed words share unmarked', () => {
    expect(wordDiffHtml('a b c d', 'a x y d')).toBe(
      'a <del>b</del><ins>x</ins> <del>c</del><ins>y</ins> d',
    )
    expect(wordDiffHtml('a b', 'a  b')).toBe('a<del> </del><ins>  </ins>b')
  })

  it('compares two texts of 3,000 words that differ all through', () => {
    // Changed from the first word to the last, so no shared start or end shrinks the table.
    const before = Array.from({ length: 3000 }, (_, i) => `w${i}`)
    const after = before.map((word, i) => (i % 100 === 0 || i === 2999 ? `x${i}` : word))
    const html = wordDiffHtml(before.join(' '), after.join(' '))
    expect(html).not.toBeNull()
    expect(html?.match(/<del>/g)).toHaveLength(31)
    expect(html?.match(/<ins>/g)).toHaveLength(31)
    expect(html).toContain('<del>w100</del><ins>x100</ins> w101 ')
  })

  it('gives up on texts that differ over too many words', () => {
    const side = Math.ceil(Math.sqrt(DIFF_BUDGET))
    const before = Array.from({ length: side }, (_, i) => `a${i}`).join(' ')
    const after = Array.from({ length: side }, (_, i) => `b${i}`).join(' ')
    expect(wordDiffHtml(before, after)).toBeNull()
  })
})

describe('lineDiff', () => {
  it('is empty when nothing changed', () => {
    expect(lineDiff('a\nb', 'a\nb')).toEqual([])
  })

  it('keeps three lines around a change and folds the rest', () => {
    const before = ['1', '2', '3', '4', '5', 'old', '7', '8', '9', '10', '11'].join('\n')
    const after = before.replace('old', 'new')
    expect(lineDiff(before, after).map((l) => `${l.op}:${l.text}`)).toEqual([
      'fold:',
      'same:3',
      'same:4',
      'same:5',
      'del:old',
      'ins:new',
      'same:7',
      'same:8',
      'same:9',
      'fold:',
    ])
  })

  it('shows a change at the very start and the very end', () => {
    expect(lineDiff('a\nb\nc', 'x\nb\ny').map((l) => l.op)).toEqual([
      'del',
      'ins',
      'same',
      'del',
      'ins',
    ])
  })

  it('still answers for texts too long for one table: all removed, then all added', () => {
    const side = Math.ceil(Math.sqrt(DIFF_BUDGET))
    const before = Array.from({ length: side }, (_, i) => `a${i}`).join('\n')
    const after = Array.from({ length: side }, (_, i) => `b${i}`).join('\n')
    const lines = lineDiff(before, after)
    expect(lines).toHaveLength(side * 2)
    expect(lines[0].op).toBe('del')
    expect(lines.at(-1)?.op).toBe('ins')
  })
})
