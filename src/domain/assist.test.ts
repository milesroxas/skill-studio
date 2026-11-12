import { describe, expect, it } from 'vitest'
import {
  ASSIST_FIELD_IDS,
  ASSIST_FIELDS,
  assistItems,
  assistPrompt,
  assistText,
  CONTEXT_BUDGET,
  chatSystem,
  partialText,
  VOICE,
  weightNote,
  workingSkill,
} from './assist.ts'
import { CHANGES_GUIDE } from './changes.ts'
import { NEW_CASE_KEY } from './schemas.ts'
import { CASE_PROMPT_HINT, RULE_GUIDE, RULE_SHAPE } from './templates.ts'

const reply = (text: string): string => JSON.stringify({ text })

describe('ASSIST_FIELDS', () => {
  it('gives every field a shape, and an edit to ask for in one click where a reply replaces text', () => {
    for (const id of ASSIST_FIELD_IDS) {
      const { shape, form, suggestions } = ASSIST_FIELDS[id]
      expect(shape.length).toBeGreaterThan(40)
      // A list is only added to.
      if (form !== 'items') expect(suggestions.edit.length).toBeGreaterThan(0)
    }
  })

  it('offers something to write in every field a screen shows empty', () => {
    // A file opens on its template and a passage is a selection, so neither starts blank.
    const startsEmpty = ASSIST_FIELD_IDS.filter(
      (id) => ASSIST_FIELDS[id].form !== 'file' && id !== 'skill.passage',
    )
    for (const id of startsEmpty)
      expect(ASSIST_FIELDS[id].suggestions.write.length).toBeGreaterThan(0)
  })

  it('writes skills by the same rules the editor shows', () => {
    const { shape } = ASSIST_FIELDS['skill.file']
    expect(shape).toContain(RULE_SHAPE)
    for (const item of RULE_GUIDE) expect(shape).toContain(item.lead)
    expect(ASSIST_FIELDS['case.prompt'].shape).toContain(CASE_PROMPT_HINT)
  })
})

describe('assistPrompt', () => {
  it('names the field, its shape, the context and the request', () => {
    const { system, user } = assistPrompt({
      field: 'case.check',
      instruction: 'Check the wedding is named',
      current: '',
      images: [],
      context: [
        { label: 'The case', text: 'Prompt: Thank Priya' },
        { label: 'Empty', text: '  ' },
      ],
    })
    expect(system).toContain('The field holds the check.')
    expect(system).toContain('one line')
    expect(user).toContain('<context name="The case">\nPrompt: Thank Priya\n</context>')
    expect(user).not.toContain('Empty')
    expect(user).toContain('The field is empty.')
    expect(user).toContain('<request>\nCheck the wedding is named\n</request>')
  })

  it('asks a list for new items, and for nothing in place of what it has', () => {
    const { system, user } = assistPrompt({
      field: 'case.checks',
      instruction: 'Two more',
      current: '',
      images: [],
      context: [{ label: 'The case', text: 'Check: The note names Priya.' }],
    })
    expect(system).toContain('added to the list as one new item')
    expect(system).not.toContain('in place of what is there')
    expect(user).toContain('Check: The note names Priya.')
    expect(user).not.toContain('The field is empty.')
  })

  it('shows the text an edit starts from', () => {
    const { user } = assistPrompt({
      field: 'case.prompt',
      instruction: 'Shorter',
      current: 'Thank Priya for the shift.',
      context: [],
      images: [],
    })
    expect(user).toContain('<field_now>\nThank Priya for the shift.\n</field_now>')
  })
})

describe('partialText', () => {
  it('reads the text of a reply that is still arriving', () => {
    expect(partialText('')).toBe('')
    expect(partialText('{"te')).toBe('')
    expect(partialText('{"text": "Thank you so')).toBe('Thank you so')
    expect(partialText('{"text":"a\\nb \\"c\\" \\u00e9')).toBe('a\nb "c" é')
  })

  it('stops at an escape that is not complete yet, and at the closing quote', () => {
    expect(partialText('{"text":"a\\')).toBe('a')
    expect(partialText('{"text":"a\\u00')).toBe('a')
    expect(partialText('{"text":"done"}')).toBe('done')
  })
})

describe('assistText', () => {
  it('keeps a one-line field to one line', () => {
    expect(
      assistText({ field: 'case.check', current: '' }, reply(' The note\nnames Priya. ')),
    ).toBe('The note names Priya.')
  })

  it('gives a list its items one to a line, without markers or gaps', () => {
    const text = assistText(
      { field: 'case.checks', current: '' },
      reply(
        '- The note names Priya.\n\n2. The note gives the date. \n  * The note is 3 - 4 lines.\n',
      ),
    )
    expect(assistItems(text)).toEqual([
      'The note names Priya.',
      'The note gives the date.',
      'The note is 3 - 4 lines.',
    ])
    expect(() => assistText({ field: 'case.checks', current: '' }, reply('-\n \n'))).toThrow(
      'no text',
    )
  })

  it('trims a block and ends a file with one newline', () => {
    expect(assistText({ field: 'case.prompt', current: '' }, reply('\nThank Priya.\n\n'))).toBe(
      'Thank Priya.',
    )
    expect(assistText({ field: 'skill.reference', current: '' }, reply('# Ref\n\n\n'))).toBe(
      '# Ref\n',
    )
  })

  it('gives SKILL.md back the front matter a reply left out', () => {
    const current = '---\nname: notes\ndescription: Writes notes.\n---\n\n# Notes\n'
    expect(
      assistText({ field: 'skill.file', current }, reply('# Notes\n\n## Rules\n\n- One.')),
    ).toBe('---\nname: notes\ndescription: Writes notes.\n---\n\n# Notes\n\n## Rules\n\n- One.\n')
    const rewritten = '---\nname: notes\ndescription: Better.\n---\n\n# Notes\n'
    expect(assistText({ field: 'skill.file', current }, reply(rewritten))).toBe(rewritten)
  })

  it('unwraps a file the model fenced whole, and refuses one that still opens with a fence', () => {
    const current = '---\nname: notes\n---\n\n# Notes\n'
    const file = '---\nname: notes\ndescription: Better.\n---\n\n# Notes\n\n```sh\npnpm check\n```'
    expect(
      assistText({ field: 'skill.file', current }, reply(`\`\`\`markdown\n${file}\n\`\`\`\n`)),
    ).toBe(`${file}\n`)
    expect(assistText({ field: 'skill.reference', current: '' }, reply(`~~~\n# Ref\n~~~`))).toBe(
      '# Ref\n',
    )
    // A fence at the top that is not around the whole file: the front matter would sit in a code block.
    expect(() =>
      assistText({ field: 'skill.file', current }, reply('```md\n---\nname: x\n---\n```\n# T')),
    ).toThrow('wrapped the file in a code fence')
    // A block field keeps a fence: a passage may be one.
    expect(assistText({ field: 'skill.passage', current: '' }, reply('```\nx\n```'))).toBe(
      '```\nx\n```',
    )
  })

  it('unwraps a fenced file whose lines end in CRLF', () => {
    const crlf = '```markdown\r\n# Ref\r\n\r\nText.\r\n```'
    expect(assistText({ field: 'skill.reference', current: '' }, reply(crlf))).toBe(
      '# Ref\r\n\r\nText.\n',
    )
  })

  it('never cuts a file that only opens and ends with code blocks of its own', () => {
    // The first fence closes at the first bare fence: unwrapped, the file would lose both ends.
    const file = '```js\ncode\n```\n\n# Title\n\ntext\n\n```\nmore\n```'
    expect(() => assistText({ field: 'skill.reference', current: '' }, reply(file))).toThrow(
      'wrapped the file in a code fence',
    )
    // A wrapper named as Markdown is one for sure, bare fences inside it and all.
    expect(
      assistText(
        { field: 'skill.reference', current: '' },
        reply('```markdown\n# Ref\n\n```\ncode\n```\n```'),
      ),
    ).toBe('# Ref\n\n```\ncode\n```\n')
  })

  it('refuses a reply that is not the agreed object, or is empty', () => {
    expect(() => assistText({ field: 'case.check', current: '' }, '{"text": "cut of')).toThrow(
      'cut off',
    )
    expect(() => assistText({ field: 'case.check', current: '' }, reply('  '))).toThrow('no text')
    expect(() => assistText({ field: 'case.check', current: '' }, '{"other": 1}')).toThrow(
      'no text',
    )
  })
})

const graders = (...statements: string[]) =>
  statements.map((statement) => ({ id: null, statement, weight: 1, image: null }))
const savedCase = {
  id: 'shift',
  title: 'A covered shift',
  prompt: 'Thank Priya.',
  expectedOutcome: '',
  graders: graders('The note names Priya.'),
  files: [] as string[],
  dir: 'evals/cases/shift' as string | null,
}

describe('workingSkill', () => {
  it('lays unsaved drafts over the saved files and cases', () => {
    const working = workingSkill(
      { 'SKILL.md': '# Notes\n', 'references/tone.md': 'Warm.\n' },
      [savedCase],
      {
        files: {
          'references/voice.md': { text: 'Samples.\n', previous: null },
          'references/tone.md': { text: 'Warm.\n', previous: 'Warm.\n' },
          'evals/bench.json': { text: '{}', previous: null },
        },
        cases: {
          shift: { ...savedCase, prompt: 'Thank Priya warmly.', words: null, images: [] },
          gone: { ...savedCase, id: 'gone', words: null, images: [] },
          [NEW_CASE_KEY]: {
            ...savedCase,
            id: '',
            title: 'Edit a draft',
            graders: graders('', 'No em dash.'),
            words: null,
            images: [],
          },
        },
      },
    )
    expect(working.files).toEqual([
      { path: 'SKILL.md', text: '# Notes\n', unsaved: false },
      // A draft that matches the saved text is not unsaved work.
      { path: 'references/tone.md', text: 'Warm.\n', unsaved: false },
      { path: 'references/voice.md', text: 'Samples.\n', unsaved: true },
    ])
    expect(
      working.cases.map((c) => [c.id, c.prompt, c.checks.map((x) => x.statement), c.unsaved]),
    ).toEqual([
      ['shift', 'Thank Priya warmly.', ['The note names Priya.'], true],
      [NEW_CASE_KEY, 'Thank Priya.', ['No em dash.'], true],
    ])
  })

  it('names each case’s input files as the agent finds them', () => {
    const dir = 'evals/cases/shift'
    const saved = {
      ...savedCase,
      files: [`${dir}/files/rota.png`, `${dir}/files/screen/Bookings.tsx`],
    }
    const shot = { name: 'new.png', file: null, upload: 'u1' }
    const inputs = (drafts: Parameters<typeof workingSkill>[2]['cases']) =>
      workingSkill({}, [saved], { files: {}, cases: drafts }).cases.map((c) => c.inputs)
    expect(inputs({})).toEqual([['screen/ (1 file)', 'rota.png']])
    // A draft says which pictures the case has, and which files it adds and takes out.
    const tokens = { name: 'tokens.css', upload: 'a'.repeat(24), files: 1, folder: false }
    expect(
      inputs({
        shift: { ...savedCase, words: null, images: [shot], added: [tokens], removed: ['screen'] },
      }),
    ).toEqual([['tokens.css', 'new.png']])
  })

  it('reads only a draft of the case’s own, whatever its id', () => {
    // `constructor` is a name every object answers to: no draft of that case was stored.
    const own = { ...savedCase, id: 'constructor' }
    const working = workingSkill({ 'SKILL.md': '# Notes\n' }, [own], { files: {}, cases: {} })
    expect(working.cases.map((c) => [c.id, c.prompt, c.unsaved])).toEqual([
      ['constructor', 'Thank Priya.', false],
    ])
  })
})

describe('weightNote', () => {
  it('names a weight only when it is not 1', () => {
    expect(weightNote(1)).toBe('')
    expect(weightNote(2)).toBe(' (weight 2)')
  })
})

describe('chatSystem', () => {
  const skill = {
    name: 'notes',
    ...workingSkill({ 'SKILL.md': '---\nname: notes\n---\n# Notes\n' }, [savedCase], {
      files: { 'references/voice.md': { text: 'Samples.\n', previous: null } },
      cases: {},
    }),
  }

  it('talks to a new reader: short, in their words, with how the app works kept out', () => {
    const system = chatSystem({ screen: 'Cases', open: { file: null, case: 'shift' }, skill })
    expect(system).toContain(VOICE)
    expect(VOICE).toContain('One to three short sentences')
    expect(VOICE).toContain('Never say how the app works inside')
  })

  it('carries the skill as the reader has it, unsaved work included', () => {
    const system = chatSystem({ screen: 'Cases', open: { file: null, case: 'shift' }, skill })
    expect(system).toContain(
      '<case name="A covered shift, id shift">\nPrompt: Thank Priya.\nInput files: none\nCheck 1: The note names Priya.\n</case>',
    )
    // Every brief says what a run can see, so no prompt or check counts on the author's project.
    expect(system).toContain("cannot read the author's project")
    expect(system).toContain(
      'The reader is on the Cases screen. They have the case "A covered shift" open.',
    )
    expect(system).toContain('"weight": 2}')
    expect(system).toContain('The open skill is "notes".')
    expect(system).toContain('<file name="SKILL.md">\n---\nname: notes\n---\n# Notes\n</file>')
    expect(system).toContain('<file name="references/voice.md (unsaved)">\nSamples.\n</file>')
    expect(system).toContain(CHANGES_GUIDE)
  })

  it('names the open file and a new case', () => {
    expect(
      chatSystem({ screen: 'Editor', open: { file: 'references/voice.md', case: null }, skill }),
    ).toContain('They have references/voice.md open, with unsaved changes.')
    expect(
      chatSystem({ screen: 'Cases', open: { file: null, case: NEW_CASE_KEY }, skill }),
    ).toContain('They are writing a new case, not saved yet.')
  })

  it('reads references whole while the budget lasts, the open one first', () => {
    const long = 'x'.repeat(CONTEXT_BUDGET - 10)
    const big = {
      name: 'notes',
      ...workingSkill(
        { 'SKILL.md': '# Notes\n', 'references/a.md': long, 'references/b.md': long },
        [],
        { files: {}, cases: {} },
      ),
    }
    const system = chatSystem({
      screen: 'Editor',
      open: { file: 'references/b.md', case: null },
      skill: big,
    })
    expect(system).toContain('<file name="references/b.md">')
    expect(system).not.toContain('<file name="references/a.md">')
    expect(system).toContain('Reference files too long to include here: references/a.md.')
  })

  it('shares the budget with the cases, and names the cases left out', () => {
    const long = 'x'.repeat(CONTEXT_BUDGET - 100)
    const cases = ['one', 'two', 'three'].map((id) => ({
      ...savedCase,
      id,
      title: `Case ${id}`,
      prompt: 'y'.repeat(60),
    }))
    const big = {
      name: 'notes',
      ...workingSkill({ 'SKILL.md': '# Notes\n', 'references/a.md': long }, cases, {
        files: {},
        cases: {},
      }),
    }
    const system = chatSystem({ screen: 'Cases', open: { file: null, case: null }, skill: big })
    expect(system).toContain('<file name="references/a.md">')
    expect(system).not.toContain('<case name="Case one, id one">')
    expect(system).toContain(
      '3 more cases are left out here for length, by name: Case one, id one; Case two, id two; Case three, id three.',
    )
    expect(system).not.toContain('Its cases:')
    // With room, every case is read in full and nothing is said to be left out.
    const small = { ...big, files: big.files.filter((f) => f.path === 'SKILL.md') }
    const roomy = chatSystem({ screen: 'Cases', open: { file: null, case: null }, skill: small })
    expect(roomy).toContain('<case name="Case three, id three">')
    expect(roomy).not.toContain('left out here')
  })

  it('says so when no skill is open', () => {
    const system = chatSystem({ screen: 'Library', open: { file: null, case: null }, skill: null })
    expect(system).toContain('No skill is open, so you cannot change one')
    expect(system).not.toContain(CHANGES_GUIDE)
  })
})
