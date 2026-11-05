import { describe, expect, it } from 'vitest'
import {
  ASSIST_FIELD_IDS,
  ASSIST_FIELDS,
  assistPrompt,
  assistText,
  chatSystem,
  partialText,
} from './assist.ts'
import { CASE_PROMPT_HINT, RULE_GUIDE, RULE_SHAPE } from './templates.ts'

const reply = (text: string): string => JSON.stringify({ text })

describe('ASSIST_FIELDS', () => {
  it('gives every field a shape and something to ask in one click', () => {
    for (const id of ASSIST_FIELD_IDS) {
      expect(ASSIST_FIELDS[id].shape.length).toBeGreaterThan(40)
      expect(ASSIST_FIELDS[id].suggestions.length).toBeGreaterThan(0)
    }
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

  it('shows the text an edit starts from', () => {
    const { user } = assistPrompt({
      field: 'case.prompt',
      instruction: 'Shorter',
      current: 'Thank Priya for the shift.',
      context: [],
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

describe('chatSystem', () => {
  it('carries the open skill and the screen', () => {
    const system = chatSystem({
      screen: 'Cases',
      skill: {
        name: 'notes',
        description: 'Writes notes.',
        skillMd: '# Notes',
        references: ['references/tone.md'],
        cases: [
          {
            id: 'shift',
            title: 'A covered shift',
            prompt: 'Thank Priya.',
            expected: '',
            checks: ['The note names Priya.'],
          },
        ],
      },
    })
    expect(system).toContain(
      '<case name="A covered shift">\nPrompt: Thank Priya.\nCheck 1: The note names Priya.\n</case>',
    )
    expect(system).toContain('The reader is on the Cases screen.')
    expect(system).toContain('The open skill is "notes": Writes notes.')
    expect(system).toContain('references/tone.md')
    expect(system).toContain('<skill_md>\n# Notes\n</skill_md>')
  })

  it('says so when no skill is open', () => {
    expect(chatSystem({ screen: 'Library', skill: null })).toContain('No skill is open.')
  })
})
