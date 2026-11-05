import { describe, expect, it } from 'vitest'
import {
  copyOf,
  frontMatterBlock,
  isSlug,
  metaList,
  metaText,
  readFrontMatter,
  round,
  slug,
  stripComments,
  stripFrontMatter,
  titleOf,
  unitsOf,
  words,
} from './text.ts'

describe('readFrontMatter', () => {
  it('splits meta fields from the body', () => {
    const raw = '---\ntitle: Hello world\ncase: intro\n---\n\nBody text.\n'
    expect(readFrontMatter(raw)).toEqual({
      meta: { title: 'Hello world', case: 'intro' },
      text: 'Body text.',
    })
  })

  it('returns the trimmed text when there is no front matter', () => {
    expect(readFrontMatter('\nJust text.\n')).toEqual({ meta: {}, text: 'Just text.' })
  })

  it('parses the block as YAML: hyphenated keys, quotes, lists and numbers', () => {
    const raw = [
      '---',
      'name: tidy-writer',
      'description: "Writes: tidy copy"',
      'allowed-tools: [Read, Write]',
      'max_turns: 12',
      '---',
      'Body.',
    ].join('\n')
    expect(readFrontMatter(raw).meta).toEqual({
      name: 'tidy-writer',
      description: 'Writes: tidy copy',
      'allowed-tools': ['Read', 'Write'],
      max_turns: 12,
    })
  })

  it('reads Windows line endings and a byte-order mark', () => {
    const raw = '\uFEFF---\r\nname: x\r\n---\r\n\r\nLine one.\r\nLine two.\r\n'
    expect(readFrontMatter(raw)).toEqual({ meta: { name: 'x' }, text: 'Line one.\nLine two.' })
  })

  it('accepts an empty block and drops a block that is not valid YAML', () => {
    expect(readFrontMatter('---\n---\nBody.')).toEqual({ meta: {}, text: 'Body.' })
    expect(readFrontMatter('---\nkey: [unclosed\n---\nBody.')).toEqual({ meta: {}, text: 'Body.' })
  })
})

describe('front matter helpers', () => {
  const raw = '---\na: 1\n---\nBody.'
  it('returns the block with delimiters, or nothing', () => {
    expect(frontMatterBlock(raw)).toBe('---\na: 1\n---\n')
    expect(frontMatterBlock('Body.')).toBe('')
  })
  it('strips the block and keeps the body', () => expect(stripFrontMatter(raw)).toBe('Body.'))

  const meta = { s: 'text', n: 3, b: true, list: ['a', 1], csv: 'a, b,,c', obj: { x: 1 } }
  it('reads scalars as text and nothing else', () => {
    expect([metaText(meta, 's'), metaText(meta, 'n'), metaText(meta, 'b')]).toEqual([
      'text',
      '3',
      'true',
    ])
    expect(metaText(meta, 'obj')).toBeNull()
    expect(metaText(meta, 'missing')).toBeNull()
  })
  it('reads lists from sequences or comma-separated text', () => {
    expect(metaList(meta, 'list')).toEqual(['a', '1'])
    expect(metaList(meta, 'csv')).toEqual(['a', 'b', 'c'])
    expect(metaList(meta, 'missing')).toBeNull()
  })
})

describe('copyOf', () => {
  it('drops front matter and HTML comments', () => {
    expect(copyOf('---\na: 1\n---\n<!-- note -->\nKept copy.')).toBe('Kept copy.')
  })
})

describe('stripComments', () => {
  it('removes every comment and keeps the text around them', () => {
    expect(stripComments('a <!-- one --> b <!--\ntwo\n--> c')).toBe('a  b  c')
  })
  it('leaves no comment that removing another one assembled', () => {
    expect(stripComments('<!-<!-- a -->- hidden -->shown')).toBe('shown')
    expect(copyOf('<!-<!-- a -->- hidden -->\nShown.')).toBe('Shown.')
  })
})

describe('unitsOf', () => {
  const text = [
    '# Heading',
    'First paragraph\nwraps here.',
    '```js\nconst code = 1\n```',
    '- one\n- two',
    '1. first\n2) second',
    '![alt](img.png)',
    '[figure] A chart',
    '> Quoted line.',
  ].join('\n\n')
  const units = unitsOf(text)

  it('keeps prose and lists, leaves out headings, code, images and figures', () => {
    expect(units.map((u) => u.text)).toEqual([
      'First paragraph wraps here.',
      'one two',
      'first second',
      'Quoted line.',
    ])
  })

  it('splits Windows line endings the same way', () => {
    expect(unitsOf(text.replace(/\n/g, '\r\n'))).toEqual(units)
  })

  it('splits list blocks into items', () => {
    expect(units[1]).toEqual({ text: 'one two', items: ['one', 'two'], list: true })
    expect(units[2].items).toEqual(['first', 'second'])
    expect(units[0].list).toBe(false)
  })
})

describe('words', () => {
  it('keeps apostrophes and hyphens inside words', () => {
    expect(words("Don't over-think it, 42 times.")).toEqual([
      "Don't",
      'over-think',
      'it',
      '42',
      'times',
    ])
  })
  it('counts letters beyond ASCII', () => expect(words('café naïve')).toHaveLength(2))
  it('is empty for punctuation only', () => expect(words('... !')).toEqual([]))
  it('never counts a dash or apostrophe on its own', () => {
    expect(words("Fast - and ' cheap -- 'quoted' dogs'")).toEqual([
      'Fast',
      'and',
      'cheap',
      'quoted',
      'dogs',
    ])
  })
  it('keeps combining marks inside the word', () =>
    expect(words('nai\u0308ve')).toEqual(['nai\u0308ve']))
})

describe('titleOf', () => {
  it('finds the first h1, null without one', () => {
    expect(titleOf('intro\n# The Title \n## Sub')).toBe('The Title')
    expect(titleOf('## Only h2')).toBeNull()
  })
})

describe('slug', () => {
  it('lowercases and collapses non-alphanumerics to single dashes', () => {
    expect(slug('  Hello, World! v2 ')).toBe('hello-world-v2')
  })
  it('caps length without a trailing dash', () => {
    expect(slug('abc def', 4)).toBe('abc')
  })
})

describe('isSlug', () => {
  it.each(['a', 'release-notes', 'v2-draft-3'])('accepts %s', (text) => {
    expect(isSlug(text)).toBe(true)
  })
  it.each(['', 'Release', 'a--b', '-a', 'a-', 'a_b', 'a b', '../a'])('refuses %j', (text) => {
    expect(isSlug(text)).toBe(false)
  })
  it('accepts whatever slug derives from a title', () => {
    expect(isSlug(slug('  A short note: v2! '))).toBe(true)
  })
})

describe('round', () => {
  it('rounds to places and passes null and NaN through as null', () => {
    expect(round(1.23456)).toBe(1.23)
    expect(round(1.5, 0)).toBe(2)
    expect(round(null)).toBeNull()
    expect(round(Number.NaN)).toBeNull()
  })
})
