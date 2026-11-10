import { describe, expect, it } from 'vitest'
import { nextStep, type Standing, screenFor, stepOf } from './next-step.ts'

const standing = (patch: Partial<Standing> = {}): Standing => ({
  running: false,
  practice: null,
  cases: 2,
  runs: 1,
  changed: false,
  compare: null,
  ...patch,
})

describe('nextStep', () => {
  it('suggests nothing before the skill is loaded, or while one of its jobs runs', () => {
    expect(nextStep(null)).toBeNull()
    expect(nextStep(standing({ running: true, cases: 0 }))).toBeNull()
  })

  it('asks for a case first', () => {
    expect(nextStep(standing({ cases: 0, runs: 0 }))).toEqual({
      kind: 'go',
      label: 'Add a case',
      screen: 'cases',
      params: { new: '1' },
    })
  })

  it('then a run, when there is none or the files changed since the last', () => {
    expect(nextStep(standing({ runs: 0 }))).toEqual({ kind: 'run' })
    expect(nextStep(standing({ changed: true }))).toEqual({ kind: 'run' })
  })

  it('then the first case with no pick between its two outputs', () => {
    expect(nextStep(standing({ compare: { caseId: 'note', a: 'v1', b: 'v2' } }))).toEqual({
      kind: 'go',
      label: 'Compare v1 and v2',
      screen: 'results',
      params: { case: 'note' },
    })
  })

  it('and nothing once every case is picked', () => {
    expect(nextStep(standing())).toBeNull()
  })

  it('follows the walkthrough on the practice skill, whatever the skill itself would ask', () => {
    const target = { label: 'Read the cases', screen: 'cases' }
    expect(nextStep(standing({ cases: 0, practice: { next: target } }))).toEqual({
      kind: 'go',
      label: 'Read the cases',
      screen: 'cases',
      params: undefined,
    })
    expect(nextStep(standing({ changed: true, practice: { next: null } }))).toBeNull()
  })
})

describe('stepOf', () => {
  it('reads a step with no screen as the Run button’s', () => {
    expect(stepOf({ label: 'Run v1', screen: null })).toEqual({ kind: 'run' })
  })
})

describe('screenFor', () => {
  const known = (screen: string) => ['editor', 'library'].includes(screen)
  it('keeps a screen the app has and sends any other name home', () => {
    expect(screenFor('editor', 'library', known)).toBe('editor')
    expect(screenFor('changelog', 'library', known)).toBe('library')
  })
})
