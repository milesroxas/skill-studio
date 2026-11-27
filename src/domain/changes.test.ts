import { describe, expect, it } from 'vitest'
import {
  applyEdits,
  caseHolds,
  changeDraft,
  type EditProblem,
  editsOf,
  notMadeLine,
  refusedLine,
  replyParts,
  type SkillChange,
  wholeFileOf,
  wholeFileRequest,
  withEdits,
  withoutEdited,
} from './changes.ts'
import type { Case } from './schemas.ts'

const savedCase = (patch: Partial<Case> = {}): Case => ({
  id: 'shift',
  legacyId: null,
  title: 'A covered shift',
  prompt: 'Thank Priya.',
  expectedOutcome: 'Names Priya.',
  files: ['evals/cases/shift/files/mock.png'],
  graders: [
    { id: '01-names', statement: 'The note names Priya.', weight: 2, image: null },
    { id: '02-short', statement: 'The note is short.', weight: 1, image: null },
  ] as Case['graders'],
  settings: {} as Case['settings'],
  bench: { words: [20, 80] } as Case['bench'],
  source: 'folder',
  dir: 'evals/cases/shift',
  ...patch,
})

type CaseChange = Extract<SkillChange, { kind: 'case' }>

describe('replyParts', () => {
  it('splits prose from a file change, keeping a code fence inside the file', () => {
    const reply = [
      'Here is the rewrite.',
      '',
      '~~~~ file SKILL.md',
      '---',
      'name: notes',
      '---',
      '',
      '```sh',
      'pnpm check',
      '```',
      '~~~~',
      '',
      'Apply it, then run a case.',
    ].join('\n')
    expect(replyParts(reply)).toEqual([
      { kind: 'prose', text: 'Here is the rewrite.' },
      {
        kind: 'change',
        change: {
          kind: 'file',
          path: 'SKILL.md',
          text: '---\nname: notes\n---\n\n```sh\npnpm check\n```\n',
        },
      },
      { kind: 'prose', text: 'Apply it, then run a case.' },
    ])
  })

  it('keeps a four-tilde fence inside a file, closing at the last tildes before the next block or the end', () => {
    const file = ['# Notes', '', '~~~~md', '- An example rule here.', '~~~~', '', '## Rules'].join(
      '\n',
    )
    const reply = [
      '~~~~ file SKILL.md',
      file,
      '~~~~',
      'Then save it.',
      '~~~~ version',
      'After the fence',
      '~~~~',
    ].join('\n')
    expect(replyParts(reply)).toEqual([
      { kind: 'change', change: { kind: 'file', path: 'SKILL.md', text: `${file}\n` } },
      { kind: 'prose', text: 'Then save it.' },
      { kind: 'change', change: { kind: 'version', name: 'After the fence' } },
    ])
    // The same file as the last block of the reply, with prose after it.
    const last = replyParts(['Here.', '~~~~ file SKILL.md', file, '~~~~', 'Done.'].join('\n'))
    expect(last).toEqual([
      { kind: 'prose', text: 'Here.' },
      { kind: 'change', change: { kind: 'file', path: 'SKILL.md', text: `${file}\n` } },
      { kind: 'prose', text: 'Done.' },
    ])
  })

  it('puts quotes around a SKILL.md front matter value that holds a colon, and only there', () => {
    const file = '---\nname: notes\ndescription: Writes notes: short ones.\n---\n\n# Notes'
    const [skill] = replyParts(['~~~~ file SKILL.md', file, '~~~~'].join('\n'))
    expect(skill).toEqual({
      kind: 'change',
      change: {
        kind: 'file',
        path: 'SKILL.md',
        text: '---\nname: notes\ndescription: "Writes notes: short ones."\n---\n\n# Notes\n',
      },
    })
    const [reference] = replyParts(['~~~~ file references/a.md', file, '~~~~'].join('\n'))
    expect(reference).toMatchObject({ change: { text: `${file}\n` } })
  })

  it('closes a case at the first tildes, as its JSON holds none', () => {
    const reply = '~~~~ case\n{"title": "T", "prompt": "P"}\n~~~~\n~~~~\n'
    expect(replyParts(reply)[0]).toMatchObject({ kind: 'change', change: { kind: 'case' } })
  })

  it('reads a case and a version', () => {
    const reply = [
      '~~~~ version',
      'Before the voice rewrite',
      '~~~~',
      '~~~~ case',
      '{"title": "Edit a draft", "prompt": "Edit this.", "checks": ["The answer lists the changes.", ""]}',
      '~~~~',
    ].join('\n')
    expect(replyParts(reply)).toEqual([
      { kind: 'change', change: { kind: 'version', name: 'Before the voice rewrite' } },
      {
        kind: 'change',
        change: {
          kind: 'case',
          id: 'edit-a-draft',
          idGiven: false,
          title: 'Edit a draft',
          prompt: 'Edit this.',
          expected: '',
          checks: [{ statement: 'The answer lists the changes.', weight: null }],
        },
      },
    ])
  })

  it('reads a check with a weight, held to 1 to 5, and a string as one with none', () => {
    const block = `~~~~ case\n${JSON.stringify({
      title: 'Weighted',
      prompt: 'P',
      checks: [
        { statement: 'The note names Priya.', weight: 2 },
        { statement: 'The note is short.', weight: 9 },
        { statement: 'The note is warm.', weight: 'two' },
        { statement: ' ' },
        'The note ends.',
      ],
    })}\n~~~~`
    expect(replyParts(block)[0]).toMatchObject({
      change: {
        checks: [
          { statement: 'The note names Priya.', weight: 2 },
          { statement: 'The note is short.', weight: 5 },
          { statement: 'The note is warm.', weight: null },
          { statement: 'The note ends.', weight: null },
        ],
      },
    })
  })

  it('keeps an id that names a case, and offers no change for one that is not a slug', () => {
    const block = (id: string) =>
      `~~~~ case\n${JSON.stringify({ id, title: 'New title', prompt: 'P' })}\n~~~~`
    expect(replyParts(block('shift'))[0]).toMatchObject({
      change: { id: 'shift', idGiven: true },
    })
    // Guessing `new-title` from the title could replace a case the block never meant.
    expect(replyParts(block('../etc'))[0]).toMatchObject({ kind: 'prose' })
    expect(replyParts(block('Bad_Id'))[0]).toMatchObject({ kind: 'prose' })
  })

  it('names a case with no id as a new case is named, and says the id was not given', () => {
    const block = (fields: object) => `~~~~ case\n${JSON.stringify(fields)}\n~~~~`
    expect(replyParts(block({ title: 'Tone check', prompt: 'P' }))[0]).toMatchObject({
      change: { id: 'tone-check', idGiven: false },
    })
    // A title with no letter a slug keeps is no reason to drop the case: the prompt names it.
    expect(
      replyParts(block({ title: '日本語', prompt: 'Thank Priya for Sunday.' }))[0],
    ).toMatchObject({ change: { id: 'thank-priya-for-sunday', idGiven: false } })
  })

  it('reads a reply with Windows line endings', () => {
    const reply = 'Here:\r\n~~~~ file SKILL.md\r\n# T\r\n~~~~\r\ndone'
    expect(replyParts(reply)).toEqual([
      { kind: 'prose', text: 'Here:' },
      { kind: 'change', change: { kind: 'file', path: 'SKILL.md', text: '# T\n' } },
      { kind: 'prose', text: 'done' },
    ])
  })

  it('leaves a block that does not hold up as code, never as a change', () => {
    const parts = replyParts(
      '~~~~ case\n{not json\n~~~~\n\n~~~~ file\nno path\n~~~~\n\n~~~~ version\n\n~~~~',
    )
    expect(parts.every((p) => p.kind === 'prose')).toBe(true)
    expect(parts.map((p) => (p.kind === 'prose' ? p.text : '')).join('\n')).toContain('{not json')
  })

  it('shows an open block as on its way while writing, and as code once finished', () => {
    const reply = 'Rewriting.\n\n~~~~ file references/voice.md\n# Voice\n'
    expect(replyParts(reply, { partial: true })).toEqual([
      { kind: 'prose', text: 'Rewriting.' },
      { kind: 'writing', label: 'references/voice.md' },
    ])
    expect(replyParts(reply).some((p) => p.kind === 'change' || p.kind === 'writing')).toBe(false)
  })

  it('offers no file while it arrives, since a line of tildes may be a fence inside it', () => {
    // The outer block is still open: the two lines of tildes so far are a fence in the file.
    const reply = '~~~~ file SKILL.md\n# T\n~~~~\ncode\n~~~~\nmore of the file'
    expect(replyParts(reply, { partial: true })).toEqual([{ kind: 'writing', label: 'SKILL.md' }])
    // A block after it settles where the file ended.
    const settled = `${reply}\n~~~~\n~~~~ version\nNext\n~~~~`
    expect(replyParts(settled, { partial: true })[0]).toMatchObject({
      change: { kind: 'file', text: '# T\n~~~~\ncode\n~~~~\nmore of the file\n' },
    })
  })
})

/** An edit block, its two texts given line by line. */
const editBlock = (path: string, find: string[], put: string[]): string =>
  [`~~~~ edit ${path}`, ...find, '~~~~ with', ...put, '~~~~'].join('\n')

/** What the edits of `reply` to `path` leave `text`, the file as it stands. */
const edited = (reply: string, text: string | undefined, path = 'SKILL.md') =>
  applyEdits(path, text, editsOf(reply).find((f) => f.path === path)?.edits ?? [])

describe('edit blocks in a reply', () => {
  it('shows an edit as on its way while the reply is written, and reads on past it once it closes', () => {
    const reply = [
      'Two changes.',
      editBlock('references/voice.md', ['- Be warm.'], ['- Be warm and brief.']),
      'And a version.',
      '~~~~ version',
      'Warmer',
      '~~~~',
    ].join('\n')
    expect(replyParts(reply, { partial: true })).toEqual([
      { kind: 'prose', text: 'Two changes.' },
      { kind: 'writing', label: 'references/voice.md' },
      { kind: 'prose', text: 'And a version.' },
      { kind: 'change', change: { kind: 'version', name: 'Warmer' } },
    ])
    // The last edit so far may end at a fence inside its new text: it takes the rest of the reply.
    expect(
      replyParts('Here.\n~~~~ edit SKILL.md\n- A\n~~~~ with\n~~~~\nfence', { partial: true }),
    ).toEqual([
      { kind: 'prose', text: 'Here.' },
      { kind: 'writing', label: 'SKILL.md' },
    ])
  })

  it('leaves an edit a finished reply still holds as code, never as a change', () => {
    const parts = replyParts(`Here.\n${editBlock('SKILL.md', ['- A rule.'], ['- A new rule.'])}`)
    expect(parts).toEqual([
      { kind: 'prose', text: 'Here.\n```\n- A rule.\n~~~~ with\n- A new rule.\n```' },
    ])
  })

  it('reads an edited file as a file change, every byte as it was written', () => {
    const text = '\uFEFF# Notes\r\n\r\n```sh\r\npnpm check\r\n```\r\n~~~~\r\nno line end'
    const block = `~~~~ edited references/a.md\n${JSON.stringify(text)}\n~~~~`
    expect(replyParts(`Done.\n${block}\nThen run it.`)).toEqual([
      { kind: 'prose', text: 'Done.' },
      { kind: 'change', change: { kind: 'file', path: 'references/a.md', text } },
      { kind: 'prose', text: 'Then run it.' },
    ])
    // One that holds no text stays as code.
    expect(replyParts('~~~~ edited SKILL.md\n{"text": 1}\n~~~~')[0]).toMatchObject({
      kind: 'prose',
    })
  })
})

describe('editsOf', () => {
  it('reads each file’s edits in order, with a code fence in the text to find', () => {
    const first = editBlock(
      'SKILL.md',
      ['```sh', 'pnpm test', '```'],
      ['```sh', 'pnpm check', '```'],
    )
    const voice = editBlock('references/voice.md', ['- Be warm.'], ['- Be warm and brief.'])
    const second = editBlock('SKILL.md', ['# Notes'], ['# Release notes'])
    const reply = ['First:', first, voice, 'Last:', second, 'Done.'].join('\n\n')
    expect(editsOf(reply)).toEqual([
      {
        path: 'SKILL.md',
        edits: [
          { splits: [{ find: '```sh\npnpm test\n```', put: '```sh\npnpm check\n```' }] },
          { splits: [{ find: '# Notes', put: '# Release notes' }] },
        ],
        written: [first, second],
      },
      {
        path: 'references/voice.md',
        edits: [{ splits: [{ find: '- Be warm.', put: '- Be warm and brief.' }] }],
        written: [voice],
      },
    ])
  })

  it('keeps four tildes inside its texts, and reads each way a line of `~~~~ with` splits it', () => {
    const reply = [
      editBlock('SKILL.md', ['~~~~md', '- An example.', '~~~~'], ['A line:', '~~~~ with', 'in it']),
      'Done.',
    ].join('\n')
    expect(editsOf(reply)[0].edits).toEqual([
      {
        splits: [
          { find: '~~~~md\n- An example.\n~~~~', put: 'A line:\n~~~~ with\nin it' },
          { find: '~~~~md\n- An example.\n~~~~\n~~~~ with\nA line:', put: 'in it' },
        ],
      },
    ])
  })

  it('leaves out an edit cut off by the end of the reply, and one that names no file', () => {
    expect(editsOf('~~~~ edit SKILL.md\n- A rule.\n~~~~ with\n- A new')).toEqual([])
    expect(editsOf('~~~~ edit\n- A rule.\n~~~~ with\n- A new rule.\n~~~~')).toEqual([])
  })
})

describe('applyEdits', () => {
  const file = '# Notes\n\n- Keep every note short.\n- Name the person.\n- Keep every note kind.\n'

  it('applies an edit only where its text to find is in the file exactly once', () => {
    const reply = (find: string) => editBlock('SKILL.md', [find], ['- Name them first.'])
    expect(edited(reply('- Name the person.'), file)).toEqual({
      text: '# Notes\n\n- Keep every note short.\n- Name them first.\n- Keep every note kind.\n',
    })
    expect(edited(reply('- Name the reader.'), file)).toEqual({ problem: 'not-found', edit: 1 })
    expect(edited(reply('- Keep every note'), file)).toEqual({ problem: 'found-twice', edit: 1 })
  })

  it('applies a file’s edits one after another, each to the text the ones before it left', () => {
    // The second's text to find is there only once the first is applied.
    const chained = [
      editBlock('SKILL.md', ['- Name the person.'], ['- Name the person first.']),
      editBlock('SKILL.md', ['- Name the person first.'], ['- Name the person first, by name.']),
    ].join('\n')
    expect(edited(chained, file)).toMatchObject({
      text: expect.stringContaining('first, by name.'),
    })
    // The second overlaps the first's text, which is no longer there.
    const overlapping = [
      editBlock('SKILL.md', ['- Keep every note short.', '- Name the person.'], ['- Be short.']),
      editBlock('SKILL.md', ['- Name the person.', '- Keep every note kind.'], ['- Be kind.']),
    ].join('\n')
    expect(edited(overlapping, file)).toEqual({ problem: 'not-found', edit: 2 })
  })

  it('refuses an empty text to find, and deletes whole lines for an empty replacement', () => {
    expect(edited(editBlock('SKILL.md', [], ['- New.']), file)).toEqual({
      problem: 'nothing-to-find',
      edit: 1,
    })
    expect(edited(editBlock('SKILL.md', [''], ['- New.']), file)).toMatchObject({
      problem: 'nothing-to-find',
    })
    // Whole lines go with their line end; part of a line goes alone.
    expect(edited(editBlock('SKILL.md', ['- Name the person.'], []), file)).toEqual({
      text: '# Notes\n\n- Keep every note short.\n- Keep every note kind.\n',
    })
    expect(edited(editBlock('SKILL.md', [' short'], []), file)).toMatchObject({
      text: expect.stringContaining('- Keep every note.\n'),
    })
    // The last line of a file with no line end at its end takes the line end before it.
    expect(edited(editBlock('SKILL.md', ['b'], []), 'a\nb')).toEqual({ text: 'a' })
  })

  it('finds a code fence, a tilde fence and a line of `~~~~ with` as written, where one way is found once', () => {
    const fenced = '# Notes\n\n```sh\npnpm test\n```\n\n~~~~md\n- An example.\n~~~~\n'
    const fence = editBlock(
      'SKILL.md',
      ['```sh', 'pnpm test', '```'],
      ['```sh', 'pnpm check', '```'],
    )
    expect(edited(fence, fenced)).toEqual({ text: fenced.replace('pnpm test', 'pnpm check') })
    const tildes = editBlock('SKILL.md', ['~~~~md', '- An example.', '~~~~'], ['- No example.'])
    expect(edited(tildes, fenced)).toEqual({
      text: '# Notes\n\n```sh\npnpm test\n```\n\n- No example.\n',
    })
    // `~~~~ with` in the new text: only the first way's text to find is in the file.
    const inPut = editBlock(
      'SKILL.md',
      ['- An example.'],
      ['Write:', '~~~~ with', 'then the text.'],
    )
    expect(edited(inPut, fenced)).toMatchObject({
      text: expect.stringContaining('Write:\n~~~~ with\nthen the text.\n~~~~'),
    })
    // `~~~~ with` in the text to find: only the second way's is found once.
    const withFile = 'Open the block.\n~~~~ with\nThen the text.\n'
    const inFind = editBlock(
      'SKILL.md',
      ['Open the block.', '~~~~ with', 'Then the text.'],
      ['Gone.'],
    )
    expect(edited(inFind, `Open the block.\n${withFile}`)).toEqual({
      text: 'Open the block.\nGone.\n',
    })
    // Both ways found once: the edit is unclear, so it is not applied.
    expect(edited(inFind, withFile)).toEqual({ problem: 'unclear', edit: 1 })
    expect(edited('~~~~ edit SKILL.md\n- A rule.\n~~~~', file)).toEqual({
      problem: 'unclear',
      edit: 1,
    })
  })

  it('matches white space as written, and leaves the end of the file as it was', () => {
    const spaced = '- One.  \n- Two.'
    // Trailing spaces in the file are kept after the text replaced.
    expect(edited(editBlock('SKILL.md', ['- One.'], ['- First.']), spaced)).toEqual({
      text: '- First.  \n- Two.',
    })
    expect(edited(editBlock('SKILL.md', ['- Two. '], ['- Second.']), spaced)).toEqual({
      problem: 'not-found',
      edit: 1,
    })
    // No line end is added to a file with none at its end.
    expect(edited(editBlock('SKILL.md', ['- Two.'], ['- Second.']), spaced)).toEqual({
      text: '- One.  \n- Second.',
    })
    // Nor are blank lines at its end taken away.
    expect(edited(editBlock('SKILL.md', ['- Two.'], ['- Second.']), '- Two.\n\n\n')).toEqual({
      text: '- Second.\n\n\n',
    })
  })

  it('keeps the file’s own line ends, whichever line ends the reply came with', () => {
    const block = editBlock('SKILL.md', ['b', 'c'], ['B', 'C'])
    expect(edited(block, 'a\r\nb\r\nc\r\n')).toEqual({ text: 'a\r\nB\r\nC\r\n' })
    expect(edited(block.replace(/\n/g, '\r\n'), 'a\nb\nc\n')).toEqual({ text: 'a\nB\nC\n' })
    expect(edited(block.replace(/\n/g, '\r\n'), 'a\r\nb\r\nc')).toEqual({ text: 'a\r\nB\r\nC' })
    // The byte-order mark stays too.
    expect(edited(editBlock('SKILL.md', ['a'], ['A']), '\uFEFFa\r\nb\r\n')).toEqual({
      text: '\uFEFFA\r\nb\r\n',
    })
    expect(edited(editBlock('SKILL.md', ['b'], []), 'a\r\nb\r\nc\r\n')).toEqual({
      text: 'a\r\nc\r\n',
    })
  })

  it('matches a file with mixed line ends, and leaves each line it does not reach with its own end', () => {
    const mixed = 'a\r\nb\nc\r\nd\n'
    // The new lines take the end of the line the match starts on; a and d keep theirs.
    expect(edited(editBlock('SKILL.md', ['b', 'c'], ['B', 'C']), mixed)).toEqual({
      text: 'a\r\nB\nC\r\nd\n',
    })
    expect(edited(editBlock('SKILL.md', ['c'], ['C', 'C2']), mixed)).toEqual({
      text: 'a\r\nb\nC\r\nC2\r\nd\n',
    })
    expect(edited(editBlock('SKILL.md', ['b', 'c'], []), mixed)).toEqual({ text: 'a\r\nd\n' })
  })

  it('deletes the first line of a file with a byte-order mark cleanly, and keeps the mark', () => {
    expect(edited(editBlock('SKILL.md', ['a'], []), '\uFEFFa\nb\n')).toEqual({ text: '\uFEFFb\n' })
    expect(edited(editBlock('SKILL.md', ['a'], []), '\uFEFFa\r\nb\r\n')).toEqual({
      text: '\uFEFFb\r\n',
    })
  })

  it('quotes a SKILL.md value in the `---` lines only where an edit made it need quotes', () => {
    const skill = '---\nname: notes\ndescription: Writes notes.\n---\n\n# Notes\n'
    const colon = editBlock(
      'SKILL.md',
      ['description: Writes notes.'],
      ['description: Notes: short.'],
    )
    expect(edited(colon, skill)).toEqual({
      text: '---\nname: notes\ndescription: "Notes: short."\n---\n\n# Notes\n',
    })
    expect(edited(colon.replace('SKILL.md', 'references/a.md'), skill, 'references/a.md')).toEqual({
      text: '---\nname: notes\ndescription: Notes: short.\n---\n\n# Notes\n',
    })
    // A value that needed quotes before is left as the writer has it.
    const before = '---\nname: notes\ndescription: Writes notes: short.\n---\n\n# Notes\n'
    expect(edited(editBlock('SKILL.md', ['# Notes'], ['# Release notes']), before)).toEqual({
      text: before.replace('# Notes', '# Release notes'),
    })
  })

  it('says when the skill has no such file', () => {
    expect(edited(editBlock('SKILL.md', ['a'], ['b']), undefined)).toEqual({
      problem: 'no-file',
      edit: 1,
    })
  })

  it('applies an edit to a very large file', () => {
    const lines = Array.from({ length: 40_000 }, (_, i) => `- Line ${i} of a long reference.`)
    const large = `${lines.join('\n')}\n`
    const result = edited(
      editBlock('references/long.md', ['- Line 20000 of a long reference.'], ['- Changed.']),
      large,
      'references/long.md',
    )
    expect(result).toEqual({
      text: large.replace('- Line 20000 of a long reference.', '- Changed.'),
    })
  })
})

describe('withEdits', () => {
  const first = editBlock('SKILL.md', ['# Notes'], ['# Release notes'])
  const voice = editBlock('references/voice.md', ['- Be warm.'], ['- Be warm and brief.'])
  const second = editBlock('SKILL.md', ['- A rule.'], ['- A new rule.'])
  const reply = ['Three changes.', first, 'Then:', voice, second, 'Done.'].join('\n\n')

  it('puts one edited file in place of its first edit, which the panel reads byte for byte', () => {
    const text = '# Release notes\r\n\r\n- A new rule.'
    const line = 'This change to references/voice.md was not made.'
    const shown = withEdits(
      reply,
      new Map([
        ['SKILL.md', { text }],
        ['references/voice.md', { notMade: line }],
      ]),
    )
    expect(shown.match(/^~~~~ edited /gm)).toHaveLength(1)
    expect(replyParts(shown)).toEqual([
      { kind: 'prose', text: 'Three changes.' },
      { kind: 'change', change: { kind: 'file', path: 'SKILL.md', text } },
      {
        kind: 'prose',
        text: `Then:\n\n\`\`\`\n- Be warm.\n~~~~ with\n- Be warm and brief.\n\`\`\`\n\n${line}\n\n\nDone.`,
      },
    ])
  })

  it('keeps an edit and a whole file to the same file after it as two changes', () => {
    const both = `${first}\n~~~~ file SKILL.md\n# Whole\n~~~~`
    const parts = replyParts(withEdits(both, new Map([['SKILL.md', { text: '# Edited\n' }]])))
    expect(parts).toEqual([
      { kind: 'change', change: { kind: 'file', path: 'SKILL.md', text: '# Edited\n' } },
      { kind: 'change', change: { kind: 'file', path: 'SKILL.md', text: '# Whole\n' } },
    ])
  })

  it('leaves the reply as it was for a file with no outcome', () => {
    expect(withEdits(reply, new Map())).toBe(reply)
  })
})

describe('the whole file asked for once more', () => {
  const reply = editBlock('references/voice.md', ['- Be warm'], ['- Be brief.'])
  const [file] = editsOf(reply)

  it('says why, what was written, and the file as it is now', () => {
    const asked = wholeFileRequest(
      file,
      { problem: 'not-found', edit: 1 },
      '# Voice\r\n- Be kind.\r\n',
    )
    expect(asked).toContain('the text to find in edit 1 is not in the file')
    expect(asked).toContain('"~~~~ file references/voice.md"')
    expect(asked).toContain(reply)
    expect(asked).toContain('<file name="references/voice.md">\n# Voice\n- Be kind.\n\n</file>')
    expect(wholeFileRequest(file, { problem: 'no-file', edit: 1 }, undefined)).toContain(
      'The skill has no file references/voice.md.',
    )
  })

  it('takes the file from the answer in the form of the file as it stands', () => {
    const answer = 'Here.\n~~~~ file references/voice.md\n# Voice\n- Be brief.\n~~~~'
    const path = 'references/voice.md'
    expect(wholeFileOf(answer, path, '# Voice\n')).toBe('# Voice\n- Be brief.\n')
    expect(wholeFileOf(answer, path, '\uFEFF# Voice\r\n- Be warm.')).toBe(
      '\uFEFF# Voice\r\n- Be brief.',
    )
    expect(wholeFileOf(answer, path, undefined)).toBe('# Voice\n- Be brief.\n')
    // An answer with no whole text for that file has none to give.
    expect(wholeFileOf(answer, 'SKILL.md', '# Notes\n')).toBeNull()
    expect(wholeFileOf(reply, path, '# Voice\n')).toBeNull()
  })

  it('keeps the file as the model wrote it, blank lines at its end and all', () => {
    const answer = '~~~~ file references/voice.md\n# Voice\n- Be brief.\n\n\n~~~~'
    expect(wholeFileOf(answer, 'references/voice.md', '# Voice\n')).toBe(
      '# Voice\n- Be brief.\n\n\n',
    )
    expect(wholeFileOf(answer, 'references/voice.md', '# Voice\r\n')).toBe(
      '# Voice\r\n- Be brief.\r\n\r\n\r\n',
    )
  })

  it('keeps each line of a file with mixed line ends that the whole file still has with its own end', () => {
    const old = '# Voice\r\n- Be warm.\n- Be kind.\r\n- Sign it.\n'
    const answer =
      '~~~~ file references/voice.md\n# Voice\n- Be brief.\n- Be kind.\n- Thank them.\n- Sign it.\n~~~~'
    // A new line takes the end of the line before it.
    expect(wholeFileOf(answer, 'references/voice.md', old)).toBe(
      '# Voice\r\n- Be brief.\r\n- Be kind.\r\n- Thank them.\r\n- Sign it.\n',
    )
  })
})

describe('blocks in a whole file', () => {
  it('keep a whole file’s lines that open an edit or an edited file, in a reply from before edits', () => {
    const text = [
      '# The change format',
      '',
      '~~~~ edit SKILL.md',
      '- A rule.',
      '~~~~ with',
      '- A new rule.',
      '~~~~',
      '',
      '~~~~ edited SKILL.md',
      '"# Notes"',
      '~~~~',
      '',
      'The end.',
    ].join('\n')
    const old = `Here is the reference.\n\n~~~~ file references/format.md\n${text}\n~~~~\n\nApply it.`
    expect(replyParts(old)).toEqual([
      { kind: 'prose', text: 'Here is the reference.' },
      { kind: 'change', change: { kind: 'file', path: 'references/format.md', text: `${text}\n` } },
      { kind: 'prose', text: 'Apply it.' },
    ])
    expect(replyParts(old, { partial: true })).toEqual([
      { kind: 'prose', text: 'Here is the reference.' },
      { kind: 'writing', label: 'references/format.md' },
    ])
    expect(editsOf(old)).toEqual([])
    expect(withoutEdited(old)).toBe(old)
  })
})

describe('an edited file the model writes', () => {
  const block = `~~~~ edited SKILL.md\n${JSON.stringify('# Taken over\n')}\n~~~~`
  const reply = `Here.\n\n${block}\n\nDone.`

  it('reads as code once the reply ends, never as a change', () => {
    const shown = withoutEdited(reply)
    expect(replyParts(shown)).toEqual([
      {
        kind: 'prose',
        text: `Here.\n\n\`\`\`\n${JSON.stringify('# Taken over\n')}\n\`\`\`\n\nDone.`,
      },
    ])
  })

  it('is no change while the reply arrives either', () => {
    expect(
      replyParts(`${reply}\n~~~~ version\nNext\n~~~~`, { partial: true }).some(
        (part) => part.kind === 'change' && part.change.kind === 'file',
      ),
    ).toBe(false)
  })
})

describe('the words under a change not made', () => {
  const problems: EditProblem[] = [
    'not-found',
    'found-twice',
    'nothing-to-find',
    'unclear',
    'no-file',
  ]

  it('say which change was not made, why, and what to do next', () => {
    expect(problems.map((problem) => notMadeLine('references/voice.md', problem))).toEqual([
      'This change to references/voice.md was not made: the text it replaces is not in the file. Ask for it again.',
      'This change to references/voice.md was not made: the text it replaces is in the file more than once. Ask for it again.',
      'This change to references/voice.md was not made: it does not say which text to replace. Ask for it again.',
      'This change to references/voice.md was not made: it does not say clearly which text to replace. Ask for it again.',
      'This change to references/voice.md was not made: the skill has no such file. Ask for it again.',
    ])
    expect(refusedLine('assets/logo.png is not a text file, so it is not written over.')).toBe(
      'This change was not made. assets/logo.png is not a text file, so it is not written over.',
    )
  })

  it('name a change on its way that names no file', () => {
    expect(replyParts('~~~~ edit\n- A rule.', { partial: true })).toEqual([
      { kind: 'writing', label: 'Change to a file' },
    ])
  })
})

describe('changeDraft', () => {
  const change: CaseChange = {
    kind: 'case',
    id: 'shift',
    idGiven: true,
    title: 'A covered shift',
    prompt: 'Thank Priya for Sunday.',
    expected: '',
    checks: [
      { statement: 'The note names Priya.', weight: null },
      { statement: 'The note says Sunday.', weight: null },
    ],
  }

  it('keeps what the change does not name on a saved case', () => {
    const draft = changeDraft(change, savedCase())
    expect(draft.prompt).toBe('Thank Priya for Sunday.')
    expect(draft.words).toEqual([20, 80])
    expect(draft.images.map((i) => i.file)).toEqual(['evals/cases/shift/files/mock.png'])
    expect(draft.graders).toEqual([
      { id: '01-names', statement: 'The note names Priya.', weight: 2, image: null },
      { id: null, statement: 'The note says Sunday.', weight: 1, image: null },
    ])
  })

  it('sets a weight the change names, on a kept check and on a new one', () => {
    const draft = changeDraft(
      {
        ...change,
        checks: [
          { statement: 'The note names Priya.', weight: 3 },
          { statement: 'The note says Sunday.', weight: 2 },
        ],
      },
      savedCase(),
    )
    expect(draft.graders).toEqual([
      { id: '01-names', statement: 'The note names Priya.', weight: 3, image: null },
      { id: null, statement: 'The note says Sunday.', weight: 2, image: null },
    ])
  })

  it('starts a new case from the blank form', () => {
    const draft = changeDraft({ ...change, id: 'sunday' }, undefined)
    expect(draft).toMatchObject({ id: 'sunday', images: [], words: null })
    expect(draft.graders.every((g) => g.id === null)).toBe(true)
  })
})

describe('caseHolds', () => {
  const same: CaseChange = {
    kind: 'case',
    id: 'shift',
    idGiven: true,
    title: 'A covered shift',
    prompt: 'Thank Priya.',
    expected: 'Names Priya.',
    checks: [
      { statement: 'The note names Priya.', weight: null },
      { statement: 'The note is short.', weight: null },
    ],
  }

  it('is true only when the saved case says what the change says', () => {
    expect(caseHolds(same, savedCase())).toBe(true)
    expect(caseHolds({ ...same, checks: same.checks.slice(0, 1) }, savedCase())).toBe(false)
    // A weight the change names must hold too; one it leaves out is not compared.
    expect(
      caseHolds(
        { ...same, checks: [{ ...same.checks[0], weight: 2 }, same.checks[1]] },
        savedCase(),
      ),
    ).toBe(true)
    expect(
      caseHolds(
        { ...same, checks: [{ ...same.checks[0], weight: 3 }, same.checks[1]] },
        savedCase(),
      ),
    ).toBe(false)
    expect(caseHolds(same, undefined)).toBe(false)
  })
})
