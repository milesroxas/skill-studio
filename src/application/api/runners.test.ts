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
const { engines } = await import('@infrastructure/engines/index.ts')
type Engine = (typeof engines)[number]

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

  it('refuses, with no key, a run Jev scored: grading it would take those scores away', async () => {
    const run = cutOffRun('scored')
    const scored = JSON.stringify({ model: 'jev-1.14.0', results: [] })
    writeFileSync(join(run, 'report.json'), scored)
    await expect(invoke(operations, 'skill.grade', { skill, run: 'scored' })).rejects.toThrow(
      'Jev scored this run, and no TypeSafe key is set to grade it again.',
    )
    expect(readFileSync(join(run, 'report.json'), 'utf8')).toBe(scored)
    expect(listJobs(1000).some((job) => job.title === 'Grade scored')).toBe(false)
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

describe('skill.gradedAs', () => {
  it('sets the packs, and keeps every other key of bench.json as the file holds it', async () => {
    const bench = join(skill, 'evals/bench.json')
    // Written by hand: a threshold out of range, a key nothing reads, a pack's own setting.
    const byHand = { packs: ['generic'], yes: 7, sure: 0.9, writer: 'Ada', weights: { rubric: 5 } }
    writeFileSync(bench, JSON.stringify(byHand))
    const { config } = await invoke(operations, 'skill.gradedAs', {
      skill,
      packs: ['generic', 'design'],
    })
    expect(JSON.parse(readFileSync(bench, 'utf8'))).toEqual({
      ...byHand,
      packs: ['generic', 'design'],
    })
    // Scored as the file reads, as ever: the threshold held to 1.
    expect(config.packs).toEqual(['generic', 'design'])
    expect(config.yes).toBe(1)
  })

  it('writes the packs alone where there is no file, or one that holds no object', async () => {
    const bench = join(skill, 'evals/bench.json')
    rmSync(bench, { force: true })
    await invoke(operations, 'skill.gradedAs', { skill, packs: ['design'] })
    expect(JSON.parse(readFileSync(bench, 'utf8'))).toEqual({ packs: ['design'] })
    writeFileSync(bench, '[1, 2]')
    await invoke(operations, 'skill.gradedAs', { skill, packs: ['code'] })
    expect(JSON.parse(readFileSync(bench, 'utf8'))).toEqual({ packs: ['code'] })
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

  it('serves only a skill open already, and asking opens none', async () => {
    // A page an agent wrote can name any folder: one with a SKILL.md is still not opened by asking.
    const other = realPath(mkdtempSync(join(tmpdir(), 'st-runners-other-')))
    writeFileSync(join(other, 'SKILL.md'), '# Other\n')
    await expect(
      invoke(operations, 'skill.artifact', {
        skill: other,
        run: 'served',
        sample: 'note-s1',
        file: 'outputs/Cover Letter.md',
      }),
    ).rejects.toThrow('No such file.')
    const open = await invoke(operations, 'library.skills', {})
    expect(open.map((s) => s.path)).not.toContain(other)
    rmSync(other, { recursive: true, force: true })
  })
})

describe('image.read', () => {
  it('serves a picture of a skill open already, and asking opens none', async () => {
    // A page an agent wrote can load a picture by any path: the skill it names is still not opened.
    const other = realPath(mkdtempSync(join(tmpdir(), 'st-runners-other-')))
    writeFileSync(join(other, 'SKILL.md'), '# Other\n')
    writeFileSync(join(other, 'a.png'), 'png')
    writeFileSync(join(skill, 'a.png'), 'png')
    const own = await invoke(operations, 'image.read', { skill, file: 'a.png' })
    expect(own.type).toBe('image/png')
    await expect(invoke(operations, 'image.read', { skill: other, file: 'a.png' })).rejects.toThrow(
      'No such picture.',
    )
    const open = await invoke(operations, 'library.skills', {})
    expect(open.map((s) => s.path)).not.toContain(other)
    rmSync(other, { recursive: true, force: true })
  })
})

/** An agent that writes `text` as its note, or fails when told to, in place of a real one. */
function fakeAgent(id: string, text: string | Error): Engine {
  return {
    id,
    label: id,
    harness: 'agent',
    efforts: [],
    defaultModel: 'small',
    hint: '',
    available: () => true,
    models: async () => ['small'],
    run: async (request) => {
      if (text instanceof Error) throw text
      mkdirSync(join(request.cwd, 'outputs'), { recursive: true })
      writeFileSync(join(request.cwd, 'outputs/note.md'), text)
      return { ok: true, error: null, costUsd: null, tokens: null, model: 'small', finalText: null }
    },
  }
}

describe('skill.generate', () => {
  const generate = (
    configs: { engine: string }[],
    cases: string[] = [],
    configuration: 'with_skill' | 'old_skill' = 'with_skill',
  ) =>
    invoke(operations, 'skill.generate', {
      skill,
      cases,
      configs: configs.map((c) => ({ ...c, model: '', effort: '' })),
      samples: 1,
      configuration,
      baseline: null,
      skillName: 'First notes',
      note: '',
      grade: true,
    })

  afterAll(() => {
    for (const id of ['writes', 'breaks']) {
      const at = engines.findIndex((e) => e.id === id)
      if (at >= 0) engines.splice(at, 1)
    }
  })
  engines.push(
    fakeAgent('writes', 'A short note about Friday.'),
    fakeAgent('breaks', new Error('The agent broke.')),
  )

  it('writes a run per agent and grades it, leaving out what cannot run', async () => {
    const { job } = await generate([{ engine: 'writes' }, { engine: 'nobody' }], ['note', 'gone'])
    const ended = await finished(job)
    const log = ended.log.join('\n')
    expect(ended.status).toBe('done')
    expect(log).toMatch('There is no case called gone: left out.')
    expect(log).toMatch('nobody is not installed: left out.')
    expect(log).toMatch(/: graded/)
    const runs = await invoke(operations, 'skill.state', { skill })
    expect(runs.runs.some((r) => r.report !== null)).toBe(true)
  })

  it('keeps a run whose agent failed, with its sample marked failed', async () => {
    const { job } = await generate([{ engine: 'breaks' }])
    await finished(job)
    const { runs } = await invoke(operations, 'skill.state', { skill })
    expect(runs.flatMap((r) => r.meta?.samples ?? []).some((sample) => !sample.ok)).toBe(true)
  })

  it('fails the job when a run cannot start, and still settles its share of the steps', async () => {
    const { job } = await generate([{ engine: 'writes' }], [], 'old_skill')
    const ended = await finished(job)
    expect(ended.status).toBe('failed')
    expect(ended.log.join('\n')).toMatch('old_skill needs the version')
    expect(ended.progress?.done).toBe(ended.progress?.total)
  })

  it('refuses no case to run, and no agent installed', async () => {
    await expect(generate([{ engine: 'writes' }], ['gone'])).rejects.toThrow('No cases selected.')
    await expect(generate([{ engine: 'nobody' }])).rejects.toThrow('None of the agents picked')
  })
})
