import { practiceProgress } from '@domain/practice.ts'
import { describe, expect, it, vi } from 'vitest'
import type { State } from './api.ts'
import type { Output } from './model.ts'
import { type PracticeWalk, practiceGuide } from './practice.ts'

// The guide is worked out from the state alone; the host it would call is not here.
vi.mock('./api.ts', () => ({ api: {} }))

const state = {
  versions: { current: { version: 'v1' } },
  cases: [{ id: 'covered-shift' }, { id: 'overnight-review' }],
} as unknown as State

const output = (caseId: string, version: string) =>
  ({ caseId, run: { meta: { skillVersion: version } } }) as unknown as Output

const outputs = ['v0', 'v1'].flatMap((v) => [
  output('covered-shift', v),
  output('overnight-review', v),
])

/** Run twice, the first results read: the comparison is the step in hand. */
const walk: PracticeWalk = {
  versions: ['v0', 'v1'],
  progress: practiceProgress({ versions: ['v0', 'v1'], current: 'v1', seen: ['results'] }),
}

const guideAt = (screen: string, params: Record<string, string>, w = walk) =>
  practiceGuide(state, outputs, w, {
    screen,
    params: new URLSearchParams(params),
    reading: null,
    unsaved: false,
    running: false,
  })

describe('practiceGuide, at the comparison', () => {
  it('opens the first case both versions answered', () => {
    expect(guideAt('editor', {}).target).toEqual({
      label: 'Compare v0 and v1',
      screen: 'results',
      params: { case: 'covered-shift' },
    })
  })

  it('is where the step happens on that case, or on Results as it opens', () => {
    expect(guideAt('results', { case: 'covered-shift' }).here).toBe(true)
    expect(guideAt('results', { case: 'covered-shift', a: 'r0/x', b: 'r1/x' }).here).toBe(true)
    // Opened from the sidebar, Results shows the first case: the one compared.
    expect(guideAt('results', {}).here).toBe(true)
    expect(guideAt('results', { case: 'overnight-review' }).here).toBe(false)
    expect(guideAt('editor', {}).here).toBe(false)
  })

  it('keeps to the comparison while it is read, then says the loop is closed', () => {
    const closed: PracticeWalk = {
      versions: ['v0', 'v1'],
      progress: practiceProgress({ versions: ['v0', 'v1'], current: 'v1', seen: ['compare'] }),
    }
    const reading = practiceGuide(state, outputs, closed, {
      screen: 'results',
      params: new URLSearchParams({ case: 'covered-shift' }),
      reading: 'compare',
      unsaved: false,
      running: false,
    })
    expect(reading).toMatchObject({ step: 'compare', title: 'Compare the two notes', next: null })
    // Another case is not this comparison: the loop reads as closed there.
    const elsewhere = practiceGuide(state, outputs, closed, {
      screen: 'results',
      params: new URLSearchParams({ case: 'overnight-review' }),
      reading: 'compare',
      unsaved: false,
      running: false,
    })
    expect(elsewhere.step).toBeNull()
    expect(guideAt('editor', {}, closed)).toMatchObject({
      step: null,
      title: 'You have been round the loop',
    })
  })
})
