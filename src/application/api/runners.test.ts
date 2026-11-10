import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

// The library reads SKILL_STUDIO_HOME once, at import; grading here asks no judge.
const home = mkdtempSync(join(tmpdir(), 'st-runners-home-'))
process.env.SKILL_STUDIO_HOME = home
delete process.env.TYPESAFE_API_KEY
const { createOperations, invoke } = await import('./operations.ts')
const { listJobs, markWriting, runJob } = await import('../jobs.ts')
const { realPath } = await import('@infrastructure/fs.ts')

const made: string[] = [home]
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

let skill: string
let operations: ReturnType<typeof createOperations>
beforeEach(() => {
  skill = realPath(mkdtempSync(join(tmpdir(), 'st-runners-')))
  made.push(skill)
  writeFileSync(join(skill, 'SKILL.md'), '# Notes\n\n- Keep every note under forty words.\n')
  mkdirSync(join(skill, 'evals/cases/note'), { recursive: true })
  writeFileSync(join(skill, 'evals/cases/note/prompt.md'), 'Write a note.')
  operations = createOperations({ skills: [skill] })
})

/** A run of `version` with one output, as a run cut off part way leaves it: no end time. */
function cutOffRun(name: string, version = 'v0'): string {
  const run = join(skill, 'evals/runs', name)
  mkdirSync(join(run, 'note-s1/outputs'), { recursive: true })
  mkdirSync(join(run, '_skill'), { recursive: true })
  writeFileSync(join(run, '_skill/SKILL.md'), 'as it ran')
  writeFileSync(join(run, 'note-s1/outputs/note.md'), 'A note.')
  writeFileSync(
    join(run, 'run.json'),
    JSON.stringify({
      name,
      skillVersion: version,
      createdAt: '2026-11-01T10:00:00Z',
      finishedAt: null,
    }),
  )
  return run
}

const finished = async (id: number) => {
  for (let i = 0; i < 200; i += 1) {
    const job = listJobs(1000).find((j) => j.id === id)
    if (job && job.status !== 'running') return job
    await new Promise((next) => setTimeout(next, 10))
  }
  throw new Error('The job did not finish.')
}

/** A job that runs until released, writing the runs named. */
function heldJob(target: string, writing: string[] = []) {
  let release: () => void = () => {}
  const job = runJob(
    'generate',
    'Held',
    null,
    target,
    () =>
      new Promise<boolean>((done) => {
        release = () => done(true)
      }),
  )
  for (const run of writing) markWriting(job, run, true)
  return { job, release: () => release() }
}

describe('skill.grade', () => {
  it('refuses a run that is not there, and makes no folder for it', async () => {
    await expect(invoke(operations, 'skill.grade', { skill, run: 'no-such-run' })).rejects.toThrow(
      'There is no run called no-such-run.',
    )
    expect(existsSync(join(skill, 'evals/runs/no-such-run'))).toBe(false)
  })

  it('grades a run that was cut off, since no job is writing it', async () => {
    const run = cutOffRun('cut-off')
    const { job } = await invoke(operations, 'skill.grade', { skill, run: 'cut-off' })
    expect((await finished(job)).status).toBe('done')
    expect(existsSync(join(run, 'report.json'))).toBe(true)
  })

  it('refuses a run still being written by a job on this skill', async () => {
    cutOffRun('writing')
    const held = heldJob(skill, ['writing'])
    await expect(invoke(operations, 'skill.grade', { skill, run: 'writing' })).rejects.toThrow(
      'still writing',
    )
    held.release()
    await finished(held.job.id)
  })

  it('grades a run that was cut off while another run of the skill is being written', async () => {
    const run = cutOffRun('cut-off-earlier')
    cutOffRun('writing-now')
    const held = heldJob(skill, ['writing-now'])
    const { job } = await invoke(operations, 'skill.grade', { skill, run: 'cut-off-earlier' })
    expect((await finished(job)).status).toBe('done')
    expect(existsSync(join(run, 'report.json'))).toBe(true)
    held.release()
    await finished(held.job.id)
  })

  it('fails a grading that found no output to grade, and keeps the last report', async () => {
    const run = cutOffRun('all-stopped')
    writeFileSync(join(run, 'report.json'), '"the last report"')
    writeFileSync(
      join(run, 'run.json'),
      JSON.stringify({
        name: 'all-stopped',
        skillVersion: 'v0',
        createdAt: '2026-11-01T10:00:00Z',
        finishedAt: '2026-11-01T10:01:00Z',
        samples: [{ dir: 'note-s1', case: 'note', index: 1, ok: false, stopped: true }],
      }),
    )
    const { job } = await invoke(operations, 'skill.grade', { skill, run: 'all-stopped' })
    const ended = await finished(job)
    expect(ended.status).toBe('failed')
    expect(ended.log.join('\n')).toMatch('No output to grade')
    expect(ended.log.join('\n')).not.toMatch('Graded.')
    expect(readFileSync(join(run, 'report.json'), 'utf8')).toBe('"the last report"')
  })

  it('grades one run once at a time', async () => {
    cutOffRun('twice')
    const first = await invoke(operations, 'skill.grade', { skill, run: 'twice' })
    await expect(invoke(operations, 'skill.grade', { skill, run: 'twice' })).rejects.toThrow(
      'already being graded',
    )
    await finished(first.job)
  })
})

describe('guards on a running job', () => {
  it('refuse a version delete while any job runs, however many started after it', async () => {
    cutOffRun('kept')
    const held = heldJob('/elsewhere')
    for (let i = 0; i < 15; i += 1) runJob('grade', `Later ${i}`, null, `/l/${i}`, async () => true)
    await new Promise((next) => setTimeout(next, 0))
    await expect(
      invoke(operations, 'skill.deleteVersion', { skill, version: 'v0' }),
    ).rejects.toThrow('Wait for running jobs')
    held.release()
    await finished(held.job.id)
    expect(
      (await invoke(operations, 'skill.deleteVersion', { skill, version: 'v0' })).deleted,
    ).toBe('v0')
  })
})

describe('skill.restoreVersion', () => {
  it("puts back the files of a run's version, and the name they give the skill", async () => {
    const run = cutOffRun('named')
    writeFileSync(
      join(run, '_skill/SKILL.md'),
      '---\nname: older-name\n---\n\n- An older rule here.\n',
    )
    const { restored } = await invoke(operations, 'skill.restoreVersion', {
      skill,
      version: 'v0',
      force: true,
    })
    expect(restored).toBe('v0')
    expect(readFileSync(join(skill, 'SKILL.md'), 'utf8')).toContain('An older rule')
    const [served] = await invoke(operations, 'library.skills', {})
    expect(served.name).toBe('older-name')
  })
})

describe('skill.saveCase', () => {
  const draft = { id: 'memo', title: 'Memo', prompt: 'Write a memo.', graders: [] }

  it('answers when the case was saved, and refuses a later save made from an older copy', async () => {
    const first = await invoke(operations, 'skill.saveCase', { skill, case: draft, isNew: true })
    expect(first.savedAt).toBeTypeOf('string')
    // The form loads the same time with the case, from the skill's state.
    const state = await invoke(operations, 'skill.state', { skill })
    expect(state.cases.find((c) => c.id === 'memo')).toMatchObject({ savedAt: first.savedAt })
    // Another window, or an editor, saves the case after the form loaded it.
    const later = new Date(Date.now() + 60_000)
    utimesSync(join(skill, first.saved, 'prompt.md'), later, later)
    await expect(
      invoke(operations, 'skill.saveCase', {
        skill,
        case: { ...draft, title: 'Stale' },
        isNew: false,
        savedAt: first.savedAt,
      }),
    ).rejects.toThrow('changed on disk')
    const fresh = await invoke(operations, 'skill.saveCase', {
      skill,
      case: { ...draft, title: 'Fresh' },
      isNew: false,
      savedAt: later.toISOString(),
    })
    expect(fresh.savedAt).not.toBe(first.savedAt)
  })
})

describe('skill.config', () => {
  it('writes only what a scorer can read', async () => {
    await invoke(operations, 'skill.config', {
      skill,
      config: {
        packs: ['generic', 3],
        yes: 7,
        weights: { rubric: 'many', adherence: 60 },
        writer: 'Ada',
      },
    })
    const saved = JSON.parse(readFileSync(join(skill, 'evals/bench.json'), 'utf8'))
    expect(saved.packs).toEqual(['generic'])
    expect(saved.weights).toEqual({ adherence: 60 })
    expect(saved.yes).toBeLessThanOrEqual(1)
    expect(saved.writer).toBe('Ada')
  })
})

describe('skill.artifact', () => {
  it('serves an output named with a space, and refuses a link that leaves the skill', async () => {
    const run = cutOffRun('served')
    writeFileSync(join(run, 'note-s1/outputs/Cover Letter.md'), 'Dear reader.')
    const file = await invoke(operations, 'skill.artifact', {
      skill,
      run: 'served',
      sample: 'note-s1',
      file: 'outputs/Cover Letter.md',
    })
    expect(new TextDecoder().decode(file.bytes)).toBe('Dear reader.')
    if (process.platform === 'win32') return
    const { symlinkSync } = await import('node:fs')
    symlinkSync('/etc/hosts', join(run, 'note-s1/outputs/hosts.txt'))
    await expect(
      invoke(operations, 'skill.artifact', {
        skill,
        run: 'served',
        sample: 'note-s1',
        file: 'outputs/hosts.txt',
      }),
    ).rejects.toThrow('leads outside')
  })
})
