import { describe, expect, it } from 'vitest'
import {
  applyPracticeEdit,
  PRACTICE,
  PRACTICE_EDIT,
  type PracticeFacts,
  practiceProgress,
  practiceVersionName,
} from './practice.ts'
import { rulesFromSkill } from './rules.ts'
import { templateBody } from './templates.ts'
import { isSlug } from './text.ts'

const body = templateBody(PRACTICE, PRACTICE.name)

describe('the practice skill', () => {
  it('is a small finished skill whose every bullet is a graded rule', () => {
    expect(isSlug(PRACTICE.name)).toBe(true)
    expect(body).toMatch(/^# Thank-you note\n/)
    const rules = rulesFromSkill(body)
    expect(rules).toHaveLength(4)
    expect(rules.map((r) => r.text)).toContain(PRACTICE_EDIT.bad)
    expect(PRACTICE_EDIT.bad.toLowerCase()).toMatch(PRACTICE_EDIT.phrase.toLowerCase())
  })

  it('comes with cases that need no typing and a length a note can be held to', () => {
    expect(PRACTICE.cases).toHaveLength(3)
    const ids = PRACTICE.cases.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of PRACTICE.cases) {
      expect(isSlug(c.id), c.id).toBe(true)
      expect(c.title.trim().length, c.id).toBeGreaterThan(0)
      expect(c.prompt.trim().length, c.id).toBeGreaterThan(20)
      expect(c.expectedOutcome.trim().length, c.id).toBeGreaterThan(0)
      expect(c.graders.length, c.id).toBeGreaterThanOrEqual(3)
      for (const g of c.graders) expect(g.statement.trim().length).toBeGreaterThan(0)
      expect(c.words?.[1], c.id).toBeGreaterThan(c.words?.[0] ?? Number.POSITIVE_INFINITY)
    }
  })

  it('never tells the agent how long a note is, so the vague rule is the only thing to fix', () => {
    const limit = String(PRACTICE.cases[0].words?.[1])
    for (const text of [body, PRACTICE.description, ...PRACTICE.cases.map((c) => c.prompt)]) {
      expect(text).not.toMatch(limit)
      expect(text).not.toMatch(/two.sentence/i)
    }
    expect(PRACTICE_EDIT.good).toMatch(limit)
    expect(PRACTICE_EDIT.good).toMatch('two sentences')
  })

  it('checks every case for the two sentences the exact rule asks for', () => {
    for (const c of PRACTICE.cases)
      expect(
        c.graders.map((g) => g.statement),
        c.id,
      ).toContain('The note has exactly two sentences.')
  })
})

describe('applyPracticeEdit', () => {
  it('swaps the vague rule for the exact one and leaves the rest alone', () => {
    const edited = applyPracticeEdit(body)
    expect(edited).not.toBeNull()
    const rules = rulesFromSkill(edited ?? '').map((r) => r.text)
    expect(rules).toHaveLength(4)
    expect(rules).toContain(PRACTICE_EDIT.good)
    expect(rules).not.toContain(PRACTICE_EDIT.bad)
  })

  it('has nothing to offer once the vague rule is gone', () => {
    expect(applyPracticeEdit(applyPracticeEdit(body) ?? '')).toBeNull()
    expect(applyPracticeEdit('# Other\n\n- A rule of my own writing.\n')).toBeNull()
  })
})

describe('practiceProgress', () => {
  const facts = (patch: Partial<PracticeFacts> = {}): PracticeFacts => ({
    versions: [],
    current: 'v0',
    graded: 0,
    rated: 0,
    votes: 0,
    ...patch,
  })

  it('walks the loop in order', () => {
    expect(practiceProgress(facts()).step).toBe('run')
    expect(practiceProgress(facts({ versions: ['v0'], graded: 3 })).step).toBe('rate')
    expect(practiceProgress(facts({ versions: ['v0'], graded: 3, rated: 2 })).step).toBe('rate')
    expect(practiceProgress(facts({ versions: ['v0'], graded: 3, rated: 3 })).step).toBe('edit')
    expect(
      practiceProgress(facts({ versions: ['v0'], current: 'v1', graded: 3, rated: 3 })).step,
    ).toBe('rerun')
    const reran = facts({ versions: ['v0', 'v1'], current: 'v1', graded: 3, rated: 3 })
    expect(practiceProgress(reran).step).toBe('compare')
    expect(practiceProgress({ ...reran, votes: 1 }).step).toBe(null)
  })

  it('waits for the judge before asking for ratings', () => {
    const { done, step } = practiceProgress(facts({ versions: ['v0'] }))
    expect(done.run).toBe(true)
    expect(done.rate).toBe(false)
    expect(step).toBe('rate')
  })

  it('keeps an edit that was run, even when the files went back to the first version', () => {
    const { done } = practiceProgress(
      facts({ versions: ['v0', 'v1'], current: 'v0', graded: 3, rated: 3 }),
    )
    expect(done.edit).toBe(true)
    expect(done.rerun).toBe(true)
  })

  it('does not count a vote cast before there are two versions to compare', () => {
    const { done } = practiceProgress(facts({ versions: ['v0'], graded: 3, rated: 3, votes: 2 }))
    expect(done.compare).toBe(false)
  })

  it('names the versions it runs', () => {
    expect(practiceVersionName(0)).toBe('As written')
    expect(practiceVersionName(1)).toBe('My edit')
  })
})
