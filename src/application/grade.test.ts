import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pngHeader } from '@domain/__fixtures__/image.ts'
import type { PageLayout } from '@domain/layout.ts'
import type { Report, ReportResult } from '@domain/schemas.ts'
import { readJson } from '@infrastructure/fs.ts'
import { packById } from '@judges/index.ts'
import { Jev } from '@judges/jev.ts'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { compareReports, gradeRun, jevForRun, scoredReport, selfTest, unjudged } from './grade.ts'

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

  it('leaves out a sample the stop ended or the run never recorded, and grades the rest', async () => {
    // s2 was stopped with nothing written, s3 with half a file, and s4 was cut off unrecorded.
    const { dir, run } = skillWith(['email'], ['email-s1', 'email-s3', 'email-s4'])
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
        samples: [
          sample(1, { ok: true, outputs: ['outputs/note.md'] }),
          sample(2, { ok: false, stopped: true }),
          sample(3, { ok: true, stopped: true }),
        ],
      }),
    )
    // Put beside the output after the agent ended, as a check command's build is.
    writeFileSync(join(dir, 'evals/runs', run, 'email-s1/outputs/index.html'), '<p>Built.</p>')
    const lines: string[] = []
    const report = await gradeRun(dir, run, { useJev: false, log: (line) => lines.push(line) })
    expect(report.results.map((r) => r.sample)).toEqual(['email-s1'])
    expect(report.results[0].artifacts).toEqual([{ file: 'outputs/note.md', kind: 'markdown' }])
    expect(lines).toContain('3 output(s) stopped before they were finished: left out of grading.')
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

  it('gives an output one pack failed on no total, though another pack scored its layers', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'st-grade-made-')), 'demo-skill')
    made.push(join(dir, '..'))
    cpSync(FIXTURE, dir, { recursive: true, verbatimSymlinks: true })
    genericJudge().mockRejectedValue(new Error('no network'))
    const report = await gradeRun(dir, RUN, { useJev: false })
    const [result] = report.results
    expect(result.flags[0]).toBe('generic pack failed: no network')
    // The workflow pack's layers alone would total a number, a score of the whole it is not.
    expect(result.scores.efficiency).toBeTypeOf('number')
    expect(result.scores.total).toBeNull()
    expect(unjudged(report)).toEqual({
      failed: 1,
      total: 1,
      reason: 'generic pack failed: no network',
    })
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

  it('stops at once, without waiting for an answer still on its way', async () => {
    const { dir, run } = skillWith(['email'], ['email-s1', 'email-s2'])
    const stop = new AbortController()
    // The second output's answer never comes: only the stop ends the wait for it.
    genericJudge()
      .mockImplementationOnce(async () => null)
      .mockImplementationOnce(() => {
        setImmediate(() => stop.abort())
        return new Promise(() => {})
      })
    await expect(gradeRun(dir, run, { useJev: false, signal: stop.signal })).rejects.toThrow(
      'Stopped.',
    )
    expect(existsSync(join(dir, 'evals/runs', run, 'report.json'))).toBe(false)
    // What the first output was answered is kept all the same.
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
    // `workflow` is the workflow pack's; `weights` and `yes` apply in scoring.
    await gradeRun(dir, run, {
      useJev: false,
      config: { workflow: { maxRetries: 3 }, yes: 0.7, weights: { rubric: 10 } },
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
      // The first sample's reading of its rules and checks is kept, which without Jev holds
      // nothing. No check's answer is, the stopped one's "check failed" least of all.
      const cache = readJson<Record<string, unknown>>(join(runDir, 'judge-cache.json'), {})
      expect(Object.values(cache)).toEqual([null])
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
    const now = pack.version
    await gradeRun(dir, run, { useJev: false })
    expect(asked().length).toBeGreaterThan(0)
    expect(asked().every((value) => value?.version === now)).toBe(true)
    stringify.mockClear()

    const judge = genericJudge()
    const version = vi.spyOn(pack, 'version', 'get').mockReturnValue(now + 1)
    await gradeRun(dir, run, { useJev: false })
    expect(judge).toHaveBeenCalledTimes(1)
    expect(asked().some((value) => value?.version === now + 1)).toBe(true)
    version.mockRestore()
  })
})

describe('gradeRun, on a page drawn for a pack that looks at it', () => {
  /** A skill graded by the design pack, whose one output is a page; `phone` asks for it at phone width. */
  function pageSkill(phone = true): { dir: string; run: string; sample: string } {
    const { dir, run } = skillWith(['page'], ['page-s1'])
    if (phone) writeFileSync(join(dir, 'evals/cases/page/case.yaml'), 'bench:\n  phone: true\n')
    const outputs = join(dir, 'evals/runs', run, 'page-s1/outputs')
    rmSync(join(outputs, 'note.md'))
    writeFileSync(join(outputs, 'index.html'), '<!doctype html><title>Page</title><h1>Hi</h1>')
    writeFileSync(join(dir, 'evals/bench.json'), JSON.stringify({ packs: ['design'] }))
    return { dir, run, sample: join(dir, 'evals/runs', run, 'page-s1') }
  }

  const designJudge = () => {
    const pack = packById('design')
    if (!pack) throw new Error('no design pack')
    // The generic pack grades the page too, and would ask Jev over the network.
    genericJudge().mockResolvedValue(null)
    return vi.spyOn(pack, 'judge').mockResolvedValue(null)
  }

  const layout: PageLayout = {
    window: [1280, 960],
    page: [1280, 960],
    elements: [
      {
        id: 1,
        parent: 0,
        name: 'main#app',
        text: '',
        x: 0,
        y: 0,
        width: 1280,
        height: 960,
        scale: 1,
        unscaled: null,
        background: '#ffffff (hsl 0 0% 100%)',
        color: null,
        font: null,
        radius: null,
        padding: null,
        border: null,
        gap: null,
        shadows: 0,
      },
    ],
    leftOut: 0,
  }

  it('draws the page at each size once, keeps the pictures beside outputs/, and gives them to the pack', async () => {
    const { dir, run, sample } = pageSkill()
    vi.spyOn(Jev, 'available').mockReturnValue(true)
    const judge = designJudge()
    const render = vi.fn(async (_page: unknown, size: { width: number; height: number }) => ({
      png: pngHeader(size.width, size.height),
      layout: size.width === 1280 ? layout : null,
    }))
    await gradeRun(dir, run, { useJev: true, render })
    expect(render.mock.calls).toEqual([
      [
        { skill: dir, run, sample: 'page-s1', file: 'outputs/index.html' },
        { width: 1280, height: 960 },
      ],
      [
        { skill: dir, run, sample: 'page-s1', file: 'outputs/index.html' },
        { width: 390, height: 1200 },
      ],
    ])
    // Each picture is written whole, under its own name, with what the window measured beside it.
    expect(readdirSync(join(sample, 'renders')).sort()).toEqual([
      'desktop-1280x960.json',
      'desktop-1280x960.png',
      'phone-390x1200.json',
      'phone-390x1200.png',
    ])
    const [input] = judge.mock.calls[0]
    expect(input.renders.map((r) => [r.size.id, r.read.problem])).toEqual([
      ['desktop', null],
      ['phone', null],
    ])
    // The pack gets the layout the window measured, and none for a page that could not be measured.
    expect(input.renders.map((r) => r.layout)).toEqual([layout, null])

    // The pictures kept stand for the page as it is: nothing is drawn or asked again.
    render.mockClear()
    judge.mockClear()
    await gradeRun(dir, run, { useJev: true, render })
    expect(render).not.toHaveBeenCalled()
    expect(judge).not.toHaveBeenCalled()
  })

  it('draws a page once more when its picture was kept before pages were measured', async () => {
    const { dir, run, sample } = pageSkill(false)
    vi.spyOn(Jev, 'available').mockReturnValue(true)
    const judge = designJudge()
    mkdirSync(join(sample, 'renders'), { recursive: true })
    writeFileSync(join(sample, 'renders/desktop-1280x960.png'), pngHeader(1280, 960))
    const render = vi.fn(async (_page: unknown, size: { width: number; height: number }) => ({
      png: pngHeader(size.width, size.height),
      layout,
    }))
    await gradeRun(dir, run, { useJev: true, render })
    expect(render).toHaveBeenCalledTimes(1)
    expect(judge.mock.calls[0][0].renders[0].layout).toEqual(layout)
  })

  it('reads a layout kept on disk as any file is: one that is no layout is none', async () => {
    const { dir, run, sample } = pageSkill(false)
    vi.spyOn(Jev, 'available').mockReturnValue(true)
    const judge = designJudge()
    mkdirSync(join(sample, 'renders'), { recursive: true })
    writeFileSync(join(sample, 'renders/desktop-1280x960.png'), pngHeader(1280, 960))
    writeFileSync(join(sample, 'renders/desktop-1280x960.json'), '{"elements":"all of them"}')
    const render = vi.fn()
    await gradeRun(dir, run, { useJev: true, render })
    // The picture has a file beside it, so the page is not drawn again.
    expect(render).not.toHaveBeenCalled()
    expect(judge.mock.calls[0][0].renders[0].layout).toBeNull()
  })

  it('logs a size it could not draw and judges without it', async () => {
    const { dir, run } = pageSkill()
    vi.spyOn(Jev, 'available').mockReturnValue(true)
    const judge = designJudge()
    const render = vi.fn(async (_page: unknown, size: { width: number; height: number }) => {
      if (size.width === 390) throw new Error('The page took longer than 20s.')
      return { png: pngHeader(size.width, size.height), layout: null }
    })
    const lines: string[] = []
    await gradeRun(dir, run, { useJev: true, render, log: (line) => lines.push(line) })
    expect(lines).toContain(
      'page-s1: the page could not be drawn at phone width: The page took longer than 20s.',
    )
    expect(judge.mock.calls[0][0].renders.map((r) => r.size.id)).toEqual(['desktop'])
  })

  it('draws a page at phone width only for a case that asks for it', async () => {
    const { dir, run, sample } = pageSkill(false)
    vi.spyOn(Jev, 'available').mockReturnValue(true)
    const judge = designJudge()
    const render = vi.fn(async (_page: unknown, size: { width: number; height: number }) => ({
      png: pngHeader(size.width, size.height),
      layout: null,
    }))
    await gradeRun(dir, run, { useJev: true, render })
    expect(render.mock.calls.map(([, size]) => size.width)).toEqual([1280])
    expect(existsSync(join(sample, 'renders/phone-390x1200.png'))).toBe(false)
    expect(judge.mock.calls[0][0].renders.map((r) => r.size.id)).toEqual(['desktop'])
  })

  it('draws a page at the case’s own size, in place of a desktop window', async () => {
    const { dir, run } = pageSkill(false)
    writeFileSync(join(dir, 'evals/cases/page/case.yaml'), 'bench:\n  size: [1440, 900]\n')
    vi.spyOn(Jev, 'available').mockReturnValue(true)
    designJudge()
    const render = vi.fn(async (_page: unknown, size: { width: number; height: number }) => ({
      png: pngHeader(size.width, size.height),
      layout: null,
    }))
    await gradeRun(dir, run, { useJev: true, render })
    expect(render.mock.calls.map(([, size]) => size)).toEqual([{ width: 1440, height: 900 }])
  })

  it('draws nothing without Jev to look', async () => {
    const { dir, run } = pageSkill()
    const render = vi.fn()
    designJudge()
    await gradeRun(dir, run, { useJev: false, render })
    expect(render).not.toHaveBeenCalled()
  })
})

describe('gradeRun, on what a skill’s rules are judged on', () => {
  it('grades a page on the skill’s rules, whatever else the skill is graded as', async () => {
    const { dir, run } = skillWith(['page'], ['page-s1'])
    const outputs = join(dir, 'evals/runs', run, 'page-s1/outputs')
    rmSync(join(outputs, 'note.md'))
    writeFileSync(join(outputs, 'index.html'), '<!doctype html><h1>Hi</h1>')
    // A list that leaves the generic pack out: the rules are graded all the same.
    writeFileSync(join(dir, 'evals/bench.json'), JSON.stringify({ packs: ['design'] }))
    vi.spyOn(Jev, 'available').mockReturnValue(true)
    const judge = genericJudge().mockResolvedValue({
      adherence: {
        rules: [{ id: 'r1', text: 'Keep every note under forty words.', section: '', noul: 0.9 }],
      },
      rubric: null,
    })
    const report = await gradeRun(dir, run, { useJev: true })
    expect(report.packs).toEqual(['generic', 'design'])
    const [input] = judge.mock.calls[0]
    expect(input.primary).toEqual({ file: 'outputs/index.html', kind: 'html' })
    expect(input.rules.map((r) => r.text)).toEqual(['Keep every note under forty words.'])
    expect(report.results[0].scores).toMatchObject({ adherence: 100, total: 100 })
  })

  it('gives a pack what the agent told the user and the other files it wrote, a copy of the page left out', async () => {
    const { dir, run } = skillWith(['page'], ['page-s1'])
    const sample = join(dir, 'evals/runs', run, 'page-s1')
    rmSync(join(sample, 'outputs/note.md'))
    const html = '<!doctype html><h1>Hi</h1>'
    writeFileSync(join(sample, 'outputs/index.html'), html)
    writeFileSync(join(sample, 'outputs/copy.html'), html)
    writeFileSync(join(sample, 'outputs/app.js'), 'x'.repeat(7000))
    writeFileSync(join(sample, 'outputs/shot.png'), pngHeader(800, 600))
    writeFileSync(join(sample, 'notes.md'), 'Size: 1536 by 864, as asked.')
    const judge = genericJudge().mockResolvedValue(null)
    await gradeRun(dir, run, { useJev: false })
    const [input] = judge.mock.calls[0]
    expect(input.notes).toBe('Size: 1536 by 864, as asked.')
    // The start of each text file beside the page: no picture, and no file that says what the page says.
    expect(input.others.map((o) => [o.file, o.text.length])).toEqual([['outputs/app.js', 6000]])

    // What it said is part of what was judged: a change to it has the output judged again.
    judge.mockClear()
    await gradeRun(dir, run, { useJev: false })
    expect(judge).not.toHaveBeenCalled()
    writeFileSync(join(sample, 'notes.md'), 'Size: 1600 by 1200.')
    await gradeRun(dir, run, { useJev: false })
    expect(judge).toHaveBeenCalledTimes(1)
  })

  it.skipIf(process.platform === 'win32')(
    'reads no notes through a link out of the output’s folder',
    async () => {
      const { dir, run } = skillWith(['email'], ['email-s1'])
      const sample = join(dir, 'evals/runs', run, 'email-s1')
      writeFileSync(join(dir, 'secret.md'), 'not the agent’s to show')
      symlinkSync(join(dir, 'secret.md'), join(sample, 'notes.md'))
      const judge = genericJudge().mockResolvedValue(null)
      await gradeRun(dir, run, { useJev: false })
      expect(judge.mock.calls[0][0].notes).toBeNull()
    },
  )
})

describe('gradeRun, on a picture held to the case’s size', () => {
  it('reads the picture’s size and flags one that is not the size asked', async () => {
    const { dir, run } = skillWith(['cover'], ['cover-s1'])
    const outputs = join(dir, 'evals/runs', run, 'cover-s1/outputs')
    rmSync(join(outputs, 'note.md'))
    writeFileSync(join(outputs, 'cover.png'), pngHeader(1200, 630))
    writeFileSync(join(dir, 'evals/cases/cover/case.yaml'), 'bench:\n  size: [1600, 900]\n')
    const [result] = (await gradeRun(dir, run, { useJev: false })).results
    expect(result).toMatchObject({ pixels: [1200, 630], size: [1600, 900] })
    expect(result.flags).toContain('size: 1200 × 630 px, case asks 1600 × 900 px')

    writeFileSync(join(outputs, 'cover.png'), pngHeader(1600, 900))
    const [right] = (await gradeRun(dir, run, { useJev: false })).results
    expect(right.flags.filter((f) => f.startsWith('size:'))).toEqual([])
  })
})

describe('gradeRun, on a picture too large or too small for Jev', () => {
  /** A skill whose one output is a picture of the size given. */
  function pictureSkill(width: number, height: number) {
    const { dir, run } = skillWith(['cover'], ['cover-s1'])
    const sample = join(dir, 'evals/runs', run, 'cover-s1')
    rmSync(join(sample, 'outputs/note.md'))
    writeFileSync(join(sample, 'outputs/cover.png'), pngHeader(width, height))
    return { dir, run, sample }
  }

  it('draws a copy inside the sizes Jev reads, and gives the pack that copy with the file’s own size', async () => {
    const { dir, run, sample } = pictureSkill(1920, 1080)
    vi.spyOn(Jev, 'available').mockReturnValue(true)
    const judge = genericJudge().mockResolvedValue(null)
    const render = vi.fn(async (_page: unknown, size: { width: number; height: number }) => ({
      png: pngHeader(size.width, size.height),
      layout: null,
    }))
    const [result] = (await gradeRun(dir, run, { useJev: true, render })).results
    // The window has the picture's own shape, so the whole of it is drawn.
    expect(render.mock.calls).toEqual([
      [
        { skill: dir, run, sample: 'cover-s1', file: 'outputs/cover.png' },
        { width: 1568, height: 882 },
      ],
    ])
    expect(readdirSync(join(sample, 'renders'))).toEqual(['cover-1568x882.png'])
    const [input] = judge.mock.calls[0]
    expect(input.fitted).toMatchObject({
      file: 'outputs/cover.png',
      pixels: [1920, 1080],
      read: { problem: null },
    })
    // The size a case is held to is still the file's own.
    expect(result.pixels).toEqual([1920, 1080])

    // The copy kept stands for the picture: nothing is drawn or asked again.
    render.mockClear()
    judge.mockClear()
    await gradeRun(dir, run, { useJev: true, render })
    expect(render).not.toHaveBeenCalled()
    expect(judge).not.toHaveBeenCalled()
  })

  it('draws no copy of a picture Jev reads as it is, and none without a browser to draw with', async () => {
    vi.spyOn(Jev, 'available').mockReturnValue(true)
    const fits = pictureSkill(1200, 630)
    const judge = genericJudge().mockResolvedValue(null)
    const render = vi.fn()
    await gradeRun(fits.dir, fits.run, { useJev: true, render })
    expect(render).not.toHaveBeenCalled()
    expect(judge.mock.calls[0][0].fitted).toBeUndefined()

    const large = pictureSkill(1920, 1080)
    judge.mockClear()
    await gradeRun(large.dir, large.run, { useJev: true })
    expect(judge.mock.calls[0][0].fitted).toBeUndefined()
  })

  it('judges without a copy it could not draw, and says so', async () => {
    const { dir, run } = pictureSkill(1920, 1080)
    vi.spyOn(Jev, 'available').mockReturnValue(true)
    const judge = genericJudge().mockResolvedValue(null)
    const lines: string[] = []
    const render = vi.fn(async () => {
      throw new Error('The page stopped.')
    })
    await gradeRun(dir, run, { useJev: true, render, log: (line) => lines.push(line) })
    expect(judge.mock.calls[0][0].fitted).toBeUndefined()
    expect(lines).toContain(
      'cover-s1: cover.png could not be drawn at a size Jev reads: The page stopped.',
    )
  })
})

describe('gradeRun, on an output whose case is gone', () => {
  it('gives it no case, never the case whose id starts its name', async () => {
    const { dir, run } = skillWith(['email'], ['email-s1', 'email-reply-s1', 'email-2-s1'])
    writeFileSync(join(dir, 'evals/cases/email/case.yaml'), 'bench:\n  words: [500, 600]\n')
    const report = await gradeRun(dir, run, { useJev: false })
    // The name the folder gives stays in the report, so the output is no other case's.
    expect(report.results.map((r) => [r.sample, r.case, r.range])).toEqual([
      ['email-2-s1', 'email-2', null],
      ['email-reply-s1', 'email-reply', null],
      ['email-s1', 'email', [500, 600]],
    ])
  })

  it('reads a legacy flat file’s case from the start of its name, and a case it names whole', async () => {
    const { dir, run } = skillWith(['email', 'email-reply'], [])
    const flat = join(dir, 'evals/runs', run)
    mkdirSync(flat, { recursive: true })
    writeFileSync(join(flat, 'email-reply-2.md'), 'A reply.')
    writeFileSync(join(flat, 'named.md'), '---\ncase: email\n---\nAn email.')
    writeFileSync(join(flat, 'gone.md'), '---\ncase: email-reply-old\n---\nA reply, once.')
    const report = await gradeRun(dir, run, { useJev: false })
    expect(report.results.map((r) => [r.sample, r.case])).toEqual([
      ['email-reply-2.md', 'email-reply'],
      ['gone.md', 'email-reply-old'],
      ['named.md', 'email'],
    ])
  })
})

describe('gradeRun, on the rules a run is graded on', () => {
  const FORTY = 'Keep every note under forty words.'

  /** A run that kept the skill as it ran, whose one rule is `FORTY`, in a skill that says otherwise now. */
  function ranOnForty() {
    const { dir, run } = skillWith(['email'], ['email-s1'])
    mkdirSync(join(dir, 'evals/runs', run, '_skill'))
    writeFileSync(join(dir, 'evals/runs', run, '_skill/SKILL.md'), `# Notes\n\n- ${FORTY}\n`)
    writeFileSync(join(dir, 'SKILL.md'), '# Notes\n\n- Write every note in French.\n')
    return { dir, run }
  }

  const rulesAsked = (judge: ReturnType<typeof genericJudge>) =>
    judge.mock.calls.map(([input]) => input.rules.map((rule) => rule.text))

  it('grades a run on the rules of the skill it ran, whatever the skill says since', async () => {
    const { dir, run } = ranOnForty()
    const judge = genericJudge().mockResolvedValue(null)
    await gradeRun(dir, run, { useJev: false })
    expect(rulesAsked(judge)).toEqual([[FORTY]])
    // The skill a rule is read beside is the one it was read from: the run's own.
    expect(judge.mock.calls[0][0].skill).toBe(`# Notes\n\n- ${FORTY}\n`)

    // The skill moves on again: nothing the run is judged on changed, so nothing is asked.
    writeFileSync(join(dir, 'SKILL.md'), '# Notes\n\n- Sign every note with a name.\n')
    judge.mockClear()
    await gradeRun(dir, run, { useJev: false })
    expect(judge).not.toHaveBeenCalled()
  })

  it('takes the rules `bench.json` lists over the bullets of either file', async () => {
    const { dir, run } = ranOnForty()
    writeFileSync(
      join(dir, 'evals/bench.json'),
      JSON.stringify({ rules: ['Open every note with a greeting.'] }),
    )
    const judge = genericJudge().mockResolvedValue(null)
    await gradeRun(dir, run, { useJev: false })
    expect(rulesAsked(judge)).toEqual([['Open every note with a greeting.']])
    // Listed rules stand under no heading of SKILL.md, so the file is not read beside them.
    expect(judge.mock.calls[0][0].skill).toBeNull()
  })
})

describe.skipIf(process.platform === 'win32')('gradeRun, on a case’s check command', () => {
  /** A skill graded as code too, whose one case has `check`, and a sample of it holding `files`. */
  function checked(check: string, files: Record<string, string>) {
    const { dir, run } = skillWith([], ['add-s1'])
    mkdirSync(join(dir, 'evals/cases/add'), { recursive: true })
    writeFileSync(join(dir, 'evals/cases/add/prompt.md'), 'Write add.')
    writeFileSync(join(dir, 'evals/cases/add/case.yaml'), `bench:\n  check: ${check}\n`)
    writeFileSync(join(dir, 'evals/bench.json'), JSON.stringify({ packs: ['code', 'design'] }))
    const sample = join(dir, 'evals/runs', run, 'add-s1')
    rmSync(join(sample, 'outputs/note.md'))
    for (const [file, text] of Object.entries(files)) writeFileSync(join(sample, file), text)
    return { dir, run, sample }
  }

  it('runs the check again at every grading, and keeps no answer of it', async () => {
    const { dir, run, sample } = checked('test -f fixed', { 'outputs/add.js': 'export {}' })
    const [failed] = (await gradeRun(dir, run, { useJev: false })).results
    expect(failed.scores.check).toBe(0)
    expect(failed.flags.join('\n')).toMatch('check failed (exit 1)')

    // What the check rests on is put right: no hash of the output sees it, and the check does.
    writeFileSync(join(sample, 'fixed'), '')
    const lines: string[] = []
    const again = await gradeRun(dir, run, { useJev: false, log: (line) => lines.push(line) })
    expect(again.results[0].scores.check).toBe(100)
    // The answers that are kept were kept: the output itself did not change.
    expect(lines).toContain('1 of 1 outputs unchanged: kept their verdicts.')
    const cache = readJson<Record<string, unknown>>(
      join(dir, 'evals/runs', run, 'judge-cache.json'),
      {},
    )
    expect(Object.values(cache)).toEqual([null])
  })

  it('runs the check whichever file is judged: a page beside its script, or a note alone', async () => {
    const page = checked('test -f outputs/app.js', {
      'outputs/index.html': '<!doctype html><h1>Hi</h1>',
      'outputs/app.js': 'export {}',
    })
    const [beside] = (await gradeRun(page.dir, page.run, { useJev: false })).results
    expect(beside.primary).toEqual({ file: 'outputs/index.html', kind: 'html' })
    expect(beside.scores.check).toBe(100)

    const note = checked('test -f outputs/add.js', { 'outputs/note.md': 'I could not write it.' })
    const [alone] = (await gradeRun(note.dir, note.run, { useJev: false })).results
    expect(alone.primary).toEqual({ file: 'outputs/note.md', kind: 'markdown' })
    expect(alone.scores.check).toBe(0)
  })

  it('scores an output with no file 0, whatever its check says', async () => {
    const { dir, run } = checked('exit 0', {})
    const [result] = (await gradeRun(dir, run, { useJev: false })).results
    expect(result.primary).toBeNull()
    expect(result.scores).toMatchObject({ check: 0, total: 0 })
  })

  it('runs no check for a legacy flat file, which has no folder of its own', async () => {
    const { dir, run } = checked('exit 0', {})
    rmSync(join(dir, 'evals/runs', run, 'add-s1'), { recursive: true })
    writeFileSync(join(dir, 'evals/runs', run, 'add-1.md'), 'A note about add.')
    const [result] = (await gradeRun(dir, run, { useJev: false })).results
    expect(result.case).toBe('add')
    expect(result.packs.code).toBeNull()
  })
})

describe('gradeRun, on the packs it is asked to run', () => {
  it('does not ask a pack again when another pack is ticked', async () => {
    const { dir, run } = skillWith(['email'], ['email-s1'])
    await gradeRun(dir, run, { useJev: false })
    const judge = genericJudge()
    await gradeRun(dir, run, { useJev: false, packs: ['workflow'] })
    expect(judge).not.toHaveBeenCalled()
  })

  it('refuses a pack named for this grading that the app does not have', async () => {
    const { dir, run } = skillWith(['email'], ['email-s1'])
    await expect(gradeRun(dir, run, { useJev: false, packs: ['wrokflow'] })).rejects.toThrow(
      'No judge pack named wrokflow.',
    )
    // A `bench.json` may outlive a pack: the name is left out, and the rest is graded.
    writeFileSync(join(dir, 'evals/bench.json'), JSON.stringify({ packs: ['wrokflow'] }))
    expect((await gradeRun(dir, run, { useJev: false })).packs).toEqual(['generic'])
  })
})

describe('gradeRun, on the words a case’s range counts', () => {
  it('counts what a reader reads: no markup of a page, no heading or code of Markdown', async () => {
    const { dir, run } = skillWith(['note', 'page'], ['note-s1', 'page-s1'])
    const runDir = join(dir, 'evals/runs', run)
    writeFileSync(
      join(runDir, 'note-s1/outputs/note.md'),
      '# One two three\n\n```\nfour five\n```\n',
    )
    rmSync(join(runDir, 'page-s1/outputs/note.md'))
    writeFileSync(
      join(runDir, 'page-s1/outputs/index.html'),
      '<!doctype html><html lang="en"><head><title>Not counted</title><style>p { margin: 0 }</style></head>' +
        '<body><p class="lead">Two words</p><script>const never = "counted"</script></body></html>',
    )
    writeFileSync(join(dir, 'evals/cases/note/case.yaml'), 'bench:\n  words: [0, 3]\n')
    const [note, page] = (await gradeRun(dir, run, { useJev: false })).results
    expect(note.words).toBe(0)
    expect(note.flags.filter((flag) => flag.startsWith('length:'))).toEqual([])
    expect(page.words).toBe(2)
  })
})

describe('jevForRun', () => {
  it('grades by code alone with no key, but never over a report Jev scored', () => {
    const { dir, run } = skillWith(['email'], ['email-s1'])
    const report = join(dir, 'evals/runs', run, 'report.json')
    const key = vi.spyOn(Jev, 'available').mockReturnValue(false)
    expect(jevForRun(dir, run)).toBe(false)
    writeFileSync(report, JSON.stringify({ model: null, results: [] }))
    expect(jevForRun(dir, run)).toBe(false)
    // A report that cannot be read holds no score to lose.
    writeFileSync(report, '{ "model": ')
    expect(jevForRun(dir, run)).toBe(false)
    writeFileSync(report, JSON.stringify({ model: 'jev-1.14.0', results: [] }))
    expect(() => jevForRun(dir, run)).toThrow(
      'Jev scored this run, and no TypeSafe key is set to grade it again.',
    )
    key.mockReturnValue(true)
    expect(jevForRun(dir, run)).toBe(true)
  })
})

/** A report holding `results`, each given only what the test reads. */
const reportOf = (results: Array<Partial<ReportResult>>): Report => ({
  createdAt: '',
  model: null,
  inputTokens: 0,
  seconds: 0,
  config: { packs: ['generic'], rules: null, weights: {}, yes: 0.5, no: 0.5 },
  packs: ['generic'],
  results: results.map((result) => ({
    sample: '',
    case: null,
    label: null,
    tests: [],
    artifacts: [],
    primary: { file: 'outputs/note.md', kind: 'markdown' },
    words: 0,
    range: null,
    packs: {},
    scores: { total: null },
    flags: [],
    confidence: null,
    ...result,
  })),
})

describe('selfTest', () => {
  const anchor = (label: string, total: number | null, tests: string[] = []) => ({
    sample: `${label}.md`,
    case: 'email',
    label,
    tests,
    scores: { total, rubric: total },
  })

  it('passes a bad anchor only when both are scored and the good one scores more', () => {
    const lines = (good: number | null, bad: number | null) =>
      selfTest(reportOf([anchor('good', good), anchor('bad', bad)])).lines.map((line) => line.ok)
    expect(lines(80, 40)).toEqual([true])
    expect(lines(40, 40)).toEqual([false])
    // An anchor no pack scored says nothing: it is no pass, whichever side it is on.
    expect(lines(80, null)).toEqual([false])
    expect(lines(null, 40)).toEqual([false])
    expect(lines(0, null)).toEqual([false])
  })

  it('fails a layer no pack scores, and checks nothing without a good anchor of the case', () => {
    const typo = selfTest(reportOf([anchor('good', 80), anchor('bad', 40, ['rubrik'])]))
    expect(typo).toMatchObject({ failures: 1, lines: [{ layer: 'rubrik', good: null }] })
    expect(selfTest(reportOf([anchor('bad', 40)]))).toEqual({ lines: [], failures: 0 })
  })
})

describe('compareReports', () => {
  const scored = (sample: string, total: number, caseId: string | null = 'email') => ({
    sample,
    case: caseId,
    scores: { total },
  })

  it('reads a sample against the one of its name, however many either run has', () => {
    const before = reportOf([
      scored('email-s1', 10),
      scored('email-s10', 20),
      scored('email-s2', 30),
    ])
    const after = reportOf([scored('email-s10', 25), scored('email-s2', 90), scored('email-s3', 1)])
    expect(compareReports(before, after)).toEqual([
      { key: 'email email-s10', deltas: { total: 5 } },
      { key: 'email email-s2', deltas: { total: 60 } },
    ])
  })

  it('reads a legacy flat file against the next of its case', () => {
    const before = reportOf([scored('email-1.md', 10), scored('email-2.md', 20)])
    const after = reportOf([scored('email-a.md', 15), scored('email-b.md', 40)])
    expect(compareReports(before, after).map((row) => row.deltas.total)).toEqual([5, 20])
  })

  it('reads a run of flat files against a run of folders by case, since no name is shared', () => {
    const before = reportOf([scored('email-1.md', 10), scored('email-2.md', 20)])
    const after = reportOf([scored('email-s1', 15), scored('email-s2', 40)])
    expect(compareReports(before, after)).toEqual([
      { key: 'email email-s1', deltas: { total: 5 } },
      { key: 'email email-s2', deltas: { total: 20 } },
    ])
  })
})

describe('scoredReport', () => {
  const check = (exit: number) => ({
    check: { command: 'npm test', exit, timedOut: false, tail: '' },
  })

  it('scores a report under the skill’s scoring as it is now, with the call’s own laid over', () => {
    const { dir } = skillWith(['add'], [])
    const report = reportOf([
      { sample: 'add-s1', case: 'add', packs: { code: check(0) } },
      { sample: 'add-s2', case: 'add', packs: { code: check(1) } },
    ])
    // The skill is graded on its rules and checks alone: the check command counts for nothing.
    expect(scoredReport(dir, report).results.map((r) => r.scores)).toEqual([
      { total: null, adherence: null, rubric: null },
      { total: null, adherence: null, rubric: null },
    ])

    writeFileSync(join(dir, 'evals/bench.json'), JSON.stringify({ packs: ['code'] }))
    const now = scoredReport(dir, report)
    expect(now.packs).toEqual(['generic', 'code'])
    expect(now.results.map((r) => r.scores.total)).toEqual([100, 0])
    expect(now.results[1].flags.join('\n')).toMatch('check failed (exit 1)')
    // The report it was given is left as it was.
    expect(report.results.map((r) => r.scores.total)).toEqual([null, null])

    expect(scoredReport(dir, report, { packs: ['generic'] }).packs).toEqual(['generic'])
    expect(() => scoredReport(dir, report, { packs: ['cod'] })).toThrow('No judge pack named cod.')
  })
})
