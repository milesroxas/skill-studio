import type { Report, RunMeta } from '@domain/schemas.ts'
import { describe, expect, it } from 'vitest'
import type { RunView, State } from './api.ts'
import {
  againstOf,
  type CaseRead,
  casesNotes,
  checksMoved,
  moveLine,
  outcomeCounts,
  outcomeLine,
  readCase,
  rowVersion,
  sideCount,
  sideNames,
} from './case-checks.ts'
import { type CaseStand, mergedConfig, outputsOf, standingsOf } from './model.ts'

const config = mergedConfig(null)
const MET = 0.9
const MISSED = 0.1
const UNSURE = 0.5

/** One attempt's answers: each check by its words and Jev's probability, `[p, weight]` for a heavier one; words starting "rule " are a rule. */
type Checks = Record<string, number | [number, number]>

/** A report of one sample per attempt of the case `page`, answered on checks only. */
const report = (...attempts: Checks[]): Report =>
  ({
    model: 'jev',
    results: attempts.map((checks, i) => ({
      sample: `page-s${i + 1}`,
      case: 'page',
      primary: { file: 'outputs/a.md', kind: 'markdown' },
      artifacts: [{ file: 'outputs/a.md', kind: 'markdown' }],
      words: 10,
      range: null,
      flags: [],
      packs: {
        generic: {
          adherence: {
            rules: Object.entries(checks)
              .filter(([text]) => text.startsWith('rule '))
              .map(([text, noul]) => ({ id: text, text, section: 'S', noul })),
          },
          rubric: {
            statements: Object.entries(checks)
              .filter(([text]) => !text.startsWith('rule '))
              .map(([text, answer]) => {
                const [noul, weight] = typeof answer === 'number' ? [answer, 1] : answer
                return { id: text, text, weight, units: null, best: null, noul }
              }),
          },
        },
      },
    })),
  }) as unknown as Report

/** A run of `version` ("" for one without the skill), made on day `day`, graded by `graded`. */
function run(name: string, version: string, day: number, graded: Report | null): RunView {
  const samples = (graded?.results ?? [{}]).map((_, i) => ({
    name: `page-s${i + 1}`,
    path: `/runs/${name}/page-s${i + 1}`,
    artifacts: [{ file: 'outputs/a.md', kind: 'markdown' }],
    hasTranscript: false,
    legacy: false,
  }))
  const meta = {
    skillVersion: version,
    writer: { engine: 'claude-code', model: 'opus' },
    configuration: version ? 'with_skill' : 'without_skill',
    createdAt: `2026-11-${String(day).padStart(2, '0')}T10:00:00Z`,
    finishedAt: `2026-11-${String(day).padStart(2, '0')}T10:05:00Z`,
    samples: [],
  } as unknown as RunMeta
  return { name, meta, report: graded, samples, hasSkill: true, cases: {} } as RunView
}

const standingOf = (runs: RunView[], current = 'v2'): CaseStand => {
  const state = {
    runs,
    cases: [{ id: 'page', title: 'Launch page', prompt: '', bench: {} }],
    config,
    reviews: { reviews: {} },
    versions: { versions: [], current: { version: current, changed: false } },
  } as unknown as State
  return standingsOf(state, outputsOf(state), config)[0]
}

const word = () => 'Not graded'

describe('readCase', () => {
  const without = run('r0', '', 1, report({ x: MISSED, y: MET }))
  const v1 = run('r1', 'v1', 2, report({ x: MISSED, y: MISSED }))
  const v2 = run('r2', 'v2', 3, report({ x: MET, y: MET }))

  it('sets the newest answer against the one without the skill, or the one before', () => {
    const stand = standingOf([without, v1, v2])
    const vsWithout = readCase(stand, config, 'without', word)
    expect(vsWithout).toMatchObject({ move: 'better', moved: 1, chance: true, why: null })
    expect(vsWithout.marks).toEqual({ checks: 2, a: 1, b: 2 })
    expect(sideCount(vsWithout, 'a')).toBe('1 of 2 checks')
    expect(sideCount(vsWithout, 'b')).toBe('2 of 2 checks')
    expect(moveLine(vsWithout)).toBe('Better than without the skill')
    const vsBefore = readCase(stand, config, 'before', word)
    // Two checks moved, so it is no longer a move of one that may be chance.
    expect(vsBefore).toMatchObject({ move: 'better', moved: 2, chance: false })
    expect(moveLine(vsBefore)).toBe('Better than v1')
  })

  it('counts checks one each, so a heavy check moving one way and a light one the other says no count', () => {
    const stand = standingOf([
      run('r1', 'v1', 2, report({ x: [MISSED, 3], y: MET })),
      run('r2', 'v2', 3, report({ x: [MET, 3], y: MISSED })),
    ])
    expect(readCase(stand, config, 'before', word)).toMatchObject({ move: 'better', moved: 0 })
  })

  it('says why a case has nothing to compare', () => {
    expect(readCase(standingOf([v2]), config, 'without', word).why).toBe(
      'Not run without the skill',
    )
    expect(readCase(standingOf([v2]), config, 'before', word).why).toBe('First run')
    expect(readCase(standingOf([]), config, 'before', word).why).toBe('Not run yet')
    // A run with the skill and no grading: the table's own word for it.
    expect(readCase(standingOf([run('r2', 'v2', 3, null)]), config, 'before', word).why).toBe(
      'Not graded',
    )
    expect(readCase(standingOf([run('r0', '', 1, null), v2]), config, 'without', word).why).toBe(
      'Not graded without the skill',
    )
    expect(
      readCase(standingOf([run('r0', '', 1, null), v2]), config, 'without', () => 'Writing…').why,
    ).toBe('Writing without the skill…')
    const unsure = standingOf([run('r1', 'v1', 2, report({ x: UNSURE, 'rule a': MET })), v2])
    expect(readCase(unsure, config, 'before', word)).toMatchObject({
      move: 'none',
      why: 'Jev was not sure of its checks',
    })
    const apart = standingOf([run('r1', 'v1', 2, report({ z: MET })), v2])
    expect(readCase(apart, config, 'before', word).why).toBe('No check was marked on both answers')
  })

  it('reads several attempts, and says they are several', () => {
    const stand = standingOf([
      run('r1', 'v1', 2, report({ x: MISSED }, { x: MET })),
      run('r2', 'v2', 3, report({ x: MET }, { x: MET })),
    ])
    const read = readCase(stand, config, 'before', word)
    expect(read).toMatchObject({ move: 'same', several: true, chance: false })
    // A check met on some attempts and missed on others is not met.
    expect(sideCount(read, 'a')).toBe('0 of 1 check')
  })
})

/** A compared reading of the case, as `readCase` would give it, with only what the head reads. */
const reading = (over: Partial<CaseRead>): CaseRead =>
  ({
    stand: {} as CaseStand,
    from: null,
    to: null,
    move: 'same',
    moved: 0,
    marks: { checks: 2, a: 1, b: 1 },
    chance: false,
    several: false,
    why: null,
    ...over,
  }) as CaseRead

describe('the head', () => {
  const reads = [
    reading({ move: 'better', moved: 1, marks: { checks: 2, a: 1, b: 2 }, chance: true }),
    reading({}),
    reading({ move: 'worse', moved: -2, marks: { checks: 3, a: 3, b: 1 } }),
    reading({ move: 'none', moved: null, marks: null, why: 'First run' }),
  ]

  it('counts the cases each way, and the checks they moved by', () => {
    expect(outcomeCounts(reads)).toEqual({ better: 1, same: 1, worse: 1 })
    expect(outcomeLine(reads)).toBe('1 better · 1 same · 1 worse')
    expect(outcomeLine(reads.slice(0, 2))).toBe('1 better · 1 same')
    expect(checksMoved(reads)).toBe(-1)
  })

  it('opens a note that adds every check up, says how a case is read, and when a move may be chance', () => {
    const notes = casesNotes(reads, 'without')
    expect(notes.map((n) => n.title)).toEqual(['How a case is read', 'All checks', 'May be chance'])
    expect(notes[0].text).toBe(
      'Each case’s newest answer is set against its answer without the skill, on its checks alone.',
    )
    expect(notes[1].text).toBe('Across the 3 cases compared, answers met 4 of 7 checks, from 5.')
    expect(casesNotes([reading({ several: true })], 'before')[0].text).toBe(
      'Each case’s newest answer is set against its answer before, on its checks alone. A case with several attempts is the same unless it moved more than its attempts differ.',
    )
  })

  it('adds the score out of 100 where both sides have one', () => {
    const scored = reading({
      from: { score: 60 } as never,
      to: { score: 81 } as never,
    })
    expect(casesNotes([scored], 'before')[2]).toEqual({
      title: 'The score',
      text: 'The score out of 100, rules and checks together, averages 81, from 60.',
    })
  })
})

describe('the columns', () => {
  const v1 = run('r1', 'v1', 2, null)
  const v2 = run('r2', 'v2', 3, null)
  const v2b = run('r3', 'v2', 4, null)
  const at = (t: RunView) => ({ run: t }) as never

  it('names a column by its one version, else by what it holds, and its rows then say theirs', () => {
    const one = [reading({ from: at(v1), to: at(v2) }), reading({ from: at(v1), to: at(v2b) })]
    expect(sideNames(one, 'before')).toEqual({
      from: { name: 'v1', rowsSay: false },
      to: { name: 'v2', rowsSay: false },
    })
    expect(sideNames(one, 'without').from).toEqual({ name: 'Without the skill', rowsSay: false })
    const mixed = [reading({ from: at(v1), to: at(v2) }), reading({ from: at(v2), to: at(v2b) })]
    const names = sideNames(mixed, 'before')
    expect(names).toEqual({
      from: { name: 'The version before', rowsSay: true },
      to: { name: 'v2', rowsSay: false },
    })
    expect(rowVersion(mixed[1].from, names.from)).toBe('v2')
    expect(rowVersion(mixed[1].to, names.to)).toBeNull()
    expect(sideNames([reading({ from: at(v2), to: at(v2b) })], 'before').from.name).toBe(
      'The run before',
    )
    expect(sideNames([], 'before').to).toEqual({ name: 'With the skill', rowsSay: true })
  })

  it('says how a case moved, against what, in words', () => {
    expect(moveLine(reading({ from: at(v1), to: at(v2) }))).toBe('Same as v1')
    expect(moveLine(reading({ move: 'worse', from: at(v2), to: at(v2b) }))).toBe(
      'Worse than the run before',
    )
    expect(moveLine(reading({ move: 'none', marks: null, why: 'First run' }))).toBeNull()
  })
})

describe('againstOf', () => {
  it('reads without the skill unless the address says before', () => {
    expect(againstOf(new URLSearchParams('against=before'))).toBe('before')
    expect(againstOf(new URLSearchParams(''))).toBe('without')
  })
})
