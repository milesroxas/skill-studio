import { describe, expect, it } from 'vitest'
import { atTarget, nextStep, type Standing, screenFor, stepOf } from './next-step.ts'

const standing = (patch: Partial<Standing> = {}): Standing => ({
  running: false,
  practice: null,
  cases: 2,
  runs: 1,
  changed: false,
  unread: false,
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

  it('then the results of a run that finished since Results was open', () => {
    expect(nextStep(standing({ unread: true }))).toEqual({
      kind: 'go',
      label: 'Read the results',
      screen: 'results',
    })
  })

  it('runs first when the files changed, though the last run is unread', () => {
    expect(nextStep(standing({ unread: true, changed: true }))).toEqual({ kind: 'run' })
  })

  it('and nothing once the results are read: the next step is an edit', () => {
    expect(nextStep(standing())).toBeNull()
  })

  it('follows the walkthrough on the practice skill, whatever the skill itself would ask', () => {
    const target = { label: 'Read the results', screen: 'results' }
    expect(nextStep(standing({ cases: 0, practice: { next: target } }))).toEqual({
      kind: 'go',
      label: 'Read the results',
      screen: 'results',
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

describe('atTarget', () => {
  const target = { screen: 'results', params: { case: 'note' } }
  const at = (screen: string, params: Record<string, string>) =>
    atTarget(target, screen, new URLSearchParams(params))

  it('is there on the screen with the values the target names', () => {
    expect(at('results', { case: 'note' })).toBe(true)
    expect(at('results', { case: 'note', a: 'r0/note-s1' })).toBe(true)
  })

  it('counts a value the address leaves out as the screen’s own choice', () => {
    expect(at('results', {})).toBe(true)
    expect(atTarget({ screen: 'editor' }, 'editor', new URLSearchParams({ file: 'x' }))).toBe(true)
  })

  it('is not there on another screen, or with another value', () => {
    expect(at('cases', { case: 'note' })).toBe(false)
    expect(at('results', { case: 'other' })).toBe(false)
    expect(atTarget({ screen: null }, 'results', new URLSearchParams())).toBe(false)
  })
})

describe('screenFor', () => {
  const known = (screen: string) => ['editor', 'library'].includes(screen)
  it('keeps a screen the app has and sends any other name home', () => {
    expect(screenFor('editor', 'library', known)).toBe('editor')
    expect(screenFor('changelog', 'library', known)).toBe('library')
  })
})
