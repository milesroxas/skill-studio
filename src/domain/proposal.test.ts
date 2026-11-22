import { describe, expect, it } from 'vitest'
import {
  answerNoun,
  asAnswer,
  earlierSheet,
  joinGroups,
  PROPOSALS_MAX,
  type ProposalRoom,
  parseProposals,
  pickProposals,
  proposalSheet,
  retryText,
  sameWords,
  tellsOf,
  tellsOfAll,
  unlistedOf,
} from './proposal.ts'

const ROOM: ProposalRoom = {
  letters: ['A', 'B'],
  checks: ['The email gives the support address.'],
  files: {
    'request.md': 'Write the launch email for the release described in brief.md.\n',
    'note.md': 'A short plain-text email that names no price.\n',
    'inputs/brief.md': 'Internal: The codename Falcon must not appear in anything we publish.\n',
    'A/outputs/email.txt':
      'Subject: Reschedule in one tap\n\nFerry 3.3, built under the name Falcon,\nmakes it easy.',
    'B/outputs/email.txt': 'Subject: Reschedule in one tap\n\nFerry 3.3 makes it easy.',
  },
}

const proposal = (over: Record<string, unknown> = {}) => ({
  check: 'The email never names the codename Falcon.',
  why: 'The brief keeps the codename for the team alone.',
  scope: 'every case',
  basis_file: 'inputs/brief.md',
  basis_quote: 'must not appear in anything we publish',
  answer: 'A',
  fault_file: 'A/outputs/email.txt',
  fault_quote: 'built under the name Falcon, makes',
  meets: [
    { answer: 'A', meets: 'no' },
    { answer: 'B', meets: 'yes' },
  ],
  ...over,
})

const parse = (...items: unknown[]) => parseProposals(JSON.stringify({ proposals: items }), ROOM)

describe('parseProposals', () => {
  it('takes a proposal whose quotes are in the files they name, however the lines break', () => {
    const { taken, refused } = parse(proposal())
    expect(refused).toEqual([])
    expect(taken).toEqual([
      {
        check: 'The email never names the codename Falcon.',
        why: 'The brief keeps the codename for the team alone.',
        scope: 'every case',
        basisFile: 'inputs/brief.md',
        basisQuote: 'must not appear in anything we publish',
        answer: 'A',
        fault: { file: 'A/outputs/email.txt', quote: 'built under the name Falcon, makes' },
        meets: { A: 'no', B: 'yes' },
      },
    ])
  })

  it('takes one no answer misses, and one an answer misses by leaving it out', () => {
    const none = parse(
      proposal({
        basis_file: './note.md',
        basis_quote: 'names no price',
        answer: '',
        fault_file: '',
        fault_quote: '',
        meets: [
          { answer: 'A', meets: 'yes' },
          { answer: 'B', meets: 'yes' },
        ],
      }),
    )
    expect(none.taken[0]).toMatchObject({ basisFile: 'note.md', answer: null, fault: null })
    const left = parse(
      proposal({
        answer: 'b',
        fault_file: '',
        fault_quote: '',
        meets: [
          { answer: 'A', meets: 'yes' },
          { answer: 'B', meets: 'no' },
        ],
      }),
    )
    expect(left.taken[0]).toMatchObject({ answer: 'B', fault: null })
  })

  it('refuses the whole reply when it is not JSON or holds no list', () => {
    expect(parseProposals('not json', ROOM).refused).toEqual([{ index: -1, why: 'it is not JSON' }])
    expect(parseProposals('{"checks":[]}', ROOM).refused[0].index).toBe(-1)
  })

  it.each([
    [
      { fault_quote: 'named Falcon in full' },
      'fault_quote: "named Falcon in full" is not in A/outputs/email.txt',
    ],
    [
      { fault_file: 'B/outputs/email.txt', fault_quote: 'makes it easy' },
      'fault_file: "B/outputs/email.txt" is answer B\'s',
    ],
    [
      { fault_file: 'inputs/brief.md', fault_quote: 'must not appear' },
      "fault_file: is not an answer's file",
    ],
    [{ fault_file: '' }, 'fault_file: is empty'],
    [{ basis_file: 'checks.md' }, 'basis_file: "checks.md" is not a file in this folder'],
    [{ basis_file: 'skill/SKILL.md' }, 'is not a file in this folder'],
    [{ basis_file: 'A/outputs/email.txt', basis_quote: 'Ferry 3.3' }, "basis_file: is an answer's"],
    [{ basis_quote: 'must never appear' }, 'basis_quote: "must never appear" is not in'],
    [{ basis_quote: '' }, 'basis_quote: is empty'],
    [{ answer: 'C' }, 'answer: "C" is not the letter'],
    [{ scope: 'all' }, 'scope:'],
    [{ check: 'The email names it.\nAnd more.' }, 'check: holds a line break'],
    [{ check: 'x'.repeat(201) }, 'check: is over 200'],
    [{ why: '' }, 'why: is empty'],
    [{ meets: [{ answer: 'A', meets: 'no' }] }, 'meets: gives no word on answer B'],
    [
      {
        meets: [
          { answer: 'A', meets: 'no' },
          { answer: 'A', meets: 'no' },
        ],
      },
      'names answer A twice',
    ],
    [
      {
        meets: [
          { answer: 'A', meets: 'yes' },
          { answer: 'B', meets: 'yes' },
        ],
      },
      'says answer A meets the check',
    ],
    [
      {
        meets: [
          { answer: 'A', meets: 'maybe' },
          { answer: 'B', meets: 'yes' },
        ],
      },
      'meets[0].meets',
    ],
  ])('refuses %j, saying where', (over, why) => {
    const { taken, refused } = parse(proposal(), proposal(over))
    expect(taken).toHaveLength(1)
    expect(refused).toHaveLength(1)
    expect(refused[0].index).toBe(1)
    expect(refused[0].why).toContain(why)
  })
})

describe('tellsOf', () => {
  it('tells answers apart only when some meet it and some miss it', () => {
    expect(tellsOf({ A: 'yes', B: 'no' })).toBe('apart')
    expect(tellsOf({ A: 'yes', B: 'yes', C: 'cannot tell' })).toBe('all meet')
    expect(tellsOf({ A: 'no', B: 'no' })).toBe('none meet')
    expect(tellsOf({ A: 'yes', B: 'cannot tell', C: 'cannot tell' })).toBe('unclear')
    expect(tellsOf({ A: 'cannot tell' })).toBe('unclear')
  })
})

describe('pickProposals', () => {
  it('leaves out what a check says, what was turned down, a second of the same, and past the most', () => {
    const list = [
      { check: 'The email gives the support address, help@ferry.example.' },
      { check: 'The email never names the codename Falcon.' },
      { check: 'the email never names the codename "Falcon"' },
      { check: 'The email says the update is free.' },
      ...Array.from({ length: PROPOSALS_MAX }, (_, i) => ({ check: `The email holds item ${i}.` })),
    ]
    const { kept, left } = pickProposals(list, {
      checks: ['The email gives the support address, help@ferry.example'],
      dropped: ['The email says the update is free'],
    })
    expect(kept.map((k) => k.check)).toEqual([
      'The email never names the codename Falcon.',
      ...Array.from({ length: PROPOSALS_MAX - 1 }, (_, i) => `The email holds item ${i}.`),
    ])
    expect(left.map((l) => l.why)).toEqual([
      'same as a check',
      'said twice',
      'turned down',
      'past the most',
    ])
  })

  it('reads two checks as the same words through case, punctuation and spacing only', () => {
    expect(sameWords('The page reads "Book a demo".', 'the page reads book a demo')).toBe(true)
    expect(sameWords('The page reads Book a demo.', 'The page has a Book a demo button.')).toBe(
      false,
    )
  })
})

describe('what the model is shown', () => {
  it('lists the answers by letter, what was turned down, and how many', () => {
    const sheet = proposalSheet({
      answers: [{ letter: 'A', paths: ['A/outputs/email.txt'] }],
      dropped: ['The email is short.'],
      max: 4,
    })
    expect(sheet).toContain('- A: A/outputs/email.txt')
    expect(sheet).toContain('- The email is short.')
    expect(sheet).toContain('no more than 4 checks')
  })

  it('asks again for the refused ones only, each with what was wrong', () => {
    const text = retryText('{"proposals":[]}', [{ index: 1, why: 'quote: is empty' }])
    expect(text).toContain('<earlier>\n{"proposals":[]}\n</earlier>')
    expect(text).toContain('- proposal 2: quote: is empty')
    expect(retryText('oops', [{ index: -1, why: 'it is not JSON' }])).toContain(
      'That reply was not taken: it is not JSON.',
    )
  })
})

describe("the note's facts", () => {
  const withFacts = (facts: unknown[], proposals: unknown[] = [proposal()]) =>
    parseProposals(JSON.stringify({ proposals, note_facts: facts }), ROOM)

  it('takes a fact quoted from the note, with the check or proposal it names', () => {
    const parsed = withFacts([
      { quote: 'A short plain-text email', covered_by: '', why_not: 'Short is a matter of taste.' },
      { quote: 'names no price', covered_by: 'p1', why_not: 'ignored' },
      { quote: 'plain-text', covered_by: 'C1', why_not: '' },
    ])
    expect(parsed.facts).toEqual([
      { quote: 'A short plain-text email', cover: null, whyNot: 'Short is a matter of taste.' },
      { quote: 'names no price', cover: { by: 'proposal', index: 0 }, whyNot: '' },
      { quote: 'plain-text', cover: { by: 'check', index: 0 }, whyNot: '' },
    ])
    expect(parsed.factsRefused).toEqual([])
  })

  it('refuses a fact not in the note, or one that names a check or proposal there is not', () => {
    const parsed = withFacts([
      { quote: 'names the price', covered_by: '', why_not: '' },
      { quote: 'names no price', covered_by: 'C2', why_not: '' },
      { quote: 'names no price', covered_by: 'P2', why_not: '' },
      { quote: 'names no price', covered_by: 'the first one', why_not: '' },
    ])
    expect(parsed.facts).toEqual([])
    expect(parsed.factsRefused).toEqual([
      '"names the price" is not in note.md, word for word',
      '"names no price": C2 is not a check in checks.md',
      '"names no price": P2 is not a proposal of the reply',
      '"names no price": covered_by "THE FIRST ONE" is not a C or P number',
    ])
  })

  it('finds the words of the note no fact quotes, without the words that only join them', () => {
    const note =
      'outputs/email.txt, a short plain-text email that opens with the headline and states the price.'
    expect(unlistedOf(note, ['outputs/email.txt', 'opens with the headline'])).toEqual([
      'short plain-text email',
      'states the price',
    ])
    expect(unlistedOf(note, [note])).toEqual([])
  })
})

describe('joining', () => {
  it('joins what a pair joins, through a third', () => {
    expect(
      joinGroups(4, [
        [0, 2],
        [2, 3],
      ]),
    ).toEqual([[0, 2, 3], [1]])
    expect(joinGroups(2, [])).toEqual([[0], [1]])
  })

  it('reads proposals for every case together', () => {
    expect(tellsOfAll([{ A: 'yes' }, { A: 'no' }])).toBe('apart')
    expect(tellsOfAll([{ A: 'yes' }, { A: 'yes', B: 'yes' }])).toBe('all meet')
  })
})

describe('earlierSheet', () => {
  it('is empty with nothing before, and lists what to keep and what not to propose again', () => {
    expect(earlierSheet({ kept: [], overreach: [] })).toBe('')
    const one = {
      check: 'The email never names the codename Falcon.',
      why: 'It is for the team alone.',
      scope: 'every case' as const,
      basisFile: 'inputs/brief.md',
      basisQuote: 'must not appear',
    }
    const sheet = earlierSheet({ kept: [one], overreach: [] })
    expect(sheet).toContain('# Proposed before')
    expect(sheet).toContain(
      '- The email never names the codename Falcon.\n  why: It is for the team alone.\n  scope: every case\n  basis: inputs/brief.md, "must not appear"',
    )
    expect(sheet).toContain('# Left out before\n\nNone.')
  })
})

describe("the answer's name", () => {
  it('is the word most of a case\'s checks start with, read as "The answer"', () => {
    const noun = answerNoun([
      'The email gives the date.',
      'The email never names Falcon.',
      'The first line of the email is the headline.',
    ])
    expect(noun).toBe('email')
    expect(asAnswer('The email never names Falcon.', noun)).toBe('The answer never names Falcon.')
    expect(asAnswer('The first line of the email is the headline.', noun)).toBe(
      'The first line of the email is the headline.',
    )
    expect(asAnswer('The emails list.', noun)).toBe('The emails list.')
    expect(answerNoun(['The page has a title.'])).toBeNull()
    expect(answerNoun(['The page has a title.', 'The page is short.', 'The answer is.'])).toBe(
      'page',
    )
  })
})
