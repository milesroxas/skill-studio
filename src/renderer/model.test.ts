import type { Artifact, Report, RunMeta } from '@domain/schemas.ts'
import { describe, expect, it } from 'vitest'
import type { RunView, State } from './api.ts'
import {
  casePair,
  drawnOf,
  keptConfig,
  liftOf,
  mergedConfig,
  outputsOf,
  primaryOf,
  scoringDirty,
  versionScore,
} from './model.ts'

const saved = mergedConfig(null)
const edited = { ...saved, yes: saved.yes / 2 }

describe('scoringDirty', () => {
  it('is false for the scoring as saved', () => {
    expect(scoringDirty(saved, null)).toBe(false)
    expect(scoringDirty(mergedConfig({ packs: saved.packs }), { packs: saved.packs })).toBe(false)
  })

  it('is true once the scoring in hand differs', () => {
    expect(scoringDirty(edited, null)).toBe(true)
  })
})

describe('keptConfig', () => {
  it('takes the saved scoring on a first read', () => {
    expect(keptConfig(null, null, saved)).toBe(saved)
  })

  it('keeps an edit that is not saved yet', () => {
    expect(keptConfig(edited, saved, saved)).toBe(edited)
  })

  it('takes a scoring that changed on disk when nothing was edited here', () => {
    const onDisk = { ...saved, yes: 0.9 }
    expect(keptConfig(saved, saved, onDisk)).toBe(onDisk)
  })

  it('never keeps a scoring read for another skill: with no read before it, the new one stands', () => {
    const other = { ...saved, yes: 0.1 }
    expect(keptConfig(other, null, saved)).toBe(saved)
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
