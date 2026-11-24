import { describe, expect, it } from 'vitest'
import { NO_CORRECTIONS, type Verdict } from './pack.ts'
import {
  addAgreements,
  agreementOf,
  type CheckedMark,
  checkedFindings,
  checkedMarks,
  factsAsked,
  filesMessage,
  type Mark,
  parseReading,
  quoteHolds,
  READING_BRIEF_INLINE,
  type ReadFact,
  type ReadOutput,
  readFacts,
  sheetText,
  swapped,
} from './reading.ts'
import { codeVerdict, jevVerdict, unmarkableVerdict, verdictId } from './verdict.ts'

const CUTS = { yes: 0.7, no: 0.3 }
const rule = (text: string, noul: number, corrections = NO_CORRECTIONS, applies = 1): Verdict =>
  jevVerdict(
    { kind: 'rule', text, layer: 'adherence', section: 'Rules' },
    noul,
    CUTS,
    corrections,
    applies,
  )
const check = (text: string, noul: number): Verdict =>
  jevVerdict({ kind: 'check', text, layer: 'rubric' }, noul, CUTS, NO_CORRECTIONS)

describe('readFacts', () => {
  it('numbers the rules and the checks apart, in the order listed', () => {
    const facts = readFacts([rule('Keep it short.', 0.9), check('It names Priya.', 0.1)])
    expect(facts.map((f) => [f.ref, f.kind, f.jev])).toEqual([
      ['R1', 'rule', 'met'],
      ['C1', 'check', 'missed'],
    ])
    expect(facts[0].section).toBe('Rules')
  })

  it('reads an answer between the thresholds as not sure', () => {
    expect(readFacts([rule('Keep it short.', 0.5)])[0].jev).toBe('not sure')
  })

  it('leaves out a rule that does not apply, and a fact code measured', () => {
    const measured = codeVerdict(
      { kind: 'check', text: 'The command passes.', layer: 'check' },
      true,
    )
    expect(readFacts([rule('For a screen mockup.', 0.5, NO_CORRECTIONS, 0.1), measured])).toEqual(
      [],
    )
  })

  it('reads a fact as code answered it where code’s answer stands, and leaves out one nobody can mark', () => {
    const counted = jevVerdict(
      { kind: 'rule', text: 'Keep it short.', layer: 'adherence' },
      0.9,
      CUTS,
      NO_CORRECTIONS,
      1,
      { answer: 'missed', saw: [] },
    )
    const unsettled = jevVerdict(
      { kind: 'rule', text: 'Keep it shorter.', layer: 'adherence' },
      0.9,
      CUTS,
      NO_CORRECTIONS,
      1,
      { answer: 'none', why: 'convention', saw: [] },
    )
    const vague = unmarkableVerdict(
      { kind: 'rule', text: 'Be friendly.', layer: 'adherence' },
      { why: 'vague', with: null, fix: null },
      NO_CORRECTIONS,
    )
    expect(readFacts([counted, unsettled, vague]).map((f) => f.jev)).toEqual(['missed', 'not sure'])
  })

  it('keeps the reader’s own answer beside Jev’s', () => {
    const id = verdictId('rule', 'Keep it short.')
    const [fact] = readFacts([rule('Keep it short.', 0.5, { [id]: true })])
    expect(fact).toMatchObject({ jev: 'not sure', yours: true })
  })
})

const fact = (ref: string, jev: ReadFact['jev'], yours: boolean | null = null): ReadFact => ({
  id: `rule:${ref}`,
  ref,
  kind: 'rule',
  text: `Rule ${ref}.`,
  jev,
  yours,
})

describe('factsAsked', () => {
  const facts = [fact('R1', 'met'), fact('R2', 'not sure'), fact('R3', 'missed')]

  it('asks only what Jev was not sure of', () => {
    expect(factsAsked(facts, false).map((f) => f.ref)).toEqual(['R2'])
  })

  it('asks everything when blind', () => {
    expect(factsAsked(facts, true)).toHaveLength(3)
  })
})

describe('quoteHolds', () => {
  const file = 'The window\n  sits 64px from\tevery edge, as “asked”.'

  it('finds words across a line break and other spacing', () => {
    expect(quoteHolds(file, 'window sits 64px from every edge')).toBe(true)
  })

  it('reads curly quotes as straight ones', () => {
    expect(quoteHolds(file, 'every edge, as "asked".')).toBe(true)
  })

  it('refuses words the file does not hold', () => {
    expect(quoteHolds(file, 'sits 48px from every edge')).toBe(false)
  })

  it('refuses a quote too short to show anything', () => {
    expect(quoteHolds(file, 'as')).toBe(false)
    expect(quoteHolds(file, '64px')).toBe(true)
  })
})

const mark = (over: Partial<Mark> = {}): Mark => ({
  output: 'note-s1',
  fact: 'R1',
  answer: 'met',
  why: 'It is short.',
  file: 'note-s1/outputs/note.md',
  quote: 'Thank you for the dinner on Friday',
  ...over,
})

const outputs = (asked: ReadFact[]): Record<string, ReadOutput> => ({
  'note-s1': {
    facts: asked,
    asked,
    files: { 'note-s1/outputs/note.md': 'Dear Priya,\nThank you for the dinner on Friday.' },
  },
})

describe('checkedMarks', () => {
  const asked = [fact('R1', 'not sure'), fact('R2', 'not sure')]

  it('keeps an answer whose quote is in the file it names', () => {
    expect(checkedMarks([mark()], outputs(asked))).toMatchObject([
      { answer: 'met', evidence: 'quoted', fact: { ref: 'R1' } },
    ])
  })

  it('takes the file’s path with a leading ./', () => {
    const [checked] = checkedMarks([mark({ file: './note-s1/outputs/note.md' })], outputs(asked))
    expect(checked.evidence).toBe('quoted')
  })

  it('sets an answer whose quote is not there to cannot tell, and keeps what was said', () => {
    expect(
      checkedMarks([mark({ quote: 'Thank you for the lovely lunch' })], outputs(asked)),
    ).toMatchObject([{ answer: 'cannot tell', evidence: 'unfound', said: 'met' }])
  })

  it('does not find a quote in a file the output does not have', () => {
    const [checked] = checkedMarks([mark({ file: '../skill/SKILL.md' })], outputs(asked))
    expect(checked.evidence).toBe('unfound')
  })

  it('keeps an answer with no quote, marked so', () => {
    expect(checkedMarks([mark({ quote: '' })], outputs(asked))).toMatchObject([
      { answer: 'met', evidence: 'unquoted' },
    ])
  })

  it('leaves out an answer on a fact not asked, an unknown output, and a second answer', () => {
    const checked = checkedMarks(
      [mark(), mark({ answer: 'missed' }), mark({ fact: 'R9' }), mark({ output: 'other-s1' })],
      outputs(asked),
    )
    expect(checked.map((m) => [m.fact.ref, m.answer])).toEqual([['R1', 'met']])
  })

  it('reads a fact’s name in either case', () => {
    expect(checkedMarks([mark({ fact: 'r2' })], outputs(asked))).toHaveLength(1)
  })
})

describe('checkedFindings', () => {
  const finding = {
    output: 'note-s1',
    text: 'It is cold.',
    check: 'It is warm.',
    file: '',
    quote: '',
  }

  it('keeps a finding with no quote, and one whose quote is found', () => {
    const quoted = {
      ...finding,
      file: 'note-s1/outputs/note.md',
      quote: 'Thank you for the dinner',
    }
    expect(checkedFindings([finding, quoted], outputs([]))).toHaveLength(2)
  })

  it('leaves out one whose quote is not there, and one on an unknown output', () => {
    const invented = {
      ...finding,
      file: 'note-s1/outputs/note.md',
      quote: 'Kind regards, the team',
    }
    expect(checkedFindings([invented, { ...finding, output: 'x-s1' }], outputs([]))).toEqual([])
  })
})

describe('parseReading', () => {
  it('reads marks, findings and the note', () => {
    const reading = parseReading(
      JSON.stringify({
        marks: [mark(), { ...mark(), answer: 'perhaps' }, { answer: 'met' }],
        findings: [
          { output: 'note-s1', text: ' It is cold. ', check: 'It is warm.' },
          { text: 'x' },
        ],
        note: ' Fine. ',
      }),
    )
    expect(reading.marks.map((m) => m.answer)).toEqual(['met', 'cannot tell'])
    expect(reading.findings).toEqual([
      { output: 'note-s1', text: 'It is cold.', check: 'It is warm.', file: '', quote: '' },
    ])
    expect(reading.note).toBe('Fine.')
  })

  it('throws on a reply that is no JSON', () => {
    expect(() => parseReading('Here you go')).toThrow('did not answer in the shape')
  })

  it('reads a reply with nothing in it as an empty reading', () => {
    expect(parseReading('null')).toEqual({ marks: [], findings: [], note: '' })
  })
})

const checked = (over: Partial<CheckedMark> & { fact: ReadFact }): CheckedMark => ({
  ...mark(),
  evidence: 'quoted',
  ...over,
})

describe('agreementOf', () => {
  it('counts answers against the reader’s own, and apart those with a quote', () => {
    const tally = agreementOf(
      [
        checked({ fact: fact('R1', 'not sure', true) }),
        checked({ fact: fact('R2', 'not sure', false), evidence: 'unquoted' }),
        checked({ fact: fact('R3', 'not sure', false), answer: 'missed' }),
      ],
      3,
    )
    expect(tally.yours).toEqual({ agree: 2, total: 3 })
    expect(tally.yoursQuoted).toEqual({ agree: 2, total: 2 })
    expect(tally.settled).toEqual({ agree: 3, total: 3 })
  })

  it('counts answers against Jev only where Jev was sure and the reader gave none', () => {
    const tally = agreementOf(
      [
        checked({ fact: fact('R1', 'met') }),
        checked({ fact: fact('R2', 'missed') }),
        checked({ fact: fact('R3', 'met', false) }),
      ],
      3,
    )
    expect(tally.jev).toEqual({ agree: 1, total: 2 })
    expect(tally.yours).toEqual({ agree: 0, total: 1 })
  })

  it('counts cannot tell, a quote not found, and a fact left unanswered', () => {
    const tally = agreementOf(
      [checked({ fact: fact('R1', 'not sure'), answer: 'cannot tell', evidence: 'unfound' })],
      2,
    )
    expect(tally).toMatchObject({ asked: 2, answered: 0, cannotTell: 1, skipped: 1, unfound: 1 })
    expect(tally.settled).toEqual({ agree: 0, total: 1 })
  })

  it('adds two tallies', () => {
    const one = agreementOf([checked({ fact: fact('R1', 'not sure', true) })], 1)
    expect(addAgreements(one, one)).toMatchObject({
      asked: 2,
      answered: 2,
      yours: { agree: 2, total: 2 },
    })
  })
})

describe('sheetText', () => {
  const facts = [fact('R1', 'met'), fact('R2', 'not sure', true)]
  const output = (blind: boolean) => ({
    name: 'note-s1',
    facts,
    asked: factsAsked(facts, blind),
    paths: ['note-s1/outputs/note.md'],
  })

  it('lists what to answer, and what Jev was sure of', () => {
    const sheet = sheetText([output(false)], false)
    expect(sheet).toContain('## Answer each of these\n- R2: Rule R2.')
    expect(sheet).toContain('- R1: Rule R1. [met]')
    expect(sheet).toContain('Its files: note-s1/outputs/note.md')
  })

  it('shows none of Jev’s answers when blind, and asks every fact', () => {
    const sheet = sheetText([output(true)], true)
    expect(sheet).toContain('- R1: Rule R1.\n- R2: Rule R2.')
    expect(sheet).not.toContain('[met]')
    expect(sheet).not.toContain('Already marked')
  })

  it('never shows the reader’s own answer', () => {
    expect(sheetText([output(false)], false)).not.toMatch(/yours|true/)
  })
})

describe('filesMessage', () => {
  it('puts each file in a block, those named first in their order, the rest by path, then what to do', () => {
    const message = filesMessage(
      [
        { path: 'B/outputs/email.txt', text: 'Second.\n' },
        { path: 'request.md', text: 'Write it.' },
        { path: 'A/outputs/email.txt', text: 'First.' },
        { path: 'sheet.md', text: 'Read A and B.' },
      ],
      'Read sheet.md, then answer.',
      ['sheet.md', 'request.md'],
    )
    expect([...message.matchAll(/<file path="([^"]+)">/g)].map((m) => m[1])).toEqual([
      'sheet.md',
      'request.md',
      'A/outputs/email.txt',
      'B/outputs/email.txt',
    ])
    expect(message).toContain('<file path="B/outputs/email.txt">\nSecond.\n</file>')
    expect(message.endsWith('Read, in the files above, sheet.md, then answer.')).toBe(true)
  })

  it("swaps a brief's sentences, and refuses one it no longer holds", () => {
    expect(swapped('You read a folder.', [['a folder', 'a message']])).toBe('You read a message.')
    expect(() => swapped('You read a folder.', [['a shelf', 'a message']])).toThrow(
      'no longer says: a shelf',
    )
    expect(READING_BRIEF_INLINE).toContain('The message holds one request')
    expect(READING_BRIEF_INLINE).not.toContain('page.png')
  })
})
