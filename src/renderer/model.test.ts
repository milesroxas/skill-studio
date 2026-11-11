import type { Artifact, Report, RunMeta } from '@domain/schemas.ts'
import { describe, expect, it } from 'vitest'
import type { RunView, State } from './api.ts'
import {
  casePair,
  drawnOf,
  kindsLine,
  liftOf,
  mergedConfig,
  outputsOf,
  primaryOf,
  setByHand,
  versionScore,
} from './model.ts'

const saved = mergedConfig(null)

describe('kindsLine', () => {
  it('says the kinds as a spoken list', () => {
    expect(kindsLine(['generic'])).toBe('Generic')
    expect(kindsLine(['generic', 'writing'])).toBe('Generic and Writing')
    expect(kindsLine(['generic', 'code', 'design'], 'or')).toBe('Generic, Code or Design')
    expect(kindsLine([])).toBe('')
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
  })
})
