import { describe, expect, it } from 'vitest'
import type { Job, RunView } from './api.ts'
import { gradingRun, outputWriting } from './job-start.ts'

const job = (patch: Partial<Job>): Job => ({
  id: 1,
  kind: 'generate',
  title: 'Run 2 cases with Claude Code',
  status: 'running',
  log: [],
  startedAt: 0,
  finishedAt: null,
  skillPath: '/skills/a',
  progress: null,
  grading: [],
  writing: [],
  ...patch,
})

describe('gradingRun', () => {
  it('is true while a running job of the skill grades the run', () => {
    expect(gradingRun([job({ grading: ['run-1'] })], '/skills/a', 'run-1')).toBe(true)
  })

  it('is false for another run, another skill, or a job that has ended', () => {
    expect(gradingRun([job({ grading: ['run-1'] })], '/skills/a', 'run-2')).toBe(false)
    expect(gradingRun([job({ grading: ['run-1'] })], '/skills/b', 'run-1')).toBe(false)
    expect(gradingRun([job({ grading: ['run-1'], status: 'done' })], '/skills/a', 'run-1')).toBe(
      false,
    )
  })
})

describe('outputWriting', () => {
  const output = (meta: Partial<NonNullable<RunView['meta']>> | null) => ({
    run: {
      name: 'run-1',
      meta: meta && ({ finishedAt: null, samples: [], ...meta } as unknown as RunView['meta']),
    },
    sample: { name: 'note-s1' },
  })
  const recorded = [{ dir: 'note-s1' }] as unknown as NonNullable<RunView['meta']>['samples']

  it('is true while the run that writes it has not recorded it', () => {
    expect(outputWriting([job({ writing: ['run-1'] })], '/skills/a', output({}))).toBe(true)
  })

  it('stays true through the run’s own grading step, until the run is read again', () => {
    expect(outputWriting([job({ grading: ['run-1'] })], '/skills/a', output({}))).toBe(true)
  })

  it('is false once the run records it, or the run is over', () => {
    const jobs = [job({ writing: ['run-1'] })]
    expect(outputWriting(jobs, '/skills/a', output({ samples: recorded }))).toBe(false)
    expect(outputWriting(jobs, '/skills/a', output({ finishedAt: '2026-11-12T00:00:00Z' }))).toBe(
      false,
    )
  })

  it('is false for a run cut off with no job on it, and for a grading started by hand', () => {
    expect(outputWriting([], '/skills/a', output({}))).toBe(false)
    expect(
      outputWriting([job({ kind: 'grade', grading: ['run-1'] })], '/skills/a', output({})),
    ).toBe(false)
    expect(outputWriting([job({ writing: ['run-1'] })], '/skills/b', output({}))).toBe(false)
  })
})
