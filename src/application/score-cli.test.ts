/**
 * The command line scores as the app does: the reader's corrections, a
 * setting read as a pack judged, what two runs may be compared on, a grading
 * made with flags, and a sample since removed.
 */
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Corrections } from '@domain/pack.ts'
import type { Report } from '@domain/schemas.ts'
import { behindOf, gradedNow, scoreResult } from '@domain/scoring.ts'
import { loadBench } from '@infrastructure/cases.ts'
import { readRun } from '@infrastructure/runs.ts'
import { packVersions } from '@judges/index.ts'
import { Jev } from '@judges/jev.ts'
import { scorers } from '@judges/scorers.ts'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  compareRuns,
  correctionsOf,
  gradeRun,
  gradeSettings,
  type RunScoring,
  scoredReport,
} from './grade.ts'

const FIXTURE = resolve(import.meta.dirname, '../../fixtures/demo-skill')
const RUN = '2026-10-30-skill-v0-claude-haiku'
const SAMPLE = 'release-note-s1'
const made: string[] = []
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})
afterEach(() => vi.restoreAllMocks())

/** Jev answers every rule and check 0.9, and the first rule 0.1: one fact missed. */
beforeEach(() => {
  vi.spyOn(Jev, 'available').mockReturnValue(true)
  vi.spyOn(Jev.prototype, 'ask').mockImplementation(async (_state, questions) =>
    Object.fromEntries(
      Object.keys(questions).map((id) => [id, { noul: id === 'rule:r1' ? 0.1 : 0.9 } as never]),
    ),
  )
})

async function graded(options: Parameters<typeof gradeRun>[2] = { useJev: true }) {
  const dir = join(mkdtempSync(join(tmpdir(), 'st-score-')), 'demo-skill')
  made.push(join(dir, '..'))
  cpSync(FIXTURE, dir, { recursive: true, verbatimSymlinks: true })
  const report = await gradeRun(dir, RUN, options)
  return { dir, report }
}

/** The reader's answers on `SAMPLE` of `RUN`, as the app writes them. */
const correct = (dir: string, corrections: Corrections, run = RUN) =>
  writeFileSync(
    join(dir, 'evals/reviews.json'),
    JSON.stringify({ reviews: { [`${run}/${SAMPLE}`]: { corrections, updatedAt: '' } } }),
  )

/** The id of the verdict a missed rule has, as a correction names it. */
const missedId = (report: Report): string => {
  const scored = scoreResult(report.results[0], report.config, scorers)
  const missed = scored.verdicts.find((v) => v.layer === 'adherence' && v.met === false)
  if (!missed) throw new Error('no missed rule')
  return missed.id
}

/** A run as `st compare` reads it. */
const side = (dir: string, run: string): RunScoring => {
  const view = readRun(dir, run)
  if (!view.report) throw new Error('not graded')
  return {
    report: view.report,
    cases: view.cases,
    samples: view.samples.map((s) => s.name),
    corrections: correctionsOf(dir, run),
  }
}

describe('scoredReport, as `st report` scores', () => {
  it('counts the reader’s corrections, as the app does', async () => {
    const { dir, report } = await graded()
    const before = scoredReport(dir, report, {}, readRun(dir, RUN).cases)
    correct(dir, { [missedId(report)]: true })
    const after = scoredReport(dir, report, {}, readRun(dir, RUN).cases, {
      corrections: correctionsOf(dir, RUN),
    })
    expect(after.results[0].scores.adherence).toBeGreaterThan(
      before.results[0].scores.adherence ?? 100,
    )
  })

  it('leaves out the result of a sample folder since removed', async () => {
    const { dir, report } = await graded()
    expect(scoredReport(dir, report, {}, {}, { samples: [SAMPLE] }).results).toHaveLength(1)
    rmSync(join(dir, 'evals/runs', RUN, SAMPLE), { recursive: true })
    const samples = readRun(dir, RUN).samples.map((s) => s.name)
    expect(scoredReport(dir, report, {}, {}, { samples }).results).toEqual([])
  })

  it('gives no total where a setting a pack read as it judged changed, and a total where one read in scoring did', async () => {
    const { dir, report } = await graded()
    const { cases } = readRun(dir, RUN)
    const totalWith = (bench: object) => {
      writeFileSync(join(dir, 'evals/bench.json'), JSON.stringify(bench))
      return scoredReport(dir, report, {}, cases).results[0]
    }
    const packs = ['generic', 'workflow']
    expect(totalWith({ packs }).scores.total).toBeTypeOf('number')
    // Read in scoring: the scores follow it.
    expect(totalWith({ packs, workflow: { maxRetries: 4 }, yes: 0.8 }).scores.total).toBeTypeOf(
      'number',
    )
    for (const bench of [
      { packs, workflow: { summaryLines: 10 } },
      { packs, rules: ['Say what changed.'] },
    ]) {
      const result = totalWith(bench)
      expect(result.scores.total).toBeNull()
      expect(result.flags).toContain('Graded before a setting changed')
    }
    // The code pack's settings are its own: a skill not graded as code does not read them.
    expect(totalWith({ packs, codeCheck: { timeoutSeconds: 5 } }).scores.total).toBeTypeOf('number')
  })
})

describe('a grading made with --packs or --bench', () => {
  it('says so in the report, and the app holds it behind where it changed what was asked', async () => {
    const { dir, report } = await graded({
      useJev: true,
      config: { workflow: { maxRetries: 1, summaryLines: 5 } },
    })
    expect(report.overrides).toEqual({ bench: { workflow: { maxRetries: 1, summaryLines: 5 } } })
    const result = report.results[0]
    // As the app reads it, under bench.json as it is.
    const now = gradedNow(
      packVersions(),
      ['generic', 'workflow'],
      'jev-1.14.0',
      true,
      gradeSettings(loadBench(dir)),
    )
    const behind = behindOf(
      { yardstick: result.yardstick, model: report.model, graded: result.graded },
      { yardstick: null, jev: true, with: now },
    )
    expect(behind).toBe('Graded before a setting changed')
    // Under the same file laid over again, it stands.
    const same = scoredReport(dir, report, {
      config: { workflow: { maxRetries: 1, summaryLines: 5 } },
    })
    expect(same.results[0].scores.total).toBeTypeOf('number')

    const plain = await gradeRun(dir, RUN, { useJev: true })
    expect(plain.overrides).toBeUndefined()
    const packed = await gradeRun(dir, RUN, { useJev: true, packs: ['generic'] })
    expect(packed.overrides).toEqual({ packs: ['generic'] })
  })
})

describe('compareRuns, as `st compare` compares', () => {
  const OTHER = '2026-10-30-skill-v0-claude-haiku-2'

  async function twoRuns() {
    const { dir } = await graded()
    await gradeRun(dir, OTHER, { useJev: true })
    return dir
  }

  it('reads a change between two answers to one case, and says what it left out', async () => {
    const dir = await twoRuns()
    const both = compareRuns(dir, side(dir, RUN), side(dir, OTHER))
    expect(both.rows.map((r) => r.key)).toEqual([`release-note ${SAMPLE}`])
    expect(both.left).toEqual([])

    // Asked another prompt: no change is read between the two.
    const other = side(dir, OTHER)
    const asked = {
      ...other,
      cases: { 'release-note': { ...other.cases['release-note'], ask: 'x' } },
    }
    expect(compareRuns(dir, side(dir, RUN), asked)).toEqual({
      rows: [],
      left: [
        `release-note ${SAMPLE}: its agent was asked another prompt or other files in the other run`,
      ],
    })
    // Graded without Jev at one end.
    const noJev = { ...other, report: { ...other.report, model: null } }
    expect(compareRuns(dir, side(dir, RUN), noJev).left).toEqual([
      `release-note ${SAMPLE}: graded with Jev in one run and without it in the other`,
    ])
    // A sample folder since removed is no answer of its run.
    expect(compareRuns(dir, side(dir, RUN), { ...other, samples: [] })).toEqual({
      rows: [],
      left: [],
    })
  })

  it('counts a correction only where both runs hold the reader’s answer on that fact', async () => {
    const dir = await twoRuns()
    const report = side(dir, OTHER).report
    const id = missedId(report)
    correct(dir, { [id]: true }, OTHER)
    // One side only: the change is read from Jev's answers, so the two read alike.
    expect(compareRuns(dir, side(dir, RUN), side(dir, OTHER)).rows[0].deltas.total).toBe(0)
    // Shown on its own, the run counts the correction.
    const own = scoredReport(dir, report, {}, {}, { corrections: correctionsOf(dir, OTHER) })
    const plain = scoredReport(dir, report)
    expect(own.results[0].scores.total).toBeGreaterThan(plain.results[0].scores.total ?? 100)
  })

  it('reads no change between two that counted different facts', async () => {
    const dir = await twoRuns()
    const other = side(dir, OTHER)
    // One rule is not sure at one end: set aside there, counted at the other.
    const unsure = structuredClone(other.report)
    const generic = unsure.results[0].packs.generic as {
      adherence: { rules: { id: string; noul: number }[] }
    }
    generic.adherence.rules[1].noul = 0.5
    const compared = compareRuns(dir, side(dir, RUN), { ...other, report: unsure })
    expect(compared.rows).toEqual([])
    expect(compared.left).toEqual([
      `release-note ${SAMPLE}: the two counted different facts, so no change is read between them`,
    ])
  })
})
