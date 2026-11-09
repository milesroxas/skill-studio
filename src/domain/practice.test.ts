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
    current: 'v0',
    picks: 0,
    seen: [],
    ...patch,
  })
  const at = (patch: Partial<PracticeFacts>) => practiceProgress(facts(patch)).step

  it('walks the loop in order: write, run, compare', () => {
    expect(at({})).toBe('read')
    expect(at({ seen: ['read'] })).toBe('cases')
    expect(at({ seen: ['read', 'cases'] })).toBe('run')
    const ran = { versions: ['v0'], seen: ['read', 'cases'] }
    expect(at(ran)).toBe('results')
    expect(at({ ...ran, seen: ['read', 'cases', 'results'] })).toBe('edit')
    const edited = { ...ran, current: 'v1', seen: ['results'] }
    expect(at(edited)).toBe('rerun')
    const reran = { ...edited, versions: ['v0', 'v1'] }
    expect(at(reran)).toBe('compare')
    expect(at({ ...reran, picks: 1 })).toBe(null)
  })

  it('counts a run as having read the skill and its cases', () => {
    const { done } = practiceProgress(facts({ versions: ['v0'] }))
    expect(done.read).toBe(true)
    expect(done.cases).toBe(true)
    expect(done.run).toBe(true)
  })

  it('counts an edit as having read what the first run missed', () => {
    const { done, step } = practiceProgress(facts({ versions: ['v0'], current: 'v1' }))
    expect(done.results).toBe(true)
    expect(done.edit).toBe(true)
    expect(step).toBe('rerun')
  })

  it('keeps an edit that was run, even when the files went back to the first version', () => {
    const { done } = practiceProgress(facts({ versions: ['v0', 'v1'], current: 'v0' }))
    expect(done.edit).toBe(true)
    expect(done.rerun).toBe(true)
  })

  it('does not count a pick made before there are two versions to compare', () => {
    const { done } = practiceProgress(facts({ versions: ['v0'], picks: 2 }))
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
