import { describe, expect, it } from 'vitest'
import {
  applyPracticeEdit,
  isLookStep,
  LOOK_STEPS,
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
    saved: 0,
    current: 'v0',
    changed: true,
    graded: 0,
    rated: 0,
    votes: 0,
    seen: [],
    ...patch,
  })
  const at = (patch: Partial<PracticeFacts>) => practiceProgress(facts(patch)).step

  it('walks the whole workflow in order', () => {
    expect(at({})).toBe('read')
    expect(at({ seen: ['read'] })).toBe('version')
    expect(at({ seen: ['read'], saved: 1, changed: false })).toBe('cases')
    expect(at({ seen: ['read', 'cases'], saved: 1, changed: false })).toBe('run')
    const ran = { versions: ['v0'], saved: 1, changed: false, graded: 3, seen: ['cases'] }
    expect(at(ran)).toBe('results')
    expect(at({ ...ran, seen: ['cases', 'results'] })).toBe('rate')
    const rated = { ...ran, rated: 3, seen: ['cases', 'results'] }
    expect(at(rated)).toBe('agreement')
    expect(at({ ...rated, seen: ['results', 'agreement'] })).toBe('scoring')
    expect(at({ ...rated, seen: ['agreement', 'scoring'] })).toBe('edit')
    const edited = { ...rated, current: 'v1', changed: true }
    expect(at(edited)).toBe('save')
    expect(at({ ...edited, saved: 2, changed: false })).toBe('rerun')
    const reran = { ...edited, versions: ['v0', 'v1'], saved: 2, changed: false }
    expect(at(reran)).toBe('compare')
    expect(at({ ...reran, votes: 1 })).toBe(null)
  })

  it('counts a run of unsaved files as saving the version and reading what came before', () => {
    const { done } = practiceProgress(facts({ versions: ['v0'] }))
    expect(done.read).toBe(true)
    expect(done.version).toBe(true)
    expect(done.cases).toBe(true)
  })

  it('waits for the judge before asking for ratings', () => {
    const { done, step } = practiceProgress(facts({ versions: ['v0'], seen: ['results'] }))
    expect(done.run).toBe(true)
    expect(done.rate).toBe(false)
    expect(step).toBe('rate')
  })

  it('keeps an edit that was run, even when the files went back to the first version', () => {
    const { done } = practiceProgress(
      facts({ versions: ['v0', 'v1'], current: 'v0', changed: false, graded: 3, rated: 3 }),
    )
    expect(done.edit).toBe(true)
    expect(done.save).toBe(true)
    expect(done.rerun).toBe(true)
  })

  it('does not count a vote cast before there are two versions to compare', () => {
    const { done } = practiceProgress(facts({ versions: ['v0'], graded: 3, rated: 3, votes: 2 }))
    expect(done.compare).toBe(false)
  })

  it('knows the steps that only ask to look', () => {
    expect(LOOK_STEPS.every(isLookStep)).toBe(true)
    expect(isLookStep('run')).toBe(false)
  })

  it('names the versions it runs', () => {
    expect(practiceVersionName(0)).toBe('As written')
    expect(practiceVersionName(1)).toBe('My edit')
  })
})
