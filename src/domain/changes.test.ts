import { describe, expect, it } from 'vitest'
import { caseHolds, changeDraft, replyParts, type SkillChange } from './changes.ts'
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

  it('keeps an id that names a case, and drops one that is not a slug', () => {
    const block = (id: string) =>
      `~~~~ case\n${JSON.stringify({ id, title: 'New title', prompt: 'P' })}\n~~~~`
    expect(replyParts(block('shift'))[0]).toMatchObject({ change: { id: 'shift' } })
    expect(replyParts(block('../etc'))[0]).toMatchObject({ change: { id: 'new-title' } })
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
})

describe('changeDraft', () => {
  const change: CaseChange = {
    kind: 'case',
    id: 'shift',
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
