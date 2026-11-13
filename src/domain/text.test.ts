import { describe, expect, it } from 'vitest'
import {
  closesFence,
  copyOf,
  fenceOf,
  frontMatterBlock,
  isSlug,
  metaList,
  metaText,
  pageText,
  readFrontMatter,
  round,
  sentencesOf,
  slug,
  stripComments,
  stripFrontMatter,
  stripTags,
  titleOf,
  tokens,
  unitsOf,
  withoutCode,
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
  it('keeps the section between two rules: only a block of fields is front matter', () => {
    const piece = '---\n\nThe first section.\n\n---\n\nThe second.'
    expect(copyOf(piece)).toBe(piece)
    expect(copyOf('---\r\nOne line of prose\r\n---\r\nMore.')).toContain('One line of prose')
  })
  it('tells front matter by its shape, so fields that do not parse as YAML are front matter still', () => {
    expect(
      copyOf(
        '---\ntitle: Shipping fast: what we learned\ndate: 2026-11-01\n---\n\nBody text here.',
      ),
    ).toBe('Body text here.')
    expect(copyOf('---\na: [1\ntags:\n  - one\n- two\n# a note\n---\nBody.')).toBe('Body.')
    // A field among lines of prose does not make the section front matter.
    expect(copyOf('---\nNote: read this first.\nThen the rest.\n---\nBody.')).toContain(
      'Then the rest.',
    )
  })
})

describe('pageText', () => {
  it('keeps what a reader sees of a page, and nothing of its markup', () => {
    const page =
      '<!doctype html><html lang="en"><head><title>Not seen</title><style>p { color: red }</style></head>' +
      '<body class="wide"><!-- hidden --><h1>Two&nbsp;words</h1><p>and<b>three</b>more</p>' +
      '<script>const hidden = 1</script><template><p>later</p></template></body></html>'
    expect(words(pageText(page))).toEqual(['Two', 'words', 'and', 'three', 'more'])
  })
  it('ends a head left open where the body begins', () => {
    const page = '<html><head><title>T</title><body><p>Hello world</p></body></html>'
    expect(words(pageText(page))).toEqual(['Hello', 'world'])
    expect(words(pageText('<head><title>Only a head'))).toEqual([])
    expect(words(pageText('<header>Kept</header>'))).toEqual(['Kept'])
  })
  it('reads a script or style left open to the end of the page as that, not as text', () => {
    expect(words(pageText('<p>Seen</p><script>let never = "closed"'))).toEqual(['Seen'])
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

describe('stripTags', () => {
  it('removes every tag and keeps the text between them', () => {
    expect(stripTags('<b>bold</b> and <i class="x">italic</i>')).toBe('bold and italic')
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

describe('unitsOf, where the old reading went wrong', () => {
  it('keeps a paragraph that follows its heading with no blank line', () => {
    expect(unitsOf('# Title\nOne two three four five.\n\nSecond para here.')).toEqual([
      { text: 'One two three four five.', items: ['One two three four five.'], list: false },
      { text: 'Second para here.', items: ['Second para here.'], list: false },
    ])
    // The words a case's range is checked against are the words of that paragraph.
    const summary = unitsOf('## Summary\nOne two three four five six seven eight.')
    expect(words(summary.map((u) => u.text).join(' '))).toHaveLength(8)
    // A list under its heading is still a list, and a heading alone is still nothing.
    expect(unitsOf('## Steps\n- one\n- two')).toEqual([
      { text: 'one two', items: ['one', 'two'], list: true },
    ])
    expect(unitsOf('# Title\n## Sub')).toEqual([])
  })

  it('leaves out code in a tilde fence, and in a fence left open', () => {
    expect(unitsOf('Intro line.\n\n~~~\nconst a = 1\n~~~\n').map((u) => u.text)).toEqual([
      'Intro line.',
    ])
    expect(unitsOf('Intro.\n\n```js\nconst a = 1;\n\nmore code').map((u) => u.text)).toEqual([
      'Intro.',
    ])
  })
})

describe('withoutCode', () => {
  it('empties every line of a fenced block and keeps the line count', () => {
    const text = 'a\n```js\ncode\n```\nb\n~~~\n``` is text here\n~~~\nc'
    expect(withoutCode(text)).toBe('a\n\n\n\nb\n\n\n\nc')
  })

  it('keeps each position when asked, so an index in one is an index in the other', () => {
    const text = 'a!\n```\nb!\n```\nc!'
    const blanked = withoutCode(text, { keepLength: true })
    expect(blanked).toHaveLength(text.length)
    expect(blanked).toBe('a!\n   \n  \n   \nc!')
  })

  it('runs a fence left open to the end', () => {
    expect(withoutCode('a\n```\nb\nc')).toBe('a\n\n\n')
  })
})

describe('fenceOf', () => {
  it('opens on three or more backticks or tildes, and tells which', () => {
    expect(fenceOf('```js')).toEqual({ char: '`', length: 3 })
    expect(fenceOf('  ~~~~')).toEqual({ char: '~', length: 4 })
    expect(fenceOf('text')).toBeNull()
    expect(closesFence('````', { char: '`', length: 3 })).toBe(true)
    expect(closesFence('~~~', { char: '`', length: 3 })).toBe(false)
  })

  it('reads backticks with a backtick after them as inline code, not a fence', () => {
    expect(fenceOf('```code``` is inline here')).toBeNull()
    // A tilde fence may name anything after it.
    expect(fenceOf('~~~ a `b`')).toEqual({ char: '~', length: 3 })
  })

  it('reads a fence line that ends in a carriage return, as a CRLF file has it', () => {
    expect(fenceOf('```markdown\r')).toEqual({ char: '`', length: 3 })
    expect(fenceOf('~~~~\r')).toEqual({ char: '~', length: 4 })
    expect(fenceOf('```code``` inline\r')).toBeNull()
  })
})

describe('tokens and sentencesOf', () => {
  it('counts whitespace-delimited tokens', () => {
    expect(tokens('  - Write   two sentences. ')).toEqual(['-', 'Write', 'two', 'sentences.'])
    expect(tokens('')).toEqual([])
  })

  it('splits at every sentence end, or only where the next one opens as a sentence does', () => {
    const text = 'Use tabs, e.g. four wide. it helps. Then stop!  Done'
    expect(sentencesOf(text)).toEqual([
      'Use tabs, e.g.',
      'four wide.',
      'it helps.',
      'Then stop!',
      'Done',
    ])
    expect(sentencesOf(text, { capital: true })).toEqual([
      'Use tabs, e.g. four wide. it helps.',
      'Then stop!',
      'Done',
    ])
    // With `capital`, a piece with no letter in it is no sentence.
    expect(sentencesOf('Fine. 42.', { capital: true })).toEqual(['Fine.'])
  })
})
