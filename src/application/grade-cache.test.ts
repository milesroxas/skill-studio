/**
 * What a grading asks Jev again, and what it keeps: each question by what it
 * was asked of, for every pack, in `judge-cache.json`.
 */
import {
  appendFileSync,
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
import { pngHeader } from '@domain/__fixtures__/image.ts'
import { rulesFromSkill } from '@domain/rules.ts'
import { SORT_PROMPT_VERSION, type SortedReading } from '@domain/sorting.ts'
import { loadCases } from '@infrastructure/cases.ts'
import { askStamp, checkStamp, ruleStamp, storeReadings } from '@infrastructure/rule-readings.ts'
import type { GenericRaw } from '@judges/generic/score.ts'
import { packById } from '@judges/index.ts'
import { Jev, type Usage } from '@judges/jev.ts'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { gradeRun } from './grade.ts'
import { JudgeCache } from './judge-cache.ts'

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

  it('reads again a kept reading of only the start of a long output, and keeps one of an output read whole', async () => {
    const { dir } = demo()
    const { ask } = answering()
    const first = await grade(dir)
    expect(first.results[0].scores.total).not.toBeNull()
    // A reading kept from before long outputs were asked in parts: of its first 40,000 characters alone.
    const path = join(dir, 'evals/runs', RUN, 'judge-cache.json')
    const file = JSON.parse(readFileSync(path, 'utf8'))
    for (const entry of Object.values(file.packs) as Array<{ raw: Record<string, unknown> }>)
      if (entry.raw && 'adherence' in entry.raw)
        entry.raw.cut = ['Jev read only the first 40,000 characters of the output']
    writeFileSync(path, JSON.stringify(file))
    ask.mockClear()
    const again = await grade(dir)
    // The pack ran again: its questions over the same state were answered from the cache, so Jev was asked nothing.
    expect(ask).not.toHaveBeenCalled()
    const raw = again.results[0].packs.generic as { cut?: string[] }
    expect(raw.cut ?? []).not.toContain('Jev read only the first 40,000 characters of the output')
    expect(again.results[0].scores.total).toBe(first.results[0].scores.total)
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

describe('gradeRun, on another grading of the same run', () => {
  const runOf = (dir: string) => join(dir, 'evals/runs', RUN)

  it('refuses while another copy grades the run, and writes nothing over it', async () => {
    const { dir } = demo()
    const report = readFileSync(join(runOf(dir), 'report.json'), 'utf8')
    writeFileSync(
      join(runOf(dir), '.grading.lock'),
      JSON.stringify({
        pid: process.ppid,
        at: new Date().toISOString(),
        by: 'the Skill Studio app',
      }),
    )
    const { ask } = answering()
    await expect(grade(dir)).rejects.toThrow(
      'This run is already being graded by the Skill Studio app',
    )
    expect(ask).not.toHaveBeenCalled()
    expect(readFileSync(join(runOf(dir), 'report.json'), 'utf8')).toBe(report)
  })

  it('gives the lock back when it is done, and when it fails', async () => {
    const { dir } = demo()
    answering()
    await grade(dir)
    expect(existsSync(join(runOf(dir), '.grading.lock'))).toBe(false)
    vi.spyOn(
      packById('generic') as NonNullable<ReturnType<typeof packById>>,
      'judge',
    ).mockImplementation(() => {
      throw new Error('no network')
    })
    await grade(dir)
    expect(existsSync(join(runOf(dir), '.grading.lock'))).toBe(false)
    vi.spyOn(Jev, 'available').mockReturnValue(false)
    await expect(grade(dir)).rejects.toThrow('No TypeSafe key')
    expect(existsSync(join(runOf(dir), '.grading.lock'))).toBe(false)
  })

  it('keeps the answers another copy wrote to judge-cache.json while it graded', async () => {
    const { dir } = demo()
    const path = join(runOf(dir), 'judge-cache.json')
    const { ask } = answering()
    await grade(dir)
    // Two gradings read the file; the other writes first, with an answer of its own.
    const mine = new JudgeCache(path)
    const theirs = new JudgeCache(path)
    theirs.keepAnswer('theirs', { noul: 0.4 }, 10)
    theirs.write(path)
    mine.keepAnswer('mine', { noul: 0.6 }, 10)
    mine.write(path)
    const written = JSON.parse(readFileSync(path, 'utf8'))
    expect(Object.keys(written.answers)).toEqual(expect.arrayContaining(['theirs', 'mine']))
    // And every answer the first grading kept is there still.
    const again = new JudgeCache(path)
    expect(again.answer('theirs')).toEqual({ noul: 0.4 })
    ask.mockClear()
    await grade(dir)
    expect(ask).not.toHaveBeenCalled()
  })
})

describe('gradeRun, with the readings st sort kept', () => {
  const runSkill = (dir: string) => join(dir, 'evals/runs', RUN, '_skill')
  const packKeys = (dir: string): string[] =>
    Object.keys(
      JSON.parse(readFileSync(join(dir, 'evals/runs', RUN, 'judge-cache.json'), 'utf8')).packs,
    )

  /** Keep `readings` for the rules of `skillMd` and the checks of the demo's case, each by its words. */
  function keep(
    dir: string,
    skillMd: string,
    readings: {
      rules?: Record<string, SortedReading>
      checks?: Record<string, SortedReading>
      /** By a check's words, the rules it cannot hold beside, each by its words. */
      against?: Record<string, string[]>
    },
  ) {
    const [testCase] = loadCases(dir)
    const ask = askStamp(dir, testCase)
    const entry = (
      kind: 'rule' | 'check',
      stamp: string,
      text: string,
      reading: SortedReading,
    ) => ({
      stamp,
      kind,
      text,
      case: kind === 'check' ? testCase.id : null,
      reading,
      reason: '',
      refused: [],
      provider: 'claude-code',
      model: 'sonnet',
      at: '2026-11-21T00:00:00.000Z',
      prompt: SORT_PROMPT_VERSION,
    })
    storeReadings(dir, [
      ...rulesFromSkill(skillMd).flatMap((rule) => {
        const reading = readings.rules?.[rule.text]
        return reading ? [entry('rule', ruleStamp(skillMd, rule.text), rule.text, reading)] : []
      }),
      ...testCase.graders.flatMap((grader) => {
        const reading = readings.checks?.[grader.statement]
        const against = (readings.against?.[grader.statement] ?? []).map((rule) => ({
          rule,
          fix: 'Allow more words where the case asks for them.',
        }))
        return reading
          ? [
              {
                ...entry(
                  'check',
                  checkStamp(skillMd, ask, grader.statement),
                  grader.statement,
                  reading,
                ),
                against,
              },
            ]
          : []
      }),
    ])
  }

  const UNDER = 'Keep the note under 120 words.'
  const WHERE = 'The note tells the reader the change is under Settings > Export.'
  const count: SortedReading = {
    reading: 'exact',
    outputs: ['text'],
    join: 'all',
    tests: [
      {
        test: 'count',
        read: { part: 'text', skip: null },
        what: 'words',
        compare: 'at most',
        n: 119,
      },
    ],
  }
  const vague: SortedReading = {
    reading: 'unmarkable',
    why: 'vague',
    with: null,
    fix: 'Say it plainly.',
  }
  const found: SortedReading = {
    reading: 'exact',
    outputs: ['text'],
    join: 'all',
    tests: [
      {
        test: 'has',
        read: { part: 'text', skip: null },
        values: { from: 'listed', items: ['Settings > Export'] },
        need: 'all',
        at: 'anywhere',
        match: 'characters',
        case: 'any',
      },
    ],
  }

  it('moves no key a grading without readings made, and finds no reading made for another version of the skill', async () => {
    const { dir } = demo()
    const { ask } = answering()
    const first = await grade(dir)
    const keys = packKeys(dir)
    // Readings of the skill as it is now, after an edit the run never saw.
    const edited = `${readFileSync(join(dir, 'SKILL.md'), 'utf8')}\n- Name the date the change reached every account.\n`
    keep(dir, edited, { rules: { [UNDER]: vague }, checks: { [WHERE]: found } })
    ask.mockClear()
    const again = await grade(dir)
    expect(ask).not.toHaveBeenCalled()
    expect(packKeys(dir)).toEqual(keys)
    expect(again.results[0].scores).toEqual(first.results[0].scores)
    expect(again.results[0].packs).toEqual(first.results[0].packs)
  })

  it('says in one line when the skill was sorted and what was graded has no reading, and what to run', async () => {
    const { dir } = demo()
    answering()
    const never: string[] = []
    await gradeRun(dir, RUN, { useJev: true, log: (line) => never.push(line) })
    // Never sorted: nothing to say.
    expect(never.some((line) => line.includes('st sort'))).toBe(false)
    const edited = `${readFileSync(join(dir, 'SKILL.md'), 'utf8')}\n- Name the date the change reached every account.\n`
    keep(dir, edited, { rules: { [UNDER]: vague }, checks: { [WHERE]: found } })
    const none: string[] = []
    const report = await gradeRun(dir, RUN, { useJev: true, log: (line) => none.push(line) })
    expect(report.results).toHaveLength(1)
    expect(none.filter((line) => line.includes('st sort'))).toEqual([
      expect.stringMatching(
        /^None of the \d+ rules and checks graded was sorted for the skill and cases this run used, so Jev was asked them all as before\. Run st sort to sort them\.$/,
      ),
    ])
    // Some sorted for the run's own SKILL.md: how many are not.
    const skillMd = readFileSync(join(runSkill(dir), 'SKILL.md'), 'utf8')
    keep(dir, skillMd, { rules: { [UNDER]: count } })
    const some: string[] = []
    await gradeRun(dir, RUN, { useJev: true, log: (line) => some.push(line) })
    const [testCase] = loadCases(dir)
    const facts = rulesFromSkill(skillMd).length + testCase.graders.length
    expect(some).toContain(
      `${facts - 1} of the ${facts} rules and checks graded were not sorted for the skill and cases this run used, so Jev was asked them as before. Run st sort to sort them.`,
    )
  })

  it('sets a rule aside on a case whose check it cannot hold beside, naming the check, and grades the check', async () => {
    const { dir } = demo()
    const { asked } = answering()
    const skillMd = readFileSync(join(runSkill(dir), 'SKILL.md'), 'utf8')
    keep(dir, skillMd, {
      rules: { [UNDER]: count },
      checks: { [WHERE]: found },
      against: { [WHERE]: [UNDER] },
    })
    const report = await gradeRun(dir, RUN, { useJev: true, log: () => {} })
    const raw = report.results[0].packs.generic as GenericRaw
    expect(raw.adherence?.rules.find((r) => r.text === UNDER)).toMatchObject({
      unmarkable: {
        why: 'conflict',
        with: WHERE,
        fix: 'Allow more words where the case asks for them.',
      },
    })
    expect(asked().some((q) => q.includes(UNDER))).toBe(false)
    expect(raw.rubric?.statements.find((s) => s.text === WHERE)).toMatchObject({
      code: { answer: 'met' },
    })
    // The check is named by its words, cut to what a flag holds.
    expect(report.results[0].flags).toEqual([
      expect.stringMatching(
        /^rule not counted, it cannot be marked as written \(it cannot hold beside "The note tells the reader the change is under Settings > Ex…"\) \(Rules\): Keep the note under 120 words\.$/,
      ),
    ])
  })

  it('grades on the readings made from the run’s own SKILL.md, and keeps them in the key', async () => {
    const { dir } = demo()
    const { ask, asked } = answering()
    await grade(dir)
    const keys = packKeys(dir)
    const skillMd = readFileSync(join(runSkill(dir), 'SKILL.md'), 'utf8')
    keep(dir, skillMd, {
      rules: { [UNDER]: count, 'End with one line that says where to find the change.': vague },
      checks: { [WHERE]: found },
    })
    ask.mockClear()
    const lines: string[] = []
    const report = await gradeRun(dir, RUN, { useJev: true, log: (line) => lines.push(line) })
    // The pack read again under a key of its own; its questions were answered from the cache,
    // and the rule nobody can mark was asked of no one.
    expect(packKeys(dir).length).toBeGreaterThan(keys.length)
    expect(asked().some((q) => q.startsWith('rule:'))).toBe(false)
    const raw = report.results[0].packs.generic as GenericRaw
    const rules = raw.adherence?.rules ?? []
    expect(rules.find((r) => r.text === UNDER)).toMatchObject({ code: { answer: 'met' } })
    expect(rules.at(-1)).toMatchObject({ unmarkable: { why: 'vague' } })
    expect(raw.rubric?.statements.find((s) => s.text === WHERE)).toMatchObject({
      code: { answer: 'met' },
    })
    expect(lines).toContain(
      'Rules and checks over 1 outputs: 6 asked of Jev, of which code answered 2 and set 0 aside as not sure; 1 cannot be marked as written, so were asked of no one.',
    )
    // Graded again with nothing changed, the kept reading is taken whole.
    ask.mockClear()
    await grade(dir)
    expect(ask).not.toHaveBeenCalled()
  })

  it('stops with what is wrong when the readings file does not read, and writes no report over the last', async () => {
    const { dir } = demo()
    answering()
    await grade(dir)
    const report = join(dir, 'evals/runs', RUN, 'report.json')
    const before = readFileSync(report, 'utf8')
    mkdirSync(join(dir, 'evals'), { recursive: true })
    writeFileSync(join(dir, 'evals', 'rule-readings.json'), '{ not json')
    await expect(grade(dir)).rejects.toThrow(
      /rule-readings\.json is malformed and could not be read: .*Run st sort again to write it anew, or delete it to grade as before\./,
    )
    expect(readFileSync(report, 'utf8')).toBe(before)
  })
})
