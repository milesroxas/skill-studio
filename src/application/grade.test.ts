import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Report } from '@domain/schemas.ts'
import { readJson } from '@infrastructure/fs.ts'
import { packById } from '@judges/index.ts'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { gradeRun } from './grade.ts'

const FIXTURE = resolve(import.meta.dirname, '../../fixtures/demo-skill')
const RUN = '2026-10-30-skill-v0-claude-haiku'

let skill: string

beforeAll(() => {
  skill = join(mkdtempSync(join(tmpdir(), 'st-grade-')), 'demo-skill')
  cpSync(FIXTURE, skill, { recursive: true, verbatimSymlinks: true })
})

afterAll(() => rmSync(join(skill, '..'), { recursive: true, force: true }))

describe('gradeRun without Jev (st grade --no-jev)', () => {
  it('writes report.json with code-only scores for every sample', async () => {
    const report = await gradeRun(skill, RUN, { useJev: false })
    const path = join(skill, 'evals/runs', RUN, 'report.json')
    expect(existsSync(path)).toBe(true)
    const saved = readJson<Report | null>(path, null)
    expect(saved?.model).toBeNull()
    expect(saved?.results.map((r) => r.sample)).toEqual(['release-note-s1'])
    const [result] = report.results
    expect(result.case).toBe('release-note')
    // Jev layers stay null; the workflow pack's code layers are scored.
    expect(result.scores).toMatchObject({ adherence: null, rubric: null, process: null })
    expect(result.scores.efficiency).toBeTypeOf('number')
    expect(result.scores.total).toBeTypeOf('number')
  })
})

/** A skill with the cases named, and one run holding one output for each sample named. */
function skillWith(cases: string[], samples: string[]): { dir: string; run: string } {
  const dir = mkdtempSync(join(tmpdir(), 'st-grade-made-'))
  made.push(dir)
  writeFileSync(join(dir, 'SKILL.md'), '# Notes\n\n- Keep every note under forty words.\n')
  for (const id of cases) {
    mkdirSync(join(dir, 'evals/cases', id), { recursive: true })
    writeFileSync(join(dir, 'evals/cases', id, 'prompt.md'), `Write the ${id}.`)
  }
  const run = 'run-1'
  for (const sample of samples) {
    mkdirSync(join(dir, 'evals/runs', run, sample, 'outputs'), { recursive: true })
    writeFileSync(join(dir, 'evals/runs', run, sample, 'outputs/note.md'), `A note, ${sample}.`)
  }
  return { dir, run }
}

const made: string[] = []
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})
afterEach(() => vi.restoreAllMocks())

/** Spy on the generic pack's `judge`, the one pack a made skill runs. */
const genericJudge = () => {
  const pack = packById('generic')
  if (!pack) throw new Error('no generic pack')
  return vi.spyOn(pack, 'judge')
}

describe('gradeRun, on which case a sample answers', () => {
  it('reads the case from the sample folder whole, never by a shared start', async () => {
    const { dir, run } = skillWith(['email', 'email-reply'], ['email-s1', 'email-reply-s1'])
    const report = await gradeRun(dir, run, { useJev: false })
    expect(report.results.map((r) => [r.sample, r.case])).toEqual([
      ['email-reply-s1', 'email-reply'],
      ['email-s1', 'email'],
    ])
  })

  it('scores an output of only whitespace 0, and an output of punctuation as an output', async () => {
    const { dir, run } = skillWith(['email'], ['email-s1', 'email-s2'])
    writeFileSync(join(dir, 'evals/runs', run, 'email-s1/outputs/note.md'), '  \n\t\n')
    writeFileSync(join(dir, 'evals/runs', run, 'email-s2/outputs/note.md'), '{}')
    const report = await gradeRun(dir, run, { useJev: false })
    const [blank, braces] = report.results
    expect(blank.blank).toBe(true)
    expect(blank.scores.total).toBe(0)
    expect(blank.flags).toContain('no output to judge')
    expect(braces.blank).toBe(false)
    expect(braces.flags).not.toContain('no output to judge')
  })

  it('leaves out a sample stopped before it wrote anything, and grades the rest', async () => {
    const { dir, run } = skillWith(['email'], ['email-s1'])
    mkdirSync(join(dir, 'evals/runs', run, 'email-s2/outputs'), { recursive: true })
    const sample = (index: number, patch: object) => ({
      dir: `email-s${index}`,
      case: 'email',
      index,
      ...patch,
    })
    writeFileSync(
      join(dir, 'evals/runs', run, 'run.json'),
      JSON.stringify({
        name: run,
        samples: [sample(1, { ok: true }), sample(2, { ok: false, stopped: true })],
      }),
    )
    const lines: string[] = []
    const report = await gradeRun(dir, run, { useJev: false, log: (line) => lines.push(line) })
    expect(report.results.map((r) => r.sample)).toEqual(['email-s1'])
    expect(lines).toContain('1 output(s) stopped before they were written: left out of grading.')
  })

  it('refuses a run that is not there, and makes no folder for it', async () => {
    const { dir } = skillWith(['email'], [])
    await expect(gradeRun(dir, 'no-such-run', { useJev: false })).rejects.toThrow(
      'There is no run called no-such-run.',
    )
    expect(existsSync(join(dir, 'evals/runs/no-such-run'))).toBe(false)
  })
})

describe('gradeRun, on what a grading that fails leaves behind', () => {
  it('keeps the last report and every kept answer when no output could be judged', async () => {
    const { dir, run } = skillWith(['email'], ['email-s1', 'email-s2'])
    const reportPath = join(dir, 'evals/runs', run, 'report.json')
    const cachePath = join(dir, 'evals/runs', run, 'judge-cache.json')
    await gradeRun(dir, run, { useJev: false })
    const report = readFileSync(reportPath, 'utf8')
    const kept = Object.keys(readJson<Record<string, unknown>>(cachePath, {}))
    expect(kept).toHaveLength(2)

    // A rule changes, so every output is asked about again, and every ask fails.
    writeFileSync(join(dir, 'SKILL.md'), '# Notes\n\n- Keep every note under thirty words.\n')
    genericJudge().mockRejectedValue(new Error('no network'))
    const failed = await gradeRun(dir, run, { useJev: false })
    expect(failed.results.every((r) => r.flags.some((f) => f.includes('pack failed')))).toBe(true)
    expect(readFileSync(reportPath, 'utf8')).toBe(report)
    expect(Object.keys(readJson<Record<string, unknown>>(cachePath, {}))).toEqual(kept)
  })

  it('finds its answers again after a setting went away and came back', async () => {
    const { dir, run } = skillWith(['email'], ['email-s1'])
    const first = '# Notes\n\n- Keep every note under forty words.\n'
    await gradeRun(dir, run, { useJev: false })
    writeFileSync(join(dir, 'SKILL.md'), '# Notes\n\n- Sign every note with a name.\n')
    await gradeRun(dir, run, { useJev: false })
    writeFileSync(join(dir, 'SKILL.md'), first)
    const judge = genericJudge()
    await gradeRun(dir, run, { useJev: false })
    expect(judge).not.toHaveBeenCalled()
  })

  it('keeps the answers of the outputs judged before the stop, and writes no report', async () => {
    const { dir, run } = skillWith(['email'], ['email-s1', 'email-s2'])
    const stop = new AbortController()
    // The first output is judged whole; the stop comes while the second is.
    genericJudge()
      .mockImplementationOnce(async () => null)
      .mockImplementationOnce(async () => {
        stop.abort()
        return null
      })
    await expect(gradeRun(dir, run, { useJev: false, signal: stop.signal })).rejects.toThrow(
      'Stopped.',
    )
    expect(existsSync(join(dir, 'evals/runs', run, 'report.json'))).toBe(false)
    const cache = readJson<Record<string, unknown>>(
      join(dir, 'evals/runs', run, 'judge-cache.json'),
      {},
    )
    expect(Object.keys(cache)).toHaveLength(1)
  })
})

describe('gradeRun, on what makes an output worth asking about again', () => {
  it('asks again when a picture of the case changes under the same name, and not otherwise', async () => {
    const { dir, run } = skillWith(['email'], ['email-s1'])
    const picture = join(dir, 'evals/cases/email/files/shot.png')
    mkdirSync(join(picture, '..'), { recursive: true })
    writeFileSync(picture, 'first picture')
    await gradeRun(dir, run, { useJev: false })
    const judge = genericJudge()
    await gradeRun(dir, run, { useJev: false })
    expect(judge).not.toHaveBeenCalled()
    writeFileSync(picture, 'second picture')
    await gradeRun(dir, run, { useJev: false })
    expect(judge).toHaveBeenCalledTimes(1)
  })

  it("does not ask a pack again over a setting that is another pack's alone", async () => {
    const { dir, run } = skillWith(['email'], ['email-s1'])
    await gradeRun(dir, run, { useJev: false })
    const judge = genericJudge()
    // `warningCost` is the writing pack's; `weights` and `yes` apply in scoring.
    await gradeRun(dir, run, {
      useJev: false,
      config: { warningCost: 0.9, yes: 0.7, weights: { rubric: 10 } },
    })
    expect(judge).not.toHaveBeenCalled()
  })
})

describe('gradeRun, on the pictures a case is judged with', () => {
  /** A picture of the case, now, and the copy the run took of it when it started. */
  function withPicture(dir: string, run: string, now: string, then: string | null) {
    const live = join(dir, 'evals/cases/email/files/shot.png')
    mkdirSync(join(live, '..'), { recursive: true })
    writeFileSync(live, now)
    const inputs = join(dir, 'evals/runs', run, '_inputs')
    mkdirSync(inputs, { recursive: true })
    if (then !== null) {
      mkdirSync(join(inputs, 'email'), { recursive: true })
      writeFileSync(join(inputs, 'email/shot.png'), then)
    }
    return { live, staged: join(inputs, 'email/shot.png') }
  }

  it('reads the copy the run took, not the case as it is now', async () => {
    const { dir, run } = skillWith(['email'], ['email-s1'])
    const { live, staged } = withPicture(dir, run, 'as it is now', 'as the agent saw it')
    await gradeRun(dir, run, { useJev: false })
    const judge = genericJudge()
    // The case's picture changed after the run: the output was made from the copy, and is judged as before.
    writeFileSync(live, 'changed again')
    await gradeRun(dir, run, { useJev: false })
    expect(judge).not.toHaveBeenCalled()
    // The bytes the judge reads changed: it is asked again.
    writeFileSync(staged, 'another copy')
    await gradeRun(dir, run, { useJev: false })
    expect(judge).toHaveBeenCalledTimes(1)
  })

  it('takes a picture the run kept no copy of as missing, not as the case has it now', async () => {
    const { dir, run } = skillWith(['email'], ['email-s1'])
    withPicture(dir, run, 'added after the run', null)
    const lines: string[] = []
    const judge = genericJudge()
    await gradeRun(dir, run, { useJev: false, log: (line) => lines.push(line) })
    expect(judge.mock.calls[0][0].images).toEqual([])
    expect(lines).toContain('email-s1: shot.png is not shown to Jev: the file is missing.')
  })

  it.skipIf(process.platform === 'win32')(
    'grades all the same when a picture is a folder or a pipe, without reading it',
    async () => {
      const { dir, run } = skillWith([], ['1-email-s1'])
      mkdirSync(join(dir, 'shots/folder.png'), { recursive: true })
      expect(spawnSync('mkfifo', [join(dir, 'shots/pipe.png')]).status).toBe(0)
      writeFileSync(
        join(dir, 'evals/evals.json'),
        JSON.stringify({
          evals: [
            {
              id: 1,
              name: 'email',
              prompt: 'Write it.',
              files: ['shots/folder.png', 'shots/pipe.png'],
            },
          ],
        }),
      )
      const report = await gradeRun(dir, run, { useJev: false })
      expect(report.results.map((r) => r.case)).toEqual(['1-email'])
    },
  )
})

describe('gradeRun, on a stop', () => {
  /** A code case whose check holds on until it is ended, in the sample that has `slow` only. */
  function slowCheck() {
    const { dir, run } = skillWith([], ['add-s1', 'add-s2'])
    mkdirSync(join(dir, 'evals/cases/add'), { recursive: true })
    writeFileSync(join(dir, 'evals/cases/add/prompt.md'), 'Write add.')
    writeFileSync(
      join(dir, 'evals/cases/add/case.yaml'),
      'bench:\n  artifact: code\n  check: if [ -f slow ]; then touch started; sleep 30; fi\n',
    )
    for (const sample of ['add-s1', 'add-s2'])
      writeFileSync(join(dir, 'evals/runs', run, sample, 'outputs/add.js'), 'export const add = 1')
    writeFileSync(join(dir, 'evals/runs', run, 'add-s2/slow'), '')
    return { dir, run, started: join(dir, 'evals/runs', run, 'add-s2/started') }
  }

  it.skipIf(process.platform === 'win32')(
    'writes no report and keeps nothing of the last sample when the stop comes during its check',
    async () => {
      const { dir, run, started } = slowCheck()
      const runDir = join(dir, 'evals/runs', run)
      writeFileSync(join(runDir, 'report.json'), '"the last report"')
      const stop = new AbortController()
      const graded = gradeRun(dir, run, { useJev: false, packs: ['code'], signal: stop.signal })
      for (let i = 0; i < 500 && !existsSync(started); i += 1)
        await new Promise((wait) => setTimeout(wait, 10))
      stop.abort()
      await expect(graded).rejects.toThrow('Stopped.')
      expect(readFileSync(join(runDir, 'report.json'), 'utf8')).toBe('"the last report"')
      // The first sample's answer is kept; the stopped one's "check failed" is not.
      const cache = readJson<Record<string, { check: { exit: number } }>>(
        join(runDir, 'judge-cache.json'),
        {},
      )
      expect(Object.values(cache).map((answer) => answer.check.exit)).toEqual([0])
    },
  )

  it('writes no report over the last one when every output was stopped before it was written', async () => {
    const { dir, run } = skillWith(['email'], ['email-s1'])
    const runDir = join(dir, 'evals/runs', run)
    writeFileSync(join(runDir, 'report.json'), '"the last report"')
    writeFileSync(
      join(runDir, 'run.json'),
      JSON.stringify({
        name: run,
        samples: [{ dir: 'email-s1', case: 'email', index: 1, ok: false, stopped: true }],
      }),
    )
    const lines: string[] = []
    await gradeRun(dir, run, { useJev: false, log: (line) => lines.push(line) })
    expect(readFileSync(join(runDir, 'report.json'), 'utf8')).toBe('"the last report"')
    expect(lines.join('\n')).toMatch('No output to grade, so no report was written.')
  })
})

describe('gradeRun, on the version of a pack', () => {
  it("puts the pack's version in the hash, so a pack whose questions changed is asked again", async () => {
    const pack = packById('generic')
    if (!pack) throw new Error('no generic pack')
    const { dir, run } = skillWith(['email'], ['email-s1'])
    const asked = () =>
      stringify.mock.calls
        .map(([value]) => value as Record<string, unknown> | null)
        .filter((value) => value && typeof value === 'object' && value.pack === 'generic')
    const stringify = vi.spyOn(JSON, 'stringify')
    expect(pack.version).toBe(1)
    await gradeRun(dir, run, { useJev: false })
    expect(asked().length).toBeGreaterThan(0)
    expect(asked().every((value) => value?.version === 1)).toBe(true)
    stringify.mockClear()

    const judge = genericJudge()
    const version = vi.spyOn(pack, 'version', 'get').mockReturnValue(2)
    await gradeRun(dir, run, { useJev: false })
    expect(judge).toHaveBeenCalledTimes(1)
    expect(asked().some((value) => value?.version === 2)).toBe(true)
    version.mockRestore()
  })
})
