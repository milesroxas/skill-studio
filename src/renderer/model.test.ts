import type { Artifact, Report, RunMeta } from '@domain/schemas.ts'
import type { Move } from '@domain/standing.ts'
import { describe, expect, it } from 'vitest'
import type { RunView, State } from './api.ts'
import type { Output } from './model.ts'
import {
  type AsideLine,
  answerFiles,
  apartLine,
  asideLine,
  attemptsLine,
  casePair,
  caseTitle,
  changeBetween,
  changeLine,
  changeNote,
  comparable,
  cutOf,
  cutOff,
  deleteBlocked,
  deletedName,
  deleteRunDialog,
  deletesLine,
  editedSince,
  extraKinds,
  failedLine,
  failureOf,
  gradedLine,
  kindsLine,
  lastAnswer,
  liftAsideLine,
  liftAttemptsLine,
  liftNotes,
  liftOf,
  listLine,
  mergedConfig,
  modelShort,
  movedBetween,
  noSkillScore,
  outputFacts,
  outputNames,
  outputRulesUnmarked,
  outputsOf,
  outputsToPick,
  previewOf,
  primaryOf,
  readParams,
  regradeOwed,
  ruleRatesOf,
  rulesUnmarked,
  runLabel,
  runTitle,
  scoredFor,
  scoreOf,
  scoreOver,
  setByHand,
  standingsOf,
  standingUnshared,
  toGrade,
  totalOf,
  unscoredLine,
  versionLine,
  versionOutputs,
  versionReading,
  versionScore,
  versionsRun,
  writerName,
} from './model.ts'

const saved = mergedConfig(null)

describe('modelShort', () => {
  const writer = (engine: string, model: string | null) =>
    ({ engine, model, effort: 'high', harness: 'agent' }) as const

  it('names the model alone, for a narrow column', () => {
    expect(modelShort(writer('claude', 'sonnet'))).toBe('Sonnet')
    expect(modelShort(writer('claude', 'claude-opus-5-5'))).toBe('Opus 5.5')
    expect(modelShort(writer('cursor', 'gpt-5'))).toBe('gpt-5')
    expect(modelShort(writer('claude', null))).toBe('Default model')
    expect(writerName(writer('cursor', 'gpt-5'))).toBe('gpt-5, high effort via Cursor')
    expect(modelShort(null)).toBe('Unknown')
  })
})

describe('rulesUnmarked', () => {
  const result = (kind: 'html' | 'markdown', generic: unknown) =>
    ({ primary: { file: 'outputs/a', kind }, blank: false, packs: { generic } }) as never
  it('is true for a page Jev graded with no rule or check marked, and for nothing else', () => {
    expect(rulesUnmarked({ model: 'jev', results: [result('html', null)] })).toBe(true)
    expect(rulesUnmarked({ model: 'jev', results: [result('html', { adherence: null })] })).toBe(
      false,
    )
    expect(rulesUnmarked({ model: 'jev', results: [result('markdown', null)] })).toBe(false)
    // Graded without Jev: the line under the run says so already.
    expect(rulesUnmarked({ model: null, results: [result('html', null)] })).toBe(false)
  })

  it('reads one output on its own, so a case’s page can say it too', () => {
    const run = (model: string | null) => ({ report: { model } }) as never
    expect(outputRulesUnmarked({ run: run('jev'), result: result('html', null) })).toBe(true)
    expect(outputRulesUnmarked({ run: run('jev'), result: result('markdown', null) })).toBe(false)
    expect(outputRulesUnmarked({ run: run(null), result: result('html', null) })).toBe(false)
    expect(outputRulesUnmarked({ run: run('jev'), result: null })).toBe(false)
  })
})

describe('gradedLine', () => {
  it('names the kinds ticked beside rules and checks, which every skill is graded on', () => {
    expect(gradedLine(['generic'])).toBe('Graded on rules and checks')
    expect(gradedLine(['generic', 'design'])).toBe('Graded as Design')
    expect(gradedLine(['generic', 'code', 'workflow'])).toBe('Graded as Code and Workflow')
    expect(extraKinds(['generic', 'writing', 'design'])).toEqual(['writing', 'design'])
  })
})

describe('kindsLine', () => {
  it('says the kinds as a spoken list', () => {
    expect(kindsLine(['generic'])).toBe('Generic')
    expect(kindsLine(['generic', 'writing'])).toBe('Generic and Writing')
    expect(kindsLine(['generic', 'code', 'design'], 'or')).toBe('Generic, Code or Design')
    expect(kindsLine([])).toBe('')
  })
})

describe('listLine', () => {
  it('joins words with no comma before the last', () => {
    expect(listLine(['A good answer', 'checks', 'length'])).toBe('A good answer, checks and length')
    expect(listLine(['A good answer', 'length', 'size'])).toBe('A good answer, length and size')
    expect(listLine(['one'])).toBe('one')
  })
})

describe('setByHand', () => {
  it('names nothing for a file that holds only defaults, or no object at all', () => {
    expect(setByHand({})).toEqual([])
    expect(setByHand(null)).toEqual([])
    expect(setByHand([] as never)).toEqual([])
    expect(setByHand({ packs: ['generic'] })).toEqual([])
    // An earlier version saved every setting a kind has, at its default, in its own key order.
    const writing = mergedConfig({ packs: ['writing'] })
    const reordered = Object.fromEntries(Object.entries(writing).reverse())
    expect(setByHand(reordered)).toEqual([])
  })

  it('names the settings that differ from their defaults', () => {
    expect(setByHand({ packs: ['generic'], yes: 0.6, weights: { adherence: 30 } })).toEqual([
      'yes',
      'weights',
    ])
    const writing = mergedConfig({ packs: ['writing'] })
    const structure = { ...(writing.structure as Record<string, number>), pointerCredit: 0.1 }
    expect(setByHand({ ...writing, structure })).toEqual(['structure'])
  })
})

const html = (file: string): Artifact => ({ file: `outputs/${file}`, kind: 'html' })
const code = (file: string): Artifact => ({ file: `outputs/${file}`, kind: 'code' })
const md = (file: string): Artifact => ({ file: `outputs/${file}`, kind: 'markdown' })

/** A run of `version` with one sample of the case `page`, its files `artifacts`. */
function runOf(
  name: string,
  version: string,
  artifacts: Artifact[],
  report: Report | null = null,
): RunView {
  const meta = {
    skillVersion: version,
    writer: { engine: 'claude-code', model: 'opus' },
    configuration: 'with_skill',
    createdAt: `2026-11-0${version.slice(1)}T10:00:00Z`,
    samples: [],
  } as unknown as RunMeta
  const sample = {
    name: 'page-s1',
    path: `/runs/${name}/page-s1`,
    artifacts,
    hasTranscript: false,
    legacy: false,
  }
  return { name, meta, report, samples: [sample], hasSkill: true, cases: {} }
}

const stateOf = (runs: RunView[], packs: string[], artifact?: 'markdown'): State =>
  ({
    runs,
    cases: [{ id: 'page', title: '', prompt: '', bench: artifact ? { artifact } : {} }],
    config: { ...saved, packs },
    reviews: { reviews: {} },
    versions: { versions: [], current: { version: 'v2', changed: false } },
  }) as unknown as State

describe('outputsOf', () => {
  const files = [md('README.md'), code('app.js'), html('about.html'), html('index.html')]

  it('opens an output not graded on the file grading would judge', () => {
    const [output] = outputsOf(stateOf([runOf('r1', 'v1', files)], ['generic', 'design']))
    expect(primaryOf(output)).toEqual(html('index.html'))
    expect(previewOf(output)).toEqual(html('index.html'))
    const [prose] = outputsOf(stateOf([runOf('r1', 'v1', files)], ['generic']))
    expect(primaryOf(prose)).toEqual(md('README.md'))
    // Prose opens on its text, though a page stands beside it.
    expect(previewOf(prose)).toEqual(md('README.md'))
    const [named] = outputsOf(stateOf([runOf('r1', 'v1', files)], ['design'], 'markdown'))
    expect(primaryOf(named)).toEqual(md('README.md'))
  })

  it('opens a graded output on the file it was graded on', () => {
    const report = {
      results: [{ sample: 'page-s1', case: 'page', primary: code('app.js') }],
    } as unknown as Report
    const [output] = outputsOf(stateOf([runOf('r1', 'v1', files, report)], ['design']))
    expect(primaryOf(output)).toEqual(code('app.js'))
    expect(output.caseId).toBe('page')
  })

  it('says a piece is scored as the file that stands for it', () => {
    const one = outputsOf(stateOf([runOf('r1', 'v1', [md('post.md')])], ['generic']))[0]
    expect(scoredFor(one)).toBeNull()
    const [note] = outputsOf(
      stateOf([runOf('r1', 'v1', [md('notes.md'), md('output.md')])], ['generic']),
    )
    expect(scoredFor(note)).toBe('The score is for output.md.')
    const [page] = outputsOf(stateOf([runOf('r1', 'v1', files)], ['generic', 'design']))
    expect(scoredFor(page)).toBe('The score is for index.html.')
  })

  it('says code written as several files is scored on all of them', () => {
    const repo = [code('package.json'), code('src/Badge.tsx'), code('src/Card.tsx')]
    const [all] = outputsOf(stateOf([runOf('r1', 'v1', repo)], ['generic', 'code']))
    expect(primaryOf(all)).toEqual(code('package.json'))
    expect(scoredFor(all)).toBe('The score is for all 3 files it wrote.')
    const picture: Artifact = { file: 'outputs/shot.png', kind: 'image' }
    const [some] = outputsOf(stateOf([runOf('r1', 'v1', [...repo, picture])], ['generic', 'code']))
    expect(scoredFor(some)).toBe('The score is for the 3 files of text it wrote.')
    const [alone] = outputsOf(
      stateOf([runOf('r1', 'v1', [code('app.js'), md('README.md')])], ['generic', 'code']),
    )
    expect(scoredFor(alone)).toBe('The score is for app.js.')
  })

  it('lists outputs by version, and pairs the version before with the latest', () => {
    const outputs = outputsOf(
      stateOf(
        [runOf('r2', 'v2', [html('index.html')]), runOf('r1', 'v1', [html('index.html')])],
        ['design'],
      ),
    )
    expect(outputs.map((o) => o.run.name)).toEqual(['r1', 'r2'])
    const pair = casePair(outputs, 'page')
    expect(pair.a?.run.name).toBe('r1')
    expect(pair.b?.run.name).toBe('r2')
    expect(casePair(outputs, 'none')).toEqual({ a: null, b: null })
  })
})

describe('outputNames', () => {
  const page = [html('index.html')]
  const names = (runs: RunView[]) => {
    const outputs = outputsOf(stateOf(runs, ['design']))
    return outputs.map((o) => outputNames(outputs).get(o.key))
  }

  it('names an output by its version where that tells it apart', () => {
    expect(names([runOf('r1', 'v1', page), runOf('r2', 'v2', page)])).toEqual(['v1', 'v2'])
  })

  it('adds the writer, then the time, only to outputs that would read the same', () => {
    const other = runOf('r2', 'v1', page)
    const sonnet = {
      ...other,
      meta: { ...other.meta, writer: { engine: 'claude-code', model: 'sonnet' } },
    }
    const [first, second, third] = names([
      runOf('r1', 'v1', page),
      sonnet as RunView,
      runOf('r3', 'v2', page),
    ])
    expect(first).toMatch(/^v1 · opus$/)
    expect(second).toMatch(/^v1 · sonnet$/)
    expect(third).toBe('v2')

    const later = { ...other, meta: { ...other.meta, createdAt: '2026-11-05T10:00:00Z' } }
    const [a, b] = names([runOf('r1', 'v1', page), later as RunView])
    expect(a).not.toBe(b)
    expect(a).toMatch(/Nov 1/)
    expect(b).toMatch(/Nov 5/)
  })

  it('names the version by its number alone when asked for short names', () => {
    const named = (run: RunView) => ({
      ...run,
      meta: { ...run.meta, skillName: 'Claims need a source' },
    })
    const runs = [named(runOf('r1', 'v1', page)), named(runOf('r2', 'v2', page))] as RunView[]
    const outputs = outputsOf(stateOf(runs, ['design']))
    expect(outputs.map((o) => outputNames(outputs).get(o.key))).toEqual([
      'v1 · Claims need a source',
      'v2 · Claims need a source',
    ])
    expect(outputs.map((o) => outputNames(outputs, { short: true }).get(o.key))).toEqual([
      'v1',
      'v2',
    ])
  })
})

describe('runTitle', () => {
  const page = [html('index.html')]
  const bare = (run: RunView): RunView =>
    ({ ...run, meta: { ...run.meta, configuration: 'without_skill' } }) as RunView

  it('names a run without the skill by that alone, never by the version it was stamped on', () => {
    const run = bare(runOf('r1', 'v1', page))
    expect(runTitle(run)).toBe('Without skill')
    expect(runTitle(run, { short: true })).toBe('Without skill')
    expect(runLabel(run)).toBe('Without skill · opus')
    expect(runLabel(runOf('r2', 'v2', page))).toBe('v2 · opus')
  })

  it('tells a run without the skill from the version it shares a stamp with', () => {
    const outputs = outputsOf(
      stateOf([bare(runOf('r1', 'v1', page)), runOf('r2', 'v1', page)], ['design']),
    )
    expect(outputs.map((o) => outputNames(outputs).get(o.key))).toEqual(['Without skill', 'v1'])
    expect(apartLine(outputs[0], outputs[1])).toBeNull()
  })
})

describe('liftOf and versionScore', () => {
  it('have no lift and no score before any output is graded, a run with no record among them', () => {
    const bare: RunView = { ...runOf('r0', 'v1', [html('index.html')]), name: 'r0', meta: null }
    const runs = [
      runOf('r1', 'v1', [html('index.html')]),
      runOf('r2', 'v2', [html('index.html')]),
      bare,
    ]
    const state = stateOf(runs, ['design'])
    const outputs = outputsOf(state)
    expect(liftOf(standingsOf(state, outputs, saved))).toBeNull()
    expect(versionScore(outputs, saved, 'v2')).toBeNull()
    expect(noSkillScore(outputs, saved)).toBeNull()
  })
})

/** One sample's result: its one rule followed (100) or broken (0), with the flags its grading left. */
const resultOf = (sample: string, total: 0 | 100, flags: string[] = []) => ({
  sample,
  case: sample.replace(/-s\d+$/, ''),
  primary: md('a.md'),
  artifacts: [md('a.md')],
  words: 10,
  range: null,
  flags,
  packs: {
    generic: {
      adherence: { rules: [{ id: 'r1', text: 'Be brief.', section: 'S', noul: total / 100 }] },
      rubric: null,
    },
  },
})

/** A report that scores the one sample of a `runOf` run. */
const graded = (total: 0 | 100, flags: string[] = []): Report =>
  ({ results: [resultOf('page-s1', total, flags)] }) as unknown as Report

/** `run` as another writer or configuration made it. */
const madeBy = (run: RunView, over: Record<string, unknown>): RunView =>
  ({ ...run, meta: { ...run.meta, ...over } }) as RunView

describe('a change in score', () => {
  const files = [md('a.md')]
  const rule = 'rule:Be brief.'
  /** v1 and v2 each broke the one rule, as Jev read it; `answers` are the reader's, by run. */
  const caseWith = (answers: Record<string, boolean>) => {
    const state = stateOf(
      [runOf('r1', 'v1', files, graded(0)), runOf('r2', 'v2', files, graded(0))],
      ['generic'],
    )
    for (const [run, met] of Object.entries(answers))
      state.reviews.reviews[`${run}/page-s1`] = { corrections: { [rule]: met } } as never
    const outputs = outputsOf(state)
    return { state, outputs, standing: standingsOf(state, outputs, saved)[0] }
  }

  it('is read from Jev’s answers when the reader answered on the latest run alone', () => {
    const { outputs, standing } = caseWith({ r2: true })
    // The score shown counts the reader's answer: v2 stands on 100.
    expect(standing.latest?.score).toBe(100)
    expect(standing.previous?.score).toBe(0)
    // The change does not: the case did not rise by the reader's attention to v2.
    expect(standing.change).toBe(0)
    expect(standingUnshared(standing)).toBe(true)
    expect(liftOf([standing])).toMatchObject({ first: 0, latest: 0, unshared: true })
    const [a, b] = outputs
    expect(totalOf(b, saved)).toBe(100)
    expect(changeBetween(a, b, saved)).toBe(0)
  })

  it('counts the reader’s answer at both ends when both runs hold one on the fact', () => {
    const { standing } = caseWith({ r1: false, r2: true })
    expect(standing.change).toBe(100)
    expect(standingUnshared(standing)).toBe(false)
    expect(liftOf([standing])).toMatchObject({ first: 0, latest: 100, unshared: false })
  })
})

describe('a change over the facts both runs counted', () => {
  const files = [md('a.md')]
  /** A report of one sample answered on rules, each by Jev's probability. */
  const answered = (...noul: number[]): Report =>
    ({
      results: [
        {
          ...resultOf('page-s1', 100),
          packs: {
            generic: {
              adherence: {
                rules: [
                  { id: 'r1', text: 'Be brief.', section: 'S', noul: noul[0] },
                  { id: 'r2', text: 'Use plain words.', section: 'S', noul: noul[1] },
                  ...(noul.length > 2
                    ? [{ id: 'r3', text: 'Name the file.', section: 'S', noul: noul[2] }]
                    : []),
                ],
              },
              rubric: null,
            },
          },
        },
      ],
    }) as unknown as Report
  const caseOf = (before: Report, after: Report) => {
    const state = stateOf(
      [runOf('r1', 'v1', files, before), runOf('r2', 'v2', files, after)],
      ['generic'],
    )
    const outputs = outputsOf(state)
    return { state, outputs, standing: standingsOf(state, outputs, saved)[0] }
  }

  it('leaves out at both runs a rule one run counted and the other was not sure of', () => {
    // v1 missed both rules: 0. v2 met one and Jev was not sure of the other: 100 of what counted.
    const { outputs, standing } = caseOf(answered(0.1, 0.1), answered(0.9, 0.5))
    expect([standing.previous?.score, standing.latest?.score]).toEqual([0, 100])
    expect(standing).toMatchObject({ change: 100, uncounted: false })
    expect(standing.moved).toMatchObject({ from: 0, to: 100, left: ['rule'] })
    expect(changeBetween(outputs[0], outputs[1], saved)).toBe(100)
    expect(liftOf([standing])).toMatchObject({ first: 0, latest: 100, cases: 1 })
  })

  it('reads a change that is not the difference of the scores shown, and says why', () => {
    // v1 met one rule and missed one: 50. v2 met one, Jev was not sure of the one v1 missed: 100.
    const { outputs, standing } = caseOf(answered(0.9, 0.1), answered(0.9, 0.5))
    expect([standing.previous?.score, standing.latest?.score]).toEqual([50, 100])
    expect(standing.change).toBe(0)
    expect(standingUnshared(standing)).toBe(true)
    expect(changeLine('runs', standing.moved as Move)).toBe(
      'The change counts only what was marked on both runs, so 1 rule is left out of it.',
    )
    expect(liftOf([standing])).toMatchObject({ first: 100, latest: 100, unshared: true })
    expect(movedBetween(outputs[0], outputs[1], saved)).toMatchObject({ from: 100, to: 100 })
  })

  it('counts a rule both runs counted, and one the reader answered on both', () => {
    const { state } = caseOf(answered(0.9, 0.9, 0.1), answered(0.9, 0.5, 0.9))
    for (const run of ['r1', 'r2'])
      state.reviews.reviews[`${run}/page-s1`] = {
        corrections: { 'rule:Use plain words.': run === 'r2' },
      } as never
    const [standing] = standingsOf(state, outputsOf(state), saved)
    // v1: 1 of 3 met. v2: 3 of 3, every rule counted at both.
    expect(standing.moved).toMatchObject({ left: [], oneSided: false })
    expect(standing.change).toBe(67)
  })

  it('has no change when nothing is left to count at one run', () => {
    // The reader marked both rules on v1 alone, where Jev was not sure of either.
    const { state } = caseOf(answered(0.5, 0.5), answered(0.9, 0.9))
    state.reviews.reviews['r1/page-s1'] = {
      corrections: { 'rule:Be brief.': true, 'rule:Use plain words.': false },
    } as never
    const [standing] = standingsOf(state, outputsOf(state), saved)
    expect(standing.previous?.score).toBe(50)
    expect(standing).toMatchObject({ change: null, uncounted: true })
    expect(liftOf([standing])).toBeNull()
  })

  it('says why in one line when a change also leaves out an answer on one run', () => {
    expect(changeLine('runs', { left: ['rule', 'check', 'check'], oneSided: true })).toBe(
      'The change counts only what was marked on both runs, and your answers only where you gave one on both, so 3 rules and checks are left out of it.',
    )
    expect(changeLine('outputs', { left: [], oneSided: true })).toBe(
      'The change counts your answers only where you gave one on both outputs.',
    )
    expect(changeLine('runs', { left: [] })).toBeNull()
    expect(changeNote({ from: 85.6, to: 90.2, left: ['rule'] })).toBe(
      'The change counts only what was marked on both outputs, so 1 rule is left out of it. Counted that way, A scores 86 and B 90.',
    )
    expect(changeNote({ from: 80, to: 80, left: [] })).toBeNull()
    expect(changeLine('runs', { left: ['rule', 'other'] })).toBe(
      'The change counts only what was marked on both runs, so 2 of Jev’s answers are left out of it.',
    )
  })

  it('says how much of a score was counted where Jev was not sure of some of it', () => {
    const { state, outputs } = caseOf(answered(0.1, 0.5), answered(0.9, 0.5))
    expect(asideLine([outputs[1]], saved)).toEqual({
      leads: 'unsure',
      text: 'Jev was not sure of 1 of the 2 rules, left out of the score until you mark it.',
    })
    expect(asideLine(outputs, saved)?.text).toBe(
      'Jev was not sure of 2 of the 4 rules over 2 outputs, left out of the score until you mark them.',
    )
    expect(liftAsideLine(standingsOf(state, outputs, saved), saved)).toEqual({
      leads: 'unsure',
      text: 'Jev was not sure of 1 of the 2 rules on their latest runs, left out of the score until you mark it.',
    })
    const sure = caseOf(answered(0.1, 0.9), answered(0.9, 0.9))
    expect(asideLine(sure.outputs, saved)).toBeNull()
  })

  /** `answered`, of an output asked in two parts of which Jev read one: each rule answered 0.5 one of the whole (`span`) the part cannot settle, the rest of its start. */
  const halfRead = (...noul: number[]): Report => {
    const report = answered(...noul)
    const raw = (report.results[0] as unknown as { packs: { generic: Record<string, unknown> } })
      .packs.generic
    raw.parts = { read: 1, of: 2 }
    for (const rule of (raw.adherence as { rules: Array<Record<string, unknown>> }).rules)
      Object.assign(rule, rule.noul === 0.5 ? { noul: 0.9, span: 'whole' } : { span: 'start' })
    return report
  }

  it('says apart what Jev could not read the whole output for, and leads with what it was not sure of', () => {
    const unread = caseOf(answered(0.9, 0.9), halfRead(0.9, 0.5)).outputs
    expect(asideLine([unread[1]], saved)).toEqual({
      leads: 'unread',
      text: 'Jev could not read the whole output for 1 of the 2 rules, left out of the score until you mark it.',
    })
    const both = caseOf(answered(0.9, 0.9), halfRead(0.5, 0.5, 0.4)).outputs
    expect(asideLine([both[1]], saved)).toEqual({
      leads: 'unsure',
      text: 'Jev was not sure of 1 of the 3 rules and could not read the whole output for 2 more, left out of the score until you mark them.',
    })
  })
  /** `answered`, with its first rule set aside by the app's own count and its second written so nobody can mark it. */
  const sorted = (...noul: number[]): Report => {
    const report = answered(...noul)
    const raw = (report.results[0] as unknown as { packs: { generic: Record<string, unknown> } })
      .packs.generic
    const rules = (raw.adherence as { rules: Array<Record<string, unknown>> }).rules
    rules[0].code = { answer: 'none', why: 'convention', saw: [], tests: [] }
    rules[1] = {
      id: rules[1].id,
      text: rules[1].text,
      section: rules[1].section,
      unmarkable: { why: 'vague', with: null, fix: null },
    }
    return report
  }

  it('counts what the app could not settle as not sure, and leaves out a rule nobody can mark', () => {
    const { outputs } = caseOf(answered(0.9, 0.9), sorted(0.9, 0.9, 0.5))
    // Jev was sure of the first rule; the app's count could not settle it. The second is in no count at all.
    expect(asideLine([outputs[1]], saved)).toEqual({
      leads: 'unsure',
      text: 'Not sure on 2 of the 2 rules, left out of the score until you mark them.',
    })
  })
})

describe('how the files stand against the versions', () => {
  const kept = (version: string, name = '') => ({
    version,
    name,
    hash: version,
    note: '',
    date: undefined,
    saved: false,
  })
  const v0 = kept('v0', 'First draft')
  const v1 = kept('v1', 'Lead with the change')

  it('gives a version its number, its name and its score while the files are that version', () => {
    const versions = { versions: [v0, v1], current: { ...v1, changed: false } }
    expect(editedSince(versions)).toBeNull()
    expect(versionLine(versions, 97.6)).toBe('v1 · Lead with the change · mean 98')
    expect(versionLine({ versions: [v0], current: { ...kept('v0'), changed: false } }, null)).toBe(
      'v0',
    )
  })

  it('names the version that exists once the files were saved since, never the next number', () => {
    // The next run would keep them as v2, and until one has there is no v2 to name.
    const versions = { versions: [v0, v1], current: { ...kept('v2'), changed: true } }
    expect(editedSince(versions)).toBe('Edited since v1')
    expect(versionLine(versions, 98)).toBe('Edited since v1')
  })

  it('says a skill no run has kept is not run yet', () => {
    const versions = { versions: [], current: { ...kept('v0'), changed: true } }
    expect(editedSince(versions)).toBeNull()
    expect(versionLine(versions, null)).toBe('Not run yet')
  })
})

describe('ruleRatesOf', () => {
  const files = [md('a.md')]
  it('counts the outputs written with the skill, with the reader’s answers, as Results scores them', () => {
    const runs = [
      runOf('r1', 'v1', files, graded(0)),
      runOf('r2', 'v2', files, graded(0)),
      runOf('r3', 'v2', files, graded(100)),
      madeBy(runOf('r4', 'v2', files, graded(0)), { configuration: 'without_skill' }),
    ]
    const state = stateOf(runs, ['generic'])
    state.reviews.reviews['r1/page-s1'] = { corrections: { 'rule:Be brief.': true } } as never
    // v2 is the newest version that ran the rule: what v1's output did is not counted. The answer
    // without the skill counts apart, beside it.
    expect(ruleRatesOf(outputsOf(state), saved).get('Be brief.')).toEqual({
      followed: 1,
      broken: 1,
      without: { followed: 0, broken: 1 },
    })
    expect(ruleRatesOf(outputsOf(stateOf(runs.slice(0, 1), ['generic'])), saved).size).toBe(1)
  })
})

describe('liftNotes', () => {
  const plain = {
    first: 70,
    latest: 93,
    floor: null,
    floorCases: 0,
    attempts: { first: [1, 1], latest: [1, 1] },
    gap: null,
    cases: 2,
    uncounted: 0,
    unshared: false,
    left: [],
    oneSided: false,
    rises: true,
    mixed: false,
    floorApart: false,
  } as unknown as Parameters<typeof liftNotes>[0]

  it('always says which cases the lift is over, and nothing that is not so', () => {
    expect(liftNotes(plain, null)).toEqual([
      {
        title: 'Which cases',
        text: 'The 2 cases that ran more than once, each from its first run to its latest.',
      },
    ])
    expect(liftNotes({ ...plain, cases: 1 }, null)[0].text).toBe(
      'The 1 case that ran more than once, from its first run to its latest.',
    )
  })

  it('says each thing that sets the lift apart under a heading of its own, in one order', () => {
    const notes = liftNotes(
      {
        ...plain,
        mixed: true,
        uncounted: 1,
        floor: 54.4,
        floorCases: 1,
        floorApart: true,
        unshared: true,
        left: ['rule', 'check'],
        attempts: { first: [1, 1], latest: [3, 3] },
        gap: 26,
      } as Parameters<typeof liftNotes>[0],
      {
        leads: 'unsure',
        text: 'Jev was not sure of 8 of the 17 rules on their latest runs, left out of the score until you mark them.',
      },
    )
    expect(notes.map((note) => note.title)).toEqual([
      'Which cases',
      'More than one model',
      'Cases left out',
      'Without the skill',
      'What the change counts',
      'Attempts',
      'Not sure',
    ])
    const text = (title: string) => notes.find((note) => note.title === title)?.text
    expect(text('Cases left out')).toBe(
      '1 more case is left out: nothing was marked on both of its runs.',
    )
    // The score without the skill is said here in words, whether or not the ribbon draws its line.
    expect(text('Without the skill')).toBe(
      'Without the skill they scored 54, over 1 of them, graded on another version’s rules.',
    )
    expect(text('What the change counts')).toBe(
      'The change counts only what was marked on both runs, so 2 rules and checks are left out of it.',
    )
    expect(text('Attempts')).toBe(
      '1 attempt a case on the first runs, 3 attempts on the latest. Attempts at one case scored up to 26 points apart.',
    )
  })

  it('titles the note of what Jev left to the reader by what the line leads with', () => {
    const title = (aside: AsideLine) => liftNotes(plain, aside).at(-1)
    const unsure = { leads: 'unsure', text: 'Jev was not sure of the one rule.' } as const
    const unread = { leads: 'unread', text: 'Jev could not read the whole output.' } as const
    expect(title(unsure)).toEqual({ title: 'Not sure', text: unsure.text })
    expect(title(unread)).toEqual({ title: 'Not read', text: unread.text })
    // Whatever the words, the title follows what was counted: the two cannot disagree.
    expect(title({ ...unread, text: unsure.text })?.title).toBe('Not read')
    expect(title({ ...unsure, text: unread.text })?.title).toBe('Not sure')
  })

  it('says the score without the skill plainly when it was graded on the same rules', () => {
    const notes = liftNotes({ ...plain, floor: 60, floorCases: 2 }, null)
    expect(notes.find((note) => note.title === 'Without the skill')?.text).toBe(
      'Without the skill they scored 60.',
    )
  })
})

describe('attempts in words', () => {
  const lift = (first: [number, number], latest: [number, number], gap: number | null) =>
    ({ attempts: { first, latest }, gap }) as Parameters<typeof liftAttemptsLine>[0]

  it('says how many attempts the lift is over, and how far one case’s were apart', () => {
    expect(liftAttemptsLine(lift([1, 1], [1, 1], null))).toBe(
      '1 attempt a case on the first runs and the latest.',
    )
    expect(liftAttemptsLine(lift([1, 1], [3, 3], 26))).toBe(
      '1 attempt a case on the first runs, 3 attempts on the latest. Attempts at one case scored up to 26 points apart.',
    )
    expect(liftAttemptsLine(lift([1, 2], [2, 2], 0))).toBe(
      '1 to 2 attempts a case on the first runs, 2 attempts on the latest. Each case’s attempts scored the same.',
    )
  })

  it('says it of a case only when one of its two scores is over several attempts', () => {
    const t = (score: number, totals: number[]) =>
      ({ score, totals }) as unknown as NonNullable<Parameters<typeof attemptsLine>[0]['latest']>
    expect(attemptsLine({ latest: t(74, [62, 72, 88]), previous: t(60, [60]) })).toBe(
      'Its score is the mean of 3 attempts, from 62 to 88. Its run before had one.',
    )
    expect(attemptsLine({ latest: t(70, [70]), previous: t(65, [60, 70]) })).toBe(
      'Its score is from one attempt. Its run before had 2, from 60 to 70.',
    )
    expect(attemptsLine({ latest: t(80, [80, 80]), previous: null })).toBe(
      'Its score is the mean of 2 attempts, which all scored 80.',
    )
    expect(attemptsLine({ latest: t(70, [70]), previous: t(60, [60]) })).toBeNull()
  })
})

describe('a version’s outputs', () => {
  const sonnet = { engine: 'claude-code', model: 'sonnet' }
  const files = [md('a.md')]

  it('count a run on the copy kept of an earlier version as that version’s, as a case’s standing does', () => {
    const runs = [
      madeBy(runOf('r1', 'v1', files, graded(100)), { writer: sonnet }),
      runOf('r2', 'v2', files, graded(100)),
      // Opus never ran v1 as it stood: it ran the copy kept of it, after v2.
      madeBy(runOf('r3', 'v1', files, graded(0)), {
        configuration: 'old_skill',
        createdAt: '2026-11-03T10:00:00Z',
      }),
    ]
    const state = stateOf(runs, ['generic'])
    const outputs = outputsOf(state)
    // The case started on v1, whenever those runs were made, and stands on v2.
    const [standing] = standingsOf(state, outputs, saved)
    expect(standing.tries.map((t) => t.run.name)).toEqual(['r1', 'r3', 'r2'])
    expect(liftOf([standing])).toMatchObject({ first: 100, latest: 100, cases: 1, rises: false })
    // The version list reads the writer that ran both versions: Opus on v1, not Sonnet's 100.
    expect(versionScore(outputs, saved, 'v1')).toBe(0)
    expect(versionScore(outputs, saved, 'v2')).toBe(100)
    expect(
      versionOutputs(outputs, 'v1')
        .map((o) => o.run.name)
        .sort(),
    ).toEqual(['r1', 'r3'])
  })

  it('read a version the writer of the others never ran by its own writer, and name it', () => {
    const outputs = outputsOf(
      stateOf(
        [
          // Only Sonnet ran v1; Opus ran v2 and v3, so every other score is read by Opus.
          madeBy(runOf('r1', 'v1', files, graded(100)), { writer: sonnet }),
          runOf('r2', 'v2', files, graded(0)),
          runOf('r3', 'v3', files, graded(100)),
          // Sonnet on v3 as well, not counted in v3's score.
          madeBy(runOf('r4', 'v3', files, graded(0)), {
            writer: sonnet,
            createdAt: '2026-11-02T10:00:00Z',
          }),
        ],
        ['generic'],
      ),
    )
    // One writer wrote all of v1: its score stands, and the line says whose it is.
    expect(versionReading(outputs, saved, 'v1')).toEqual({ score: 100, why: 'with sonnet' })
    expect(versionReading(outputs, saved, 'v2')).toEqual({ score: 0, why: null })
    expect(versionScore(outputs, saved, 'v3')).toBe(100)
    expect(versionReading(outputs, saved, 'v4')).toEqual({ score: null, why: 'not run yet' })
  })

  it('give a version only other writers ran, more than one, no score', () => {
    const haiku = { ...sonnet, model: 'haiku' }
    const outputs = outputsOf(
      stateOf(
        [
          madeBy(runOf('r1', 'v1', files, graded(100)), { writer: sonnet }),
          madeBy(runOf('r5', 'v1', files, graded(0)), { writer: haiku }),
          runOf('r2', 'v2', files, graded(0)),
          runOf('r3', 'v3', files, graded(100)),
        ],
        ['generic'],
      ),
    )
    // A mean of two writers is no writer's, so it is not set beside the others.
    expect(versionReading(outputs, saved, 'v1')).toEqual({
      score: null,
      why: 'not run with opus',
    })
    expect(versionScore(outputs, saved, 'v1')).toBeNull()
  })

  it('count every output of a version before any writer ran two', () => {
    const outputs = outputsOf(
      stateOf(
        [
          madeBy(runOf('r1', 'v1', files, graded(100)), { writer: sonnet }),
          runOf('r2', 'v1', files, graded(0)),
        ],
        ['generic'],
      ),
    )
    expect(versionScore(outputs, saved, 'v1')).toBe(50)
  })

  it('name a version run only on its kept copy, and never one run without the skill', () => {
    const outputs = outputsOf(
      stateOf(
        [
          madeBy(runOf('r1', 'v1', files, graded(0)), { configuration: 'old_skill' }),
          runOf('r2', 'v2', files, graded(100)),
          madeBy(runOf('r3', 'v3', files, graded(100)), { configuration: 'without_skill' }),
        ],
        ['generic'],
      ),
    )
    expect(versionsRun(outputs)).toEqual(['v1', 'v2'])
    expect(versionScore(outputs, saved, 'v1')).toBe(0)
    expect(versionOutputs(outputs, 'v3')).toEqual([])
    expect(noSkillScore(outputs, saved)).toBe(100)
  })
})

describe('standingsOf', () => {
  const files = [md('a.md')]
  /** The state with the skill's files as `version` holds them, and its cases by id. */
  const on = (state: State, version: string, cases: string[] = ['page']): State =>
    ({
      ...state,
      cases: cases.map((id) => ({ id, title: '', prompt: '', bench: {} })),
      versions: { versions: [], current: { version, changed: false } },
    }) as unknown as State

  it('reads each case against its own runs, on the version a run would test now', () => {
    const runs = [
      runOf('r1', 'v1', files, graded(0)),
      runOf('r2', 'v2', files, graded(100)),
      madeBy(runOf('r0', 'v1', files, graded(0)), {
        configuration: 'without_skill',
        createdAt: '2026-11-01T09:00:00Z',
      }),
    ]
    const state = on(stateOf(runs, ['generic']), 'v2', ['page', 'never'])
    const [page, never] = standingsOf(state, outputsOf(state), saved)
    expect(page).toMatchObject({ id: 'page', known: true, current: true, change: 100 })
    expect(page.latest).toMatchObject({ score: 100, scored: 1, cut: null })
    expect(page.latest?.run.name).toBe('r2')
    expect(page.floor?.run.name).toBe('r0')
    // Every run that answered it, the newest first, the one without the skill among them.
    expect(page.history.map((t) => t.run.name)).toEqual(['r2', 'r1', 'r0'])
    // A case never run is listed all the same: it is the first to check.
    expect(never).toMatchObject({ id: 'never', known: true, current: false, latest: null })
    expect(never.history).toEqual([])
  })

  it('is behind once the skill has moved on from the version a case last ran', () => {
    const runs = [runOf('r1', 'v1', files, graded(100))]
    const state = on(stateOf(runs, ['generic']), 'v2')
    const [page] = standingsOf(state, outputsOf(state), saved)
    expect(page).toMatchObject({ current: false })
    expect(page.latest?.score).toBe(100)
  })

  it('lists a case deleted since it ran last, as one that cannot be run again', () => {
    const state = on(stateOf([runOf('r1', 'v1', files, graded(100))], ['generic']), 'v1', ['other'])
    expect(standingsOf(state, outputsOf(state), saved).map((s) => [s.id, s.known])).toEqual([
      ['other', true],
      ['page', false],
    ])
  })

  it('has no score from a run whose output is not graded', () => {
    const state = on(stateOf([runOf('r1', 'v1', files)], ['generic']), 'v1')
    const [page] = standingsOf(state, outputsOf(state), saved)
    expect(page).toMatchObject({ latest: null, current: false })
    expect(page.tries[0]).toMatchObject({ score: null, scored: 0 })
  })
})

describe('readParams', () => {
  it('reads an output beside the one its case opens with, unless it is that one', () => {
    const runs = [runOf('r1', 'v1', [md('a.md')]), runOf('r2', 'v2', [md('a.md')])]
    const outputs = outputsOf(stateOf(runs, ['generic']))
    const [first, second] = outputs
    expect(readParams(outputs, 'page', second)).toEqual({
      case: 'page',
      a: first.key,
      b: second.key,
    })
    expect(readParams(outputs, 'page', first)).toEqual({
      case: 'page',
      a: second.key,
      b: first.key,
    })
  })
})

describe('scoreOver', () => {
  it('counts each case once, however many times it was answered', () => {
    const one = runOf('r1', 'v1', [md('a.md')])
    const names = ['page-s1', 'page-s2', 'page-s3', 'note-s1']
    const run = {
      ...one,
      samples: names.map((name) => ({ ...one.samples[0], name })),
      report: {
        results: names.map((name) => resultOf(name, name.startsWith('page') ? 100 : 0)),
      } as unknown as Report,
    }
    const outputs = outputsOf(stateOf([run], ['generic']))
    // Three outputs at 100 and one at 0 are two cases, at 100 and at 0.
    expect(scoreOver(outputs, saved)).toBe(50)
    expect(scoreOver([], saved)).toBeNull()
  })
})

/** `run` with the case `page` as the run took it. */
const taking = (
  run: RunView,
  taken: { ask?: string; yardstick?: string; earlier?: { title: string } | null },
): RunView => ({
  ...run,
  cases: {
    page: {
      ask: taken.ask ?? 'now',
      yardstick: taken.yardstick ?? 'held',
      earlier: taken.earlier
        ? ({ id: 'page', prompt: '', bench: {}, ...taken.earlier } as never)
        : null,
    },
  },
})

/** `report` as Jev graded it, each output held to `yardstick`. */
const heldTo = (report: Report, yardstick: string, model: string | null = 'jev'): Report =>
  ({ model, results: report.results.map((r) => ({ ...r, yardstick })) }) as unknown as Report

describe('an output whose case changed after it was graded', () => {
  const files = [md('a.md')]

  it('has no total until its run is graded again, and keeps its verdicts', () => {
    const run = taking(runOf('r1', 'v1', files, heldTo(graded(100), 'old')), { yardstick: 'new' })
    const [output] = outputsOf(stateOf([run], ['generic']))
    expect(output.behind).toBe('Graded before its case changed')
    expect(totalOf(output, saved)).toBeNull()
    expect(scoreOf(output, saved)?.scores.adherence).toBe(100)
    expect(regradeOwed(scoreOf(output, saved))).toBe(true)
    expect(scoreOver([output], saved)).toBeNull()
  })

  it('stands while the case is as it was graded, and for a report that kept no record', () => {
    const same = taking(runOf('r1', 'v1', files, heldTo(graded(100), 'held')), {})
    const older = taking(runOf('r2', 'v1', files, graded(100)), {})
    const outputs = outputsOf(stateOf([same, older], ['generic']))
    expect(outputs.map((o) => totalOf(o, saved))).toEqual([100, 100])
  })

  it('is behind when graded without Jev and a key is set, and stands when none is', () => {
    const run = taking(runOf('r1', 'v1', files, heldTo(graded(100), 'held', null)), {})
    const state = stateOf([run], ['generic'])
    expect(totalOf(outputsOf(state)[0], saved)).toBe(100)
    const [keyed] = outputsOf({ ...state, jevKey: true })
    expect(keyed.behind).toBe('Graded without Jev')
    expect(totalOf(keyed, saved)).toBeNull()
  })
})

describe('an output graded by something a grading now would not use', () => {
  const files = [md('a.md')]
  const by = (what: object): Report =>
    ({
      model: 'jev-1',
      results: graded(100).results.map((r) => ({ ...r, yardstick: 'held', graded: what })),
    }) as unknown as Report
  const here = (state: State): State => ({
    ...state,
    grading: { model: 'jev-1', packs: { generic: 8, design: 4 }, drawn: true },
  })

  it('has no total once its questions, its model or the drawing differ', () => {
    const same = { model: 'jev-1', packs: { generic: 8 }, drawn: true }
    const cases: Array<[object, string | null]> = [
      [same, null],
      [{ ...same, packs: { generic: 7 } }, 'Graded by an older version of Skill Studio'],
      [{ ...same, model: 'jev-0' }, 'Graded by another version of Jev'],
      [{ ...same, drawn: false }, 'Graded without looking at the page'],
      // A pack the skill is not graded as now takes nothing away.
      [{ ...same, packs: { generic: 8, design: 1 } }, null],
    ]
    for (const [what, behind] of cases) {
      const run = taking(runOf('r1', 'v1', files, by(what)), {})
      const [output] = outputsOf(here(stateOf([run], ['generic'])))
      expect(output.behind).toBe(behind)
      expect(totalOf(output, saved)).toBe(behind ? null : 100)
    }
  })

  it('stands when its report kept nothing of what graded it', () => {
    const run = taking(runOf('r1', 'v1', files, heldTo(graded(100), 'held')), {})
    const [output] = outputsOf(here(stateOf([run], ['generic'])))
    expect(output.behind).toBeNull()
    expect(totalOf(output, saved)).toBe(100)
  })
})

/** The versions of a state whose skill stands on `version`. */
const at = (version: string): State['versions'] =>
  ({ versions: [], current: { version, changed: false } }) as unknown as State['versions']

describe('outputs that answered different requests', () => {
  const files = [md('a.md')]
  const before = { title: 'Page' }
  const old = taking(runOf('r1', 'v1', files, heldTo(graded(0), 'held')), {
    ask: 'then',
    earlier: before,
  })
  const next = taking(runOf('r2', 'v2', files, heldTo(graded(100), 'held')), {})
  const last = taking(runOf('r3', 'v3', files, heldTo(graded(100), 'held')), {})

  it('are not set against each other: no lift, and no change between them', () => {
    const state = stateOf([old, next], ['generic'])
    const outputs = outputsOf(state)
    const [a, b] = outputs
    expect(a.earlier).toMatchObject(before)
    expect(comparable(a, b)).toBe(false)
    const standings = standingsOf(state, outputs, saved)
    expect(liftOf(standings)).toBeNull()
    // The case as it stands ran once: the earlier answer is nothing it moved from.
    expect(standings[0]).toMatchObject({ known: true, previous: null, change: null, apart: false })
    // Each still has its own score: a run is read against the test it took.
    expect(outputs.map((o) => totalOf(o, saved))).toEqual([0, 100])
  })

  it('are compared once two versions answered the case as it stands', () => {
    const state = { ...stateOf([old, next, last], ['generic']), versions: at('v3') }
    const outputs = outputsOf(state)
    const [page] = standingsOf(state, outputs, saved)
    expect([page.first?.version, page.latest?.version]).toEqual(['v2', 'v3'])
    // The 0 the earlier request scored is in neither mean.
    expect(liftOf([page])).toMatchObject({ first: 100, latest: 100, cases: 1 })
    expect(comparable(outputs[1], outputs[2])).toBe(true)
    // The pair a case opens with is picked among the answers to it as it stands.
    expect(casePair(outputs, 'page')).toMatchObject({
      a: { run: { name: 'r2' } },
      b: { run: { name: 'r3' } },
    })
  })

  it('opens on the earlier answers when no run has answered the case as it stands', () => {
    const outputs = outputsOf(stateOf([old], ['generic']))
    expect(casePair(outputs, 'page').b?.run.name).toBe('r1')
  })

  it('never compares an output Jev graded with one graded without', () => {
    const coded = taking(runOf('r4', 'v3', files, heldTo(graded(100), 'held', null)), {})
    const state = stateOf([next, coded], ['generic'])
    const [a, b] = outputsOf(state)
    expect([a.judged, b.judged]).toEqual([true, false])
    expect(comparable(a, b)).toBe(false)
    // The case stands on the later run, with no move read from the other, which is still not its first.
    const [page] = standingsOf({ ...state, versions: at('v3') }, [a, b], saved)
    expect(page.latest?.run.name).toBe('r4')
    expect(page).toMatchObject({ previous: null, change: null, apart: true })
    expect(liftOf([page])).toBeNull()
  })

  it('stand in rows of their own on All cases, the case as it stands first', () => {
    const state = {
      ...stateOf([old, next], ['generic']),
      cases: [{ id: 'page', title: 'Page now', prompt: '', bench: {} }],
    } as unknown as State
    const rows = standingsOf(state, outputsOf(state), saved)
    expect(
      rows.map((row) => [row.title, row.known, row.earlier, row.history.map((t) => t.run.name)]),
    ).toEqual([
      ['Page now', true, false, ['r2']],
      // Under the name it had when it was asked, and not one a new run can check.
      ['Page', false, true, ['r1']],
    ])
    expect(new Set(rows.map((row) => row.key)).size).toBe(2)
    // Two runs of the earlier request are a move of their own, and no part of the lift: the case counts once.
    const again = taking(runOf('r0', 'v0', files, heldTo(graded(100), 'held')), {
      ask: 'then',
      earlier: before,
    })
    const more = { ...state, runs: [again, ...state.runs] } as State
    const [, earlier] = standingsOf(more, outputsOf(more), saved)
    expect(earlier).toMatchObject({ earlier: true, change: -100 })
    expect(liftOf(standingsOf(more, outputsOf(more), saved))).toBeNull()
  })

  it('name a case since deleted by the name its run kept', () => {
    const state = { ...stateOf([old], ['generic']), cases: [] } as unknown as State
    const outputs = outputsOf(state)
    expect(standingsOf(state, outputs, saved)).toMatchObject([
      { id: 'page', title: 'Page', known: false, earlier: false },
    ])
    expect(caseTitle(state, 'page')).toBe('Page')
    expect(caseTitle(state, 'gone')).toBe('gone')
  })
})

describe('a case whose run only waits to be graded', () => {
  const files = [md('a.md')]

  it('is the newest run after the score the case stands on', () => {
    const scored = taking(runOf('r1', 'v1', files, heldTo(graded(0), 'new')), { yardstick: 'new' })
    // Graded before a check of the case changed: it has no score until it is graded again.
    const stale = taking(runOf('r2', 'v2', files, heldTo(graded(100), 'old')), {
      yardstick: 'new',
    })
    const state = stateOf([scored, stale], ['generic'])
    const [page] = standingsOf(state, outputsOf(state), saved)
    expect(page).toMatchObject({ current: false })
    expect(page.latest?.run.name).toBe('r1')
    expect(toGrade(page)?.run.name).toBe('r2')
  })

  it('is none for a case that stands on its newest run, and for a run that was stopped', () => {
    const run = taking(runOf('r1', 'v2', files, heldTo(graded(100), 'held')), {})
    const state = stateOf([run], ['generic'])
    expect(toGrade(standingsOf(state, outputsOf(state), saved)[0])).toBeNull()
    const cut = runOf('r2', 'v2', files)
    const stopped = { ...cut, samples: [{ ...cut.samples[0], cut: 'stopped' as const }] }
    const after = stateOf([stopped], ['generic'])
    expect(toGrade(standingsOf(after, outputsOf(after), saved)[0])).toBeNull()
  })
})

describe('a score over outputs', () => {
  it('is none while any output that ran to its end has no total', () => {
    const one = runOf('r1', 'v1', [md('a.md')])
    const names = ['page-s1', 'page-s2', 'note-s1']
    const run = {
      ...one,
      samples: names.map((name) => ({ ...one.samples[0], name })),
      report: {
        results: [resultOf('page-s1', 100), resultOf('note-s1', 0)],
      } as unknown as Report,
    }
    const outputs = outputsOf(stateOf([run], ['generic']))
    // page-s2 is not graded: a mean of the other two would pass for the run's.
    expect(scoreOver(outputs, saved)).toBeNull()
    expect(
      scoreOver(
        outputs.filter((o) => o.caseId === 'note'),
        saved,
      ),
    ).toBe(0)
  })

  it('leaves out an output that was stopped: it says nothing of the skill', () => {
    const one = runOf('r1', 'v1', [md('a.md')])
    const stopped = { ...one.samples[0], name: 'page-s2', cut: 'stopped' as const }
    const run = {
      ...one,
      samples: [one.samples[0], stopped, { ...one.samples[0], name: 'note-s1' }],
      report: { results: [resultOf('page-s1', 0), resultOf('note-s1', 100)] } as unknown as Report,
    }
    const outputs = outputsOf(stateOf([run], ['generic']))
    expect(outputs.find((o) => o.sample.name === 'page-s2')?.cut).toBe('stopped')
    // Nor is the 0 of the attempt that did finish read as the case's: its run did not finish it.
    expect(scoreOver(outputs, saved)).toBe(100)
  })

  it('leaves out an output that failed, a file left or none, as one that was stopped', () => {
    const one = runOf('r1', 'v1', [md('a.md')])
    const run = {
      ...one,
      meta: {
        ...one.meta,
        samples: [{ dir: 'note-s1', failed: 'ran out of time', error: 'timed out after 60 s' }],
      } as unknown as RunMeta,
      samples: [one.samples[0], { ...one.samples[0], name: 'note-s1', cut: 'failed' as const }],
      report: { results: [resultOf('page-s1', 100), resultOf('note-s1', 0)] } as unknown as Report,
    }
    const outputs = outputsOf(stateOf([run], ['generic']))
    const failed = outputs.find((o) => o.sample.name === 'note-s1') as Output
    expect(failed.cut).toBe('failed')
    expect(failed.result).toBeNull()
    expect(failedLine(failed)).toBe('It ran out of time, so it has no score.')
    expect(failureOf(failed)).toBe('timed out after 60 s')
    expect(unscoredLine(failed)).toBe('v1 could not finish')
    expect(cutOf([failed])).toBe('failed')
    expect(scoreOver(outputs, saved)).toBe(100)
  })

  it('reads a case a run asked more attempts of than began as cut short, with no mean', () => {
    const one = runOf('r1', 'v1', [md('a.md')], graded(100))
    const asked = (finishedAt: string | null) =>
      ({ ...one, meta: { ...one.meta, samplesPerCase: 3, finishedAt } }) as RunView
    const [stopped] = outputsOf(stateOf([asked('2026-11-01T10:05:00Z')], ['generic']))
    expect(stopped.samples).toBe(3)
    expect(stopped.cut).toBeNull()
    expect(totalOf(stopped, saved)).toBe(100)
    expect(scoreOver([stopped], saved)).toBeNull()
    const standing = standingsOf(
      stateOf([asked('2026-11-01T10:05:00Z')], ['generic']),
      [stopped],
      saved,
    )
    expect(standing[0].tries[0]).toMatchObject({ score: null, cut: 'stopped' })
    // Still being written, the attempts to come are not finished.
    const [writing] = outputsOf(stateOf([asked(null)], ['generic']))
    expect(standingsOf(stateOf([asked(null)], ['generic']), [writing], saved)[0].tries[0].cut).toBe(
      'unfinished',
    )
    // A run that began every attempt it asked for reads as before.
    const whole = { ...one, meta: { ...one.meta, samplesPerCase: 1, finishedAt: 'x' } } as RunView
    expect(scoreOver(outputsOf(stateOf([whole], ['generic'])), saved)).toBe(100)
  })
})

describe('an output a part of whose grading failed', () => {
  const failed = runOf('r1', 'v1', [md('a.md')], graded(100, ['generic pack failed: no network']))
  const whole = runOf('r2', 'v1', [md('a.md')], graded(0))

  it('has no total, so it is left out of every mean, and says why', () => {
    const outputs = outputsOf(stateOf([failed, whole], ['generic']))
    const [broken, fine] = outputs
    expect(totalOf(broken, saved)).toBeNull()
    expect(scoreOf(broken, saved)?.scores.adherence).toBe(100)
    expect(scoreOf(broken, saved)?.verdicts[0].text).toBe('Grading failed: no network')
    expect(regradeOwed(scoreOf(broken, saved))).toBe(true)
    expect(regradeOwed(scoreOf(fine, saved))).toBe(false)
    expect(regradeOwed(null)).toBe(false)
    // Counted in, its 100 from the rules alone would lift the version to 50. Left out, the
    // version would read 0 from one answer of two: it has no score until both are graded.
    expect(versionScore(outputs, saved, 'v1')).toBeNull()
    expect(scoreOver([fine], saved)).toBe(0)
  })
})

describe('an output the run’s stop cut short', () => {
  const page = [md('a.md')]
  /** A run whose one sample is marked as the run's folder reads it (`Sample.cut`). */
  const cutRun = (name: string, version: string, cut: 'stopped' | 'unlisted'): RunView => {
    const run = runOf(name, version, page)
    return { ...run, samples: run.samples.map((sample) => ({ ...sample, cut })) }
  }
  const stoppedRun = (name: string, version: string): RunView => cutRun(name, version, 'stopped')

  it('is marked from the run’s record, and says so where a score would stand', () => {
    const outputs = outputsOf(
      stateOf([runOf('r1', 'v1', page), stoppedRun('r2', 'v2')], ['generic']),
    )
    expect(outputs.map((o) => o.cut)).toEqual([null, 'stopped'])
    expect(unscoredLine(outputs[1])).toBe('v2 was stopped before it finished')
    expect(unscoredLine(outputs[0])).toBe('v1 has no score yet')
    const bare = outputsOf(
      stateOf([madeBy(runOf('r0', 'v1', page), { configuration: 'without_skill' })], ['generic']),
    )
    expect(unscoredLine(bare[0])).toBe('The run without the skill has no score yet')
  })

  it('is not finished, for all the run says, when the run never recorded it and has no end', () => {
    const unlisted = cutRun('r2', 'v2', 'unlisted')
    const [open] = outputsOf(stateOf([unlisted], ['generic']))
    expect(open.cut).toBe('unfinished')
    expect(unscoredLine(open)).toBe('v2 is not finished')
    // Once the run has ended, a folder it never recorded was cut off.
    const [done] = outputsOf(
      stateOf([madeBy(unlisted, { finishedAt: '2026-11-02T10:05:00Z' })], ['generic']),
    )
    expect(done.cut).toBe('stopped')
  })

  it('has no score, whatever an earlier grading gave it', () => {
    const scored = runOf('r2', 'v2', page, graded(100))
    const state = stateOf([scored], ['generic'])
    expect(totalOf(outputsOf(state)[0], state.config)).toBe(100)
    const cut = {
      ...scored,
      samples: scored.samples.map((s) => ({ ...s, cut: 'unlisted' as const })),
    }
    const [output] = outputsOf(stateOf([cut], ['generic']))
    expect(output.result).toBeNull()
    expect(totalOf(output, state.config)).toBeNull()
  })

  it('says for several outputs what they have in place of a score', () => {
    const of = (...runs: RunView[]) => cutOf(outputsOf(stateOf(runs, ['generic'])))
    expect(of()).toBeNull()
    expect(of(stoppedRun('r1', 'v1'), stoppedRun('r2', 'v1'))).toBe('stopped')
    expect(of(stoppedRun('r1', 'v1'), cutRun('r2', 'v1', 'unlisted'))).toBe('unfinished')
    expect(of(stoppedRun('r1', 'v1'), runOf('r2', 'v1', page))).toBeNull()
  })

  it('is not the output a case opens with while a finished one of its version is there', () => {
    const finished = madeBy(runOf('r3', 'v2', page), { createdAt: '2026-11-01T09:00:00Z' })
    const outputs = outputsOf(
      stateOf([runOf('r1', 'v1', page), stoppedRun('r2', 'v2'), finished], ['generic']),
    )
    expect(casePair(outputs, 'page').b?.run.name).toBe('r3')
  })

  it('does not make its version the latest: the case stays on the answers there are', () => {
    const outputs = outputsOf(
      stateOf(
        [runOf('r1', 'v1', page), runOf('r2', 'v2', page), stoppedRun('r3', 'v3')],
        ['generic'],
      ),
    )
    expect(versionsRun(outputs)).toEqual(['v1', 'v2'])
    const pair = casePair(outputs, 'page')
    expect([pair.a?.run.name, pair.b?.run.name]).toEqual(['r1', 'r2'])
    expect(lastAnswer(outputs, 'page')?.run.name).toBe('r2')
    // With nothing else to read, the stopped output is what the case has.
    const alone = outputsOf(stateOf([stoppedRun('r3', 'v3')], ['generic']))
    expect(versionsRun(alone)).toEqual([])
    expect(lastAnswer(alone, 'page')?.run.name).toBe('r3')
  })

  it('is not offered to compare, unless it is the one in view', () => {
    const outputs = outputsOf(
      stateOf([runOf('r1', 'v1', page), stoppedRun('r2', 'v2')], ['generic']),
    )
    const [read, stopped] = outputs
    expect(outputsToPick(outputs, 'page', [read, null])).toEqual([read])
    expect(outputsToPick(outputs, 'page', [read, stopped])).toEqual([read, stopped])
    expect(outputsToPick(outputs, 'other', [read])).toEqual([])
  })

  it('is no failure, whatever its agent said as it was ended', () => {
    const said = (run: RunView, sample: object): RunView =>
      madeBy(run, {
        samples: run.samples.map((s) => ({ dir: s.name, error: 'stopped', ...sample })),
      } as never)
    const [stopped] = outputsOf(
      stateOf([said(stoppedRun('r1', 'v1'), { stopped: true })], ['generic']),
    )
    expect(failureOf(stopped)).toBeNull()
    const [failed] = outputsOf(
      stateOf([said(runOf('r2', 'v1', page), { error: 'exit 1' })], ['generic']),
    )
    expect(failureOf(failed)).toBe('exit 1')
    expect(failureOf(outputsOf(stateOf([runOf('r3', 'v1', page)], ['generic']))[0])).toBeNull()
  })
})

describe('deleteRunDialog', () => {
  const files = [md('README.md')]
  const withVersions = (state: State, saved: string[] = []): State =>
    ({
      ...state,
      versions: { versions: saved.map((version) => ({ version, saved: true })) },
    }) as unknown as State

  it('says in one plain sentence what goes, and that the skill stays', () => {
    const run = runOf('r1', 'v1', files)
    const state = withVersions(stateOf([run], ['generic']))
    expect(deleteRunDialog(state, run, outputsOf(state))).toEqual({
      title: 'Delete this run?',
      description: "Its results will be deleted, but your skill won't change.",
    })
    state.reviews.reviews['r1/page-s1'] = { corrections: { a: true } } as never
    expect(deleteRunDialog(state, run, outputsOf(state)).description).toBe(
      "Its results and the scores you fixed will be deleted, but your skill won't change.",
    )
  })

  it('says the skill it tested goes only when the run holds its one copy', () => {
    const run = { ...runOf('r1', 'v1', files), hasSkill: false }
    const state = withVersions(stateOf([run], ['generic']))
    expect(deleteRunDialog(state, run, outputsOf(state)).description).toBe(
      'Its results will be deleted, along with the only copy of the skill it tested.',
    )
    const saved = withVersions(stateOf([run], ['generic']), ['v1'])
    expect(deleteRunDialog(saved, run, outputsOf(saved)).description).toContain("won't change")
    const twin = runOf('r2', 'v1', files)
    const two = withVersions(stateOf([run, twin], ['generic']))
    expect(deleteRunDialog(two, run, outputsOf(two)).description).toContain("won't change")
  })

  it('says it goes from every case when the run answered more than one', () => {
    const one = runOf('r1', 'v1', files)
    const run = { ...one, samples: [...one.samples, { ...one.samples[0], name: 'note-s1' }] }
    const base = withVersions(stateOf([run], ['generic']))
    const state = { ...base, cases: [...base.cases, { id: 'note', bench: {} }] } as State
    expect(deleteRunDialog(state, run, outputsOf(state)).description).toBe(
      "Its results will be deleted from every case, but your skill won't change.",
    )
  })
})

describe('deleteBlocked', () => {
  it('lets a run go only when no job is writing or grading it', () => {
    expect(deleteBlocked({ writing: false, grading: false })).toBeUndefined()
    expect(deleteBlocked({ writing: true, grading: false })).toContain('run to finish')
    expect(deleteBlocked({ writing: false, grading: true })).toContain('grading to finish')
  })
})

/** An output of `run`: attempt `index` of `samples`, written by `model`. */
function attemptOf(run: RunView, index = 1, samples = 1, model = 'opus'): Output {
  const meta = { ...run.meta, writer: { engine: 'claude-code', model } } as RunMeta
  return {
    key: `${run.name}/page-s${index}`,
    run: { ...run, meta },
    sample: run.samples[0],
    result: null,
    caseId: 'page',
    index,
    samples,
    cut: null,
    corrections: {},
    primary: null,
    ask: '',
    earlier: null,
    judged: true,
    behind: null,
  }
}

describe('apartLine', () => {
  const v0 = runOf('r0', 'v0', [md('a.md')])
  const v1 = runOf('r1', 'v1', [md('a.md')])
  const v1again = runOf('r2', 'v1', [md('a.md')])

  it('says nothing when the versions tell the two apart', () => {
    expect(apartLine(attemptOf(v0, 1, 2), attemptOf(v1, 1, 2))).toBeNull()
    expect(apartLine(attemptOf(v1), null)).toBeNull()
  })

  it('names the writer whenever the two differ', () => {
    const line = apartLine(attemptOf(v0, 1, 1, 'haiku'), attemptOf(v1, 1, 1, 'opus'))
    expect(line).toMatch(/haiku/i)
  })

  it('names the attempt, and the time across two runs, for two outputs of one version', () => {
    expect(apartLine(attemptOf(v1, 2, 2), attemptOf(v1, 1, 2))).toBe('attempt 2 of 2')
    const across = apartLine(attemptOf(v1, 1, 2), attemptOf(v1again, 1, 2))
    expect(across?.startsWith('attempt 1 of 2 · ')).toBe(true)
  })
})

describe('outputFacts', () => {
  it('says who wrote it and when, and the attempt only when there were several', () => {
    const run = runOf('r1', 'v1', [md('a.md')])
    expect(outputFacts(attemptOf(run)).map((f) => f.label)).toEqual(['Written by', 'When'])
    expect(outputFacts(attemptOf(run, 2, 3))).toContainEqual({ label: 'Attempt', value: '2 of 3' })
  })

  it('says the length against what the case asks', () => {
    const output = {
      ...attemptOf(runOf('r1', 'v1', [md('a.md')])),
      result: { words: 32, range: [30, 120] },
    } as unknown as Output
    expect(outputFacts(output)).toContainEqual({
      label: 'Length',
      value: '32 words, the case asks 30 to 120',
    })
  })
})

describe('answerFiles', () => {
  const picture: Artifact = { file: 'outputs/mockup.png', kind: 'image' }

  it('names the page and the picture of the newest answer that came as both, and which is graded', () => {
    const runs = [
      runOf('r1', 'v1', [html('old.html'), { file: 'outputs/old.png', kind: 'image' }]),
      runOf('r2', 'v2', [html('mockup.html'), picture, md('notes.md')]),
    ]
    expect(answerFiles(outputsOf(stateOf(runs, ['generic', 'design'])), 'page')).toEqual({
      page: 'mockup.html',
      picture: 'mockup.png',
      graded: 'html',
    })
    // Graded as nothing that draws: the note is the file, so neither of the two is pressed.
    expect(answerFiles(outputsOf(stateOf(runs, ['generic'])), 'page')?.graded).toBeNull()
  })

  it('is null for a case whose answers came as one of the two, or that has none', () => {
    const page = outputsOf(stateOf([runOf('r1', 'v1', [html('index.html')])], ['generic']))
    expect(answerFiles(page, 'page')).toBeNull()
    expect(
      answerFiles(outputsOf(stateOf([runOf('r1', 'v1', [picture])], ['generic'])), 'page'),
    ).toBeNull()
    expect(answerFiles(page, 'another')).toBeNull()
  })
})

describe('cutOff', () => {
  const run = (over: Partial<RunMeta>) =>
    ({ ...runOf('r1', 'v1', []), meta: { finishedAt: null, ...over } }) as unknown as RunView
  it('is a run with no end of its own that no job is writing', () => {
    expect(cutOff(run({}), false)).toBe(true)
    expect(cutOff(run({}), true)).toBe(false)
    expect(cutOff(run({ finishedAt: '2026-11-01T10:00:00Z' }), false)).toBe(false)
    expect(cutOff(run({ legacy: true }), false)).toBe(false)
    expect(cutOff({ ...run({}), meta: null }, false)).toBe(false)
  })
})

describe('an output on a file Jev cannot read', () => {
  const pdf = { file: 'outputs/report.pdf', kind: 'other' as const }
  const unread = {
    ...resultOf('page-s1', 0),
    primary: pdf,
    artifacts: [pdf],
    flags: ['a kind of file Jev cannot read, so it has no score'],
    packs: { generic: null },
  }
  const run = runOf('r2', 'v2', [pdf], { results: [unread] } as unknown as Report)

  it('has no score, waits on no grading and holds up no mean', () => {
    const state = stateOf([runOf('r1', 'v1', [md('a.md')], graded(100)), run], ['generic'])
    const outputs = outputsOf(state)
    const [, pdfOutput] = outputs
    expect(totalOf(pdfOutput, saved)).toBeNull()
    expect(regradeOwed(scoreOf(pdfOutput, saved))).toBe(false)
    expect(scoreOver(outputs, saved)).toBe(100)
    const [standing] = standingsOf(state, outputs, saved)
    expect(toGrade(standing)).toBeNull()
  })
})

describe('the recently deleted', () => {
  it('names each delete and says what the trash holds', () => {
    expect(deletedName({ kind: 'version', version: 'v3' })).toBe('v3')
    expect(deletedName({ kind: 'run', version: 'v3' })).toBe('A run on v3')
    expect(deletesLine([{ kind: 'version' }, { kind: 'run' }, { kind: 'version' }])).toBe(
      '2 versions and 1 run',
    )
    expect(deletesLine([{ kind: 'run' }])).toBe('1 run')
  })
})
