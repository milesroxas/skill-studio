import { ensureSyntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { codeParser, skillMarkdown } from './language.ts'

/** The top-level blocks of `doc`, as `Name from-to`. */
function blocks(doc: string): string[] {
  const state = EditorState.create({ doc, extensions: skillMarkdown() })
  const tree = ensureSyntaxTree(state, doc.length, 1000)!
  const out: string[] = []
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling)
    out.push(`${node.name} ${node.from}-${node.to}`)
  return out
}

describe('skillMarkdown', () => {
  it('reads front matter as one block, never as a rule and a heading', () => {
    expect(blocks('---\nname: x\n---\n# Title')).toEqual(['Frontmatter 0-15', 'ATXHeading1 16-23'])
  })

  it('runs open front matter to the end, as the file is read', () => {
    expect(blocks('---\nname: x\n')).toEqual(['Frontmatter 0-12'])
  })

  it('reads `---` below the first line as a rule', () => {
    expect(blocks('text\n\n---\n')).toEqual(['Paragraph 0-4', 'HorizontalRule 6-9'])
  })
})

/** The name of the node `text` starts in, as its own language reads it. */
function nodeAt(doc: string, text: string): string {
  const state = EditorState.create({ doc, extensions: skillMarkdown() })
  return ensureSyntaxTree(state, doc.length, 1000)!.resolveInner(doc.indexOf(text), 1).name
}

describe('code blocks', () => {
  it('reads a block in the language its fence names', () => {
    expect(nodeAt('```css\n/* note */\na { color: red }\n```', '/* note')).toBe('Comment')
    expect(nodeAt('```TS title="a.ts"\nconst a: number = 1\n```', 'number')).toBe('TypeName')
    expect(nodeAt('```bash\n# note\nnpm test\n```', '# note')).toBe('comment')
  })

  it('leaves a block in a language it does not know as text', () => {
    expect(nodeAt('```rust\nfn main() {}\n```', 'fn main')).toBe('CodeText')
    expect(codeParser('')).toBeNull()
  })
})
