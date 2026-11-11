import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pngHeader } from '@domain/__fixtures__/image.ts'
import type { Report } from '@domain/schemas.ts'
import { readJson } from '@infrastructure/fs.ts'
import { packById } from '@judges/index.ts'
import { Jev } from '@judges/jev.ts'
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
      // The first sample's answer is kept; the stopped one's "check failed" is not.
      const cache = readJson<Record<string, { check: { exit: number } } | null>>(
        join(runDir, 'judge-cache.json'),
        {},
      )
      // Rules and checks are graded beside the check command, and without Jev that reading holds nothing.
      const checks = Object.values(cache).filter((answer) => answer !== null)
      expect(checks.map((answer) => answer.check.exit)).toEqual([0])
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

  it('draws the page at each size once, keeps the pictures beside outputs/, and gives them to the pack', async () => {
    const { dir, run, sample } = pageSkill()
    vi.spyOn(Jev, 'available').mockReturnValue(true)
    const judge = designJudge()
    const render = vi.fn(async (_page: unknown, size: { width: number; height: number }) =>
      pngHeader(size.width, size.height),
    )
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
    expect(existsSync(join(sample, 'renders/desktop-1280x960.png'))).toBe(true)
    expect(existsSync(join(sample, 'renders/phone-390x1200.png'))).toBe(true)
    const [input] = judge.mock.calls[0]
    expect(input.renders.map((r) => [r.size.id, r.read.problem])).toEqual([
      ['desktop', null],
      ['phone', null],
    ])

    // The pictures kept stand for the page as it is: nothing is drawn or asked again.
    render.mockClear()
    judge.mockClear()
    await gradeRun(dir, run, { useJev: true, render })
    expect(render).not.toHaveBeenCalled()
    expect(judge).not.toHaveBeenCalled()
  })

  it('logs a size it could not draw and judges without it', async () => {
    const { dir, run } = pageSkill()
    vi.spyOn(Jev, 'available').mockReturnValue(true)
    const judge = designJudge()
    const render = vi.fn(async (_page: unknown, size: { width: number; height: number }) => {
      if (size.width === 390) throw new Error('The page took longer than 20s.')
      return pngHeader(size.width, size.height)
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
    const render = vi.fn(async (_page: unknown, size: { width: number; height: number }) =>
      pngHeader(size.width, size.height),
    )
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
    const render = vi.fn(async (_page: unknown, size: { width: number; height: number }) =>
      pngHeader(size.width, size.height),
    )
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
