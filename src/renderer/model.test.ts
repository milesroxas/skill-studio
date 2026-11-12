import type { Artifact, Report, RunMeta } from '@domain/schemas.ts'
import { describe, expect, it } from 'vitest'
import type { RunView, State } from './api.ts'
import type { Output } from './model.ts'
import {
  apartLine,
  casePair,
  deleteBlocked,
  deleteRunDialog,
  drawnOf,
  extraKinds,
  gradedLine,
  kindsLine,
  liftOf,
  listLine,
  mergedConfig,
  noSkillScore,
  outputFacts,
  outputNames,
  outputsOf,
  primaryOf,
  rulesUnmarked,
  setByHand,
  versionScore,
} from './model.ts'

const saved = mergedConfig(null)

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
    expect(setByHand({ packs: ['generic'], yes: 0.7, weights: { adherence: 30 } })).toEqual([
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
  } as unknown as RunMeta
  const sample = {
    name: 'page-s1',
    path: `/runs/${name}/page-s1`,
    artifacts,
    hasTranscript: false,
    legacy: false,
  }
  return { name, meta, report, samples: [sample], hasSkill: true }
}

const stateOf = (runs: RunView[], packs: string[], artifact?: 'markdown'): State =>
  ({
    runs,
    cases: [{ id: 'page', bench: artifact ? { artifact } : {} }],
    config: { ...saved, packs },
    reviews: { reviews: {} },
  }) as unknown as State

describe('outputsOf', () => {
  const files = [md('README.md'), code('app.js'), html('about.html'), html('index.html')]

  it('opens an output not graded on the file grading would judge', () => {
    const [output] = outputsOf(stateOf([runOf('r1', 'v1', files)], ['generic', 'design']))
    expect(primaryOf(output)).toEqual(html('index.html'))
    expect(drawnOf(output)).toEqual(html('index.html'))
    const [prose] = outputsOf(stateOf([runOf('r1', 'v1', files)], ['generic']))
    expect(primaryOf(prose)).toEqual(md('README.md'))
    expect(drawnOf(prose)).toEqual(html('index.html'))
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
    expect(liftOf(state, outputs, saved)).toBeNull()
    expect(versionScore(outputs, saved, 'v2')).toBeNull()
    expect(noSkillScore(outputs, saved)).toBeNull()
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
    corrections: {},
    primary: null,
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
