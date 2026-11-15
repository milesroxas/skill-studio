/**
 * What a grading asks Jev again, and what it keeps: each question by what it
 * was asked of, for every pack, in `judge-cache.json`.
 */
import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pngHeader } from '@domain/__fixtures__/image.ts'
import { packById } from '@judges/index.ts'
import { Jev, type Usage } from '@judges/jev.ts'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { gradeRun } from './grade.ts'

const FIXTURE = resolve(import.meta.dirname, '../../fixtures/demo-skill')
const RUN = '2026-10-30-skill-v0-claude-haiku'
const made: string[] = []
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})
afterEach(() => vi.restoreAllMocks())

/** A copy of the demo skill: one case with two checks, graded by the generic and workflow packs. */
function demo(): { dir: string; sample: string; cases: string } {
  const dir = join(mkdtempSync(join(tmpdir(), 'st-cache-')), 'demo-skill')
  made.push(join(dir, '..'))
  cpSync(FIXTURE, dir, { recursive: true, verbatimSymlinks: true })
  return {
    dir,
    sample: join(dir, 'evals/runs', RUN, 'release-note-s1'),
    cases: join(dir, 'evals/cases/release-note'),
  }
}

/**
 * Jev answers every question 0.9, at 100 input tokens a request, and `asked`
 * lists the questions each grading sent, by name.
 */
function answering() {
  vi.spyOn(Jev, 'available').mockReturnValue(true)
  const ask = vi.spyOn(Jev.prototype, 'ask').mockImplementation(async function (
    this: Jev,
    _state,
    questions,
    _signal,
    usage?: Usage,
  ) {
    this.inputTokens += 100
    if (usage) usage.inputTokens = 100
    return Object.fromEntries(Object.keys(questions).map((id) => [id, { noul: 0.9 } as never]))
  })
  const asked = (): string[] => ask.mock.calls.flatMap(([, questions]) => Object.keys(questions))
  return { ask, asked }
}

const grade = (dir: string, options: { model?: string } = {}) =>
  gradeRun(dir, RUN, { useJev: true, ...options })

/** The questions of the generic pack among `names`: its rules, headings and checks. */
const generic = (names: string[]) => names.filter((name) => /^(rule|heading|up|check):/.test(name))

describe('gradeRun, on what a question is asked again for', () => {
  it('asks nothing again when a check’s weight or the case’s title changes', async () => {
    const { dir, cases } = demo()
    const { ask, asked } = answering()
    await grade(dir)
    expect(generic(asked()).length).toBeGreaterThan(0)
    expect(asked()).toContain('followed_task')
    ask.mockClear()

    const check = join(cases, 'graders/01-names-the-change.md')
    writeFileSync(check, readFileSync(check, 'utf8').replace('weight: 2', 'weight: 5'))
    const yaml = join(cases, 'case.yaml')
    writeFileSync(yaml, readFileSync(yaml, 'utf8').replace('Release note for', 'A note on'))
    const report = await grade(dir)
    expect(ask).not.toHaveBeenCalled()
    // The weight is read in scoring all the same.
    const statements = (
      report.results[0].packs.generic as { rubric: { statements: { weight: number }[] } }
    ).rubric.statements
    expect(statements.map((s) => s.weight)).toContain(5)
  })

  it('asks a check added to the case, and nothing else of any pack', async () => {
    const { dir, cases } = demo()
    const { ask, asked } = answering()
    await grade(dir)
    ask.mockClear()
    writeFileSync(
      join(cases, 'graders/03-plain.md'),
      '---\ntype: llm\nweight: 1\n---\n\nThe note uses no jargon.\n',
    )
    await grade(dir)
    expect(asked()).toEqual([expect.stringMatching(/^check:/)])
  })

  it('asks a check again when its words change, and the other check not', async () => {
    const { dir, cases } = demo()
    const { ask, asked } = answering()
    await grade(dir)
    const before = asked().filter((name) => name.startsWith('check:'))
    expect(before).toHaveLength(2)
    ask.mockClear()
    const check = join(cases, 'graders/02-says-where.md')
    writeFileSync(check, `${readFileSync(check, 'utf8').trim()} It names the menu.\n`)
    await grade(dir)
    expect(asked()).toHaveLength(1)
    expect(before).toContain(asked()[0])
  })

  it('asks the rules and checks again when the output changes, and not what rests on the request', async () => {
    const { dir, sample } = demo()
    const { ask, asked } = answering()
    await grade(dir)
    ask.mockClear()
    appendFileSync(join(sample, 'outputs/output.md'), '\nOne more line.\n')
    await grade(dir)
    const names = asked()
    expect(names.some((n) => n.startsWith('rule:'))).toBe(true)
    expect(names.some((n) => n.startsWith('check:'))).toBe(true)
    // The headings and whether each rule comes up are asked of the request and the skill alone.
    expect(names.filter((n) => /^(heading|up):/.test(n))).toEqual([])
    // The workflow pack reads the transcript and the task, which did not change.
    expect(names).not.toContain('followed_task')
  })

  it('asks the workflow pack again when the transcript changes, and the generic pack nothing', async () => {
    const { dir, sample } = demo()
    const { ask, asked } = answering()
    await grade(dir)
    ask.mockClear()
    appendFileSync(
      join(sample, 'transcript.jsonl'),
      `${JSON.stringify({ step: 99, at: 9000, kind: 'text', text: 'Done.' })}\n`,
    )
    await grade(dir)
    expect(asked()).toEqual(['followed_task'])
  })

  it('asks every question again of another model, and of a pack whose questions changed', async () => {
    const { dir } = demo()
    const { ask, asked } = answering()
    await grade(dir)
    const all = asked().sort()
    ask.mockClear()
    await grade(dir, { model: 'jev-0.0.1' })
    expect(asked().sort()).toEqual(all)
    ask.mockClear()

    const pack = packById('generic')
    if (!pack) throw new Error('no generic pack')
    vi.spyOn(pack, 'version', 'get').mockReturnValue(pack.version + 1)
    await grade(dir)
    expect(asked().sort()).toEqual(generic(all))
  })

  it('asks the design pack again when its picture changes, and not for a check added', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'st-cache-design-'))
    made.push(dir)
    writeFileSync(
      join(dir, 'SKILL.md'),
      '# Posters\n\n- Set every word of the poster in one typeface.\n',
    )
    mkdirSync(join(dir, 'evals/cases/poster/graders'), { recursive: true })
    writeFileSync(join(dir, 'evals/cases/poster/prompt.md'), 'Make the poster.')
    writeFileSync(join(dir, 'evals/bench.json'), JSON.stringify({ packs: ['generic', 'design'] }))
    const picture = join(dir, 'evals/runs/run-1/poster-s1/outputs/poster.png')
    mkdirSync(join(picture, '..'), { recursive: true })
    writeFileSync(picture, pngHeader(800, 600))
    const { ask, asked } = answering()
    await gradeRun(dir, 'run-1', { useJev: true })
    expect(asked()).toEqual(expect.arrayContaining(['hierarchy', 'finished', 'rule:r1']))
    ask.mockClear()

    writeFileSync(
      join(dir, 'evals/cases/poster/graders/01-title.md'),
      '---\ntype: llm\n---\n\nThe poster has a title.\n',
    )
    await gradeRun(dir, 'run-1', { useJev: true })
    expect(asked()).toEqual([expect.stringMatching(/^check:/)])
    ask.mockClear()

    writeFileSync(picture, pngHeader(900, 600))
    await gradeRun(dir, 'run-1', { useJev: true })
    expect(asked()).toEqual(expect.arrayContaining(['hierarchy', 'finished', 'rule:r1']))
  })
})

describe('gradeRun, on a request that fails', () => {
  it('keeps the answers that came back, and asks only the ones that did not on the next grading', async () => {
    const { dir } = demo()
    const { ask, asked } = answering()
    const answer = ask.getMockImplementation()
    if (!answer) throw new Error('no answer')
    // Whether each rule comes up is asked in a request of its own: that one fails.
    ask.mockImplementation(async function (this: Jev, state, questions, signal, usage) {
      if (Object.keys(questions).some((q) => q.startsWith('up:'))) throw new Error('no network')
      return answer.call(this, state, questions, signal, usage)
    })
    const failed = await grade(dir)
    expect(failed.results[0].flags[0]).toBe('generic pack failed: no network')
    expect(failed.results[0].scores.total).toBeNull()
    const sent = generic(asked())
    ask.mockClear()

    ask.mockImplementation(answer)
    const fixed = await grade(dir)
    expect(fixed.results[0].scores.total).toBeTypeOf('number')
    // The rules and checks that were answered are not asked again; the request that failed is.
    expect(asked().every((q) => /^(heading|up):/.test(q))).toBe(true)
    expect(asked().sort()).toEqual(sent.filter((q) => /^(heading|up):/.test(q)).sort())
  })

  it('asks again only a question Jev left unanswered, or answered with no number', async () => {
    const { dir } = demo()
    const { ask, asked } = answering()
    const answer = ask.getMockImplementation()
    if (!answer) throw new Error('no answer')
    let left: string[] = []
    ask.mockImplementation(async function (this: Jev, state, questions, signal, usage) {
      const answers = (await answer.call(this, state, questions, signal, usage)) as Record<
        string,
        unknown
      >
      const checks = Object.keys(answers).filter((q) => q.startsWith('check:'))
      if (checks.length < 2) return answers as never
      left = checks
      // One check is left out of the reply, and the other has no number.
      delete answers[checks[0]]
      answers[checks[1]] = { noul: 'yes' }
      return answers as never
    })
    const failed = await grade(dir)
    expect(failed.results[0].scores.total).toBeNull()
    expect(failed.results[0].flags[0]).toMatch(/^generic pack failed: Jev gave no noul/)
    ask.mockClear()

    ask.mockImplementation(answer)
    const fixed = await grade(dir)
    expect(fixed.results[0].scores.total).toBeTypeOf('number')
    expect(asked().sort()).toEqual(left.sort())
  })
})

describe('gradeRun, on what a report says its answers cost', () => {
  it('counts the tokens of every answer it holds, kept or asked, and apart what this grading paid', async () => {
    const { dir, cases } = demo()
    const { ask } = answering()
    const first = await grade(dir)
    const requests = ask.mock.calls.length
    expect(first.inputTokens).toBe(requests * 100)
    expect(first.asked?.inputTokens).toBe(requests * 100)
    expect(first.asked?.questions).toBeGreaterThan(requests)

    // A Regrade that asks nothing keeps what the answers cost.
    const again = await grade(dir)
    expect(again.inputTokens).toBe(first.inputTokens)
    expect(again.asked).toEqual({ questions: 0, inputTokens: 0 })

    // A check added is one request of one question: its cost is added to the rest.
    writeFileSync(
      join(cases, 'graders/03-plain.md'),
      '---\ntype: llm\nweight: 1\n---\n\nThe note uses no jargon.\n',
    )
    const added = await grade(dir)
    expect(added.inputTokens).toBe(first.inputTokens + 100)
    expect(added.asked).toEqual({ questions: 1, inputTokens: 100 })
  })
})

describe('gradeRun, on a judge-cache.json it did not write', () => {
  const cacheOf = (dir: string) => join(dir, 'evals/runs', RUN, 'judge-cache.json')

  it('grades over a file an earlier version wrote, one that is damaged, and one that holds the wrong things', async () => {
    for (const kept of [
      JSON.stringify({ abc: { adherence: null, rubric: null }, def: null }),
      '{ not json',
      JSON.stringify({
        version: 2,
        generation: 'x',
        packs: { a: 1 },
        answers: { b: { answer: 'yes' } },
      }),
      JSON.stringify([1, 2]),
    ]) {
      const { dir } = demo()
      writeFileSync(cacheOf(dir), kept)
      const { asked } = answering()
      const report = await grade(dir)
      expect(report.results[0].scores.total).toBeTypeOf('number')
      // Nothing it held was taken for an answer: every question was asked.
      expect(asked()).toContain('followed_task')
      expect(generic(asked()).length).toBeGreaterThan(0)
      const written = JSON.parse(readFileSync(cacheOf(dir), 'utf8'))
      expect(written.version).toBe(2)
      vi.restoreAllMocks()
    }
  })

  it('reads the readings an earlier version kept, by the hash they were kept under', async () => {
    const { dir } = demo()
    const { ask } = answering()
    const first = await grade(dir)
    // What Skill Studio 0.14.0 wrote: each pack's reading by its hash, and nothing else.
    const written = JSON.parse(readFileSync(cacheOf(dir), 'utf8'))
    const old = Object.fromEntries(
      Object.entries(written.packs as Record<string, { raw: unknown }>).map(([k, e]) => [k, e.raw]),
    )
    writeFileSync(cacheOf(dir), JSON.stringify(old))
    ask.mockClear()
    const again = await grade(dir)
    expect(ask).not.toHaveBeenCalled()
    expect(again.results[0].scores).toEqual(first.results[0].scores)
  })
})
