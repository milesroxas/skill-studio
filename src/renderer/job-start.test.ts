import { describe, expect, it } from 'vitest'
import type { Job } from './api.ts'
import { gradingRun } from './job-start.ts'

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
