import { describe, expect, it } from 'vitest'
import { copyOf, readFrontMatter, round, slug, titleOf, unitsOf, words } from './text.ts'

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
})

describe('copyOf', () => {
  it('drops front matter and HTML comments', () => {
    expect(copyOf('---\na: 1\n---\n<!-- note -->\nKept copy.')).toBe('Kept copy.')
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

describe('round', () => {
  it('rounds to places and passes null and NaN through as null', () => {
    expect(round(1.23456)).toBe(1.23)
    expect(round(1.5, 0)).toBe(2)
    expect(round(null)).toBeNull()
    expect(round(Number.NaN)).toBeNull()
  })
})
