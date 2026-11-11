import { describe, expect, it } from 'vitest'
import { versionAfterRunDelete } from './run-delete.ts'

describe('versionAfterRunDelete', () => {
  const run = { version: 'v1', saved: false, otherRuns: 0, snapshot: true }

  it('leaves a version another copy keeps', () => {
    expect(versionAfterRunDelete({ ...run, saved: true })).toBe('stays')
    expect(versionAfterRunDelete({ ...run, otherRuns: 1 })).toBe('stays')
  })

  it("saves the version from the run's snapshot when the run is its last copy", () => {
    expect(versionAfterRunDelete(run)).toBe('saved')
  })

  it('takes the version only when the last run kept no snapshot', () => {
    expect(versionAfterRunDelete({ ...run, snapshot: false })).toBe('goes')
  })

  it('has nothing to say for a run with no version', () => {
    expect(versionAfterRunDelete({ ...run, version: '', snapshot: false })).toBe('none')
  })
})
