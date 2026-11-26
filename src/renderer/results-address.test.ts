import { type AddressRun, resultsAddress } from '@domain/results-address.ts'
import type { Report, ReportResult, RunMeta } from '@domain/schemas.ts'
import { describe, expect, it } from 'vitest'
import type { RunView, State } from './api.ts'
import { casesRun, mergedConfig, outputsOf, resultsShown } from './model.ts'
import { placeOf } from './route.ts'

// The address is built in the domain, which imports nothing from the renderer, and read back here.

const SKILL = '/Users/someone/My Skills/release notes'

/** A run whose samples are these folders, listed in this order; `graded` maps a sample to the case its grading names. */
function runOf(name: string, samples: string[], graded: Record<string, string> = {}): RunView {
  const meta = {
    skillVersion: 'v1',
    writer: { engine: 'claude-code', model: 'opus' },
    configuration: 'with_skill',
    createdAt: '2026-11-01T10:00:00Z',
    samples: [],
  } as unknown as RunMeta
  const results = Object.entries(graded).map(
    ([sample, id]) =>
      ({ sample, case: id, artifacts: [], primary: null }) as unknown as ReportResult,
  )
  return {
    name,
    meta,
    report: results.length ? ({ model: null, results } as unknown as Report) : null,
    samples: samples.map((sample) => ({
      name: sample,
      path: `/runs/${name}/${sample}`,
      artifacts: [],
      hasTranscript: false,
      legacy: false,
    })),
    hasSkill: true,
    cases: {},
  }
}

/** The app's state over these runs, its cases in this order, as `loadCases` reads them. */
const stateOf = (runs: RunView[], cases: string[]): State =>
  ({
    runs,
    cases: cases.map((id) => ({ id, title: '', prompt: '', bench: {} })),
    config: mergedConfig(null),
    reviews: { reviews: {} },
    versions: { versions: [], current: { version: 'v2', changed: false } },
  }) as unknown as State

/** A run as the address takes it, each sample with the case its grading names, as `outputOf` reads it. */
const addressed = (run: RunView): AddressRun => ({
  name: run.name,
  samples: run.samples.map((s) => ({
    name: s.name,
    graded: run.report?.results.find((r) => r.sample === s.name)?.case ?? null,
  })),
})

/** The skill, the case and the two outputs Results opens on at `address`. */
function readBack(state: State, address: string) {
  const [search, hash] = address.split('#')
  const place = placeOf(`#${hash}`)
  const outputs = outputsOf(state)
  const { caseId, shown } = resultsShown(outputs, casesRun(state, outputs), place.params)
  return {
    skill: new URLSearchParams(search).get('skill'),
    screen: place.screen,
    caseId,
    a: shown?.a?.key ?? null,
    b: shown?.b?.key ?? null,
  }
}

// `page` is the one case both runs answered; each run lists a later attempt before its first.
const first = runOf('r1', ['email-s2', 'email-s1', 'page-s2', 'page-s1'])
const second = runOf('r2', ['page-s3', 'page-s1', 'notes-s1'])
const CASES = ['email', 'notes', 'page']
const state = stateOf([first, second], CASES)

describe('resultsAddress', () => {
  it('names the case and each run’s first attempt at it, as Results reads them back', () => {
    const address = resultsAddress({
      skill: SKILL,
      cases: CASES,
      case: 'page',
      a: addressed(first),
      b: addressed(second),
    })
    expect(readBack(state, address)).toEqual({
      skill: SKILL,
      screen: 'results',
      caseId: 'page',
      a: 'r1/page-s1',
      b: 'r2/page-s1',
    })
  })

  it('names the first case both runs answered when no case is named', () => {
    const address = resultsAddress({
      skill: SKILL,
      cases: CASES,
      case: null,
      a: addressed(first),
      b: addressed(second),
    })
    expect(readBack(state, address)).toMatchObject({
      caseId: 'page',
      a: 'r1/page-s1',
      b: 'r2/page-s1',
    })
  })

  it('takes the first case in the order Results lists them, not by id', () => {
    // Folders sort as plain text, so `Zeta` comes before `alpha`; by locale it would come after.
    const cases = ['Zeta', 'alpha']
    const a = runOf('r1', ['alpha-s1', 'Zeta-s1'])
    const b = runOf('r2', ['alpha-s1', 'Zeta-s1'])
    const both = stateOf([a, b], cases)
    expect(casesRun(both, outputsOf(both))[0]).toBe('Zeta')
    const address = resultsAddress({
      skill: SKILL,
      cases,
      case: null,
      a: addressed(a),
      b: addressed(b),
    })
    expect(readBack(both, address)).toMatchObject({ caseId: 'Zeta', a: 'r1/Zeta-s1' })
    // A case since deleted comes after every case the skill has, whatever its id.
    const gone = runOf('r3', ['aardvark-s1', 'alpha-s1'])
    const left = stateOf([gone], cases)
    expect(
      readBack(
        left,
        resultsAddress({ skill: SKILL, cases, case: null, a: addressed(gone), b: null }),
      ),
    ).toMatchObject({ caseId: 'alpha', a: 'r3/alpha-s1' })
  })

  it('reads a sample’s case from its grading first, as Results does', () => {
    // An old run's flat file: its name is no `<case>-s<n>`, and only its grading says its case.
    const old = runOf('r5', ['release.md'], { 'release.md': 'release' })
    const kept = stateOf([old], ['release'])
    const address = resultsAddress({
      skill: SKILL,
      cases: ['release'],
      case: 'release',
      a: addressed(old),
      b: null,
    })
    expect(readBack(kept, address)).toMatchObject({ caseId: 'release', a: 'r5/release.md' })
  })

  it('names one output when one run is named', () => {
    const address = resultsAddress({
      skill: SKILL,
      cases: CASES,
      case: null,
      a: addressed(first),
      b: null,
    })
    expect(readBack(state, address)).toMatchObject({ caseId: 'email', a: 'r1/email-s1', b: null })
  })

  it('names only the case when no run is named', () => {
    const address = resultsAddress({ skill: SKILL, cases: CASES, case: 'notes', a: null, b: null })
    expect(address.endsWith('#/results?case=notes')).toBe(true)
    expect(readBack(state, address)).toMatchObject({ caseId: 'notes', a: null, b: null })
  })

  it('is refused for a run that did not answer the case, or two that share none', () => {
    expect(() =>
      resultsAddress({
        skill: SKILL,
        cases: CASES,
        case: 'email',
        a: addressed(first),
        b: addressed(second),
      }),
    ).toThrow('r2 did not answer email.')
    expect(() =>
      resultsAddress({
        skill: SKILL,
        cases: CASES,
        case: null,
        a: addressed(runOf('r4', ['email-s1'])),
        b: addressed(runOf('r3', ['notes-s1'])),
      }),
    ).toThrow('r4 and r3 answered no case in common.')
  })
})
