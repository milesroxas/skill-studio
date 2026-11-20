import { describe, expect, it } from 'vitest'
import { highlighted, type Token } from './highlight.ts'

const classOf = (tokens: Token[] | null, text: string): string | undefined =>
  tokens?.find((token) => token.text === text)?.class

describe('highlighted', () => {
  it('colors a language’s words, its values and its comments, by the file’s name', () => {
    const ts = highlighted('// note\nconst n: number = 42\nreturn "const"', 'src/a.ts')
    expect(classOf(ts, 'const')).toBe('tok-keyword')
    expect(classOf(ts, '42')).toBe('tok-value')
    expect(classOf(ts, '// note')).toBe('tok-mark')
    // What the code names and calls: a function, a type.
    const named = highlighted('function total(p: Product) { return sum(p) }', 'a.ts')
    expect(classOf(named, 'total')).toBe('tok-name')
    expect(classOf(named, 'Product')).toBe('tok-name')
    expect(classOf(named, 'sum')).toBe('tok-name')
    // A variable is plain text.
    expect(classOf(named, 'p')).toBeUndefined()
    // A keyword inside a string is a value.
    expect(classOf(ts, '"const"')).toBe('tok-value')
    expect(classOf(highlighted('{"a": true}', 'package.json'), 'true')).toBe('tok-value')
    expect(classOf(highlighted('<p class="x">a</p>', 'preview.HTML'), 'p')).toBe('tok-keyword')
    expect(classOf(highlighted('def f():\n  return 1', 'a.py'), 'def')).toBe('tok-keyword')
    expect(classOf(highlighted('func main() {}', 'main.go'), 'func')).toBe('tok-keyword')
  })

  it('leaves no text out and adds none', () => {
    const text = 'export const a = {\n  b: [1, "two"], // three\n}\n'
    expect(
      highlighted(text, 'a.tsx')
        ?.map((token) => token.text)
        .join(''),
    ).toBe(text)
  })

  it('shows a language it does not know, and a very long file, plain', () => {
    expect(highlighted('a = 1', 'notes.xyz')).toBeNull()
    expect(highlighted('a = 1', 'Makefile')).toBeNull()
    expect(highlighted(`${'const a = 1\n'.repeat(20_000)}`, 'big.js')).toBeNull()
  })
})
