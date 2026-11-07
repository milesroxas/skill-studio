import { describe, expect, it } from 'vitest'
import {
  checklistOf,
  codeVerdicts,
  draftOf,
  drifts,
  type ImproveThread,
  improveSystem,
  judgmentFindings,
  mergeFindings,
  offerable,
  planImprove,
  type RuleJudgment,
  refinePrompt,
  refineText,
  rewritesOf,
  rewritesPrompt,
  rewritesResult,
  rewritesText,
} from './improve.ts'
import { type Finding, lintScene, type RuleScene } from './lint.ts'
import { PRACTICE_EDIT } from './practice.ts'
import { RULE_GUIDE } from './templates.ts'

const scene: RuleScene = {
  selection: `- ${PRACTICE_EDIT.bad}`,
  before: '- Say what their help made possible. The effect is the part they did not see.',
  after: '',
  description: 'Writes a short thank-you note.',
  band: 'fine',
}

const held: RuleJudgment = {
  process: 0.95,
  why: 0.9,
  strict: 0.92,
  earns: 0.88,
  focused: 0.97,
  complexity: 0.4,
}

describe('judgmentFindings', () => {
  it('finds nothing when every principle holds', () => {
    expect(judgmentFindings(held)).toEqual([])
  })

  it('reads a low probability as a drift, a middling one as a maybe, and a high complexity as a tree in prose', () => {
    const findings = judgmentFindings({ ...held, strict: 0.1, why: 0.5, complexity: 2.8 })
    expect(findings.map((f) => [f.principle ?? f.dimension, f.source])).toEqual([
      ['why', 'maybe'],
      ['strict', 'judge'],
      ['complexity', 'judge'],
    ])
  })
})

describe('mergeFindings', () => {
  const code = lintScene(scene)
  it('lets code’s finding stand for the judge’s on the same principle, and drops a maybe under anything sure', () => {
    const judged = judgmentFindings({ ...held, strict: 0.1, why: 0.5, process: 0.2 })
    const merged = mergeFindings(code, judged)
    expect(merged.filter((f) => f.principle === 'strict')).toHaveLength(1)
    expect(merged.find((f) => f.principle === 'strict')?.source).toBe('code')
    expect(merged.find((f) => f.principle === 'process')?.source).toBe('judge')
    expect(merged.find((f) => f.principle === 'why')?.source).toBe('maybe')
  })

  it('counts a maybe alone as nothing to fix', () => {
    expect(drifts(judgmentFindings({ ...held, why: 0.5 }))).toBe(false)
    expect(drifts(judgmentFindings({ ...held, why: 0.1 }))).toBe(true)
  })
})

describe('refinePrompt and refineText', () => {
  it('shows the rule in its place and names what is wrong', () => {
    const findings = lintScene(scene)
    const { system, user } = refinePrompt(scene, findings)
    for (const item of RULE_GUIDE) expect(system).toContain(item.lead)
    expect(user).toContain(`<selection>\n${scene.selection}\n</selection>`)
    expect(user).toContain('<before>')
    expect(user).toContain('“reasonable”')
  })

  it('reads the revision and refuses a reply without one', () => {
    expect(refineText(JSON.stringify({ revision: ' - Two sentences. ' }))).toBe('- Two sentences.')
    expect(() => refineText('{"revision": ""}')).toThrow('no revision')
    expect(() => refineText('{"rev')).toThrow('malformed')
  })
})

describe('rewrites', () => {
  it('asks for the three in one reply and reads them back', () => {
    const { system, user } = rewritesPrompt(scene, [])
    expect(system).toContain('practice:')
    expect(system).toContain('shorter:')
    expect(user).toContain('found nothing wrong')
    expect(rewritesOf(JSON.stringify({ practice: 'a b', direct: 'c', shorter: 'd' }))).toEqual({
      practice: 'a b',
      direct: 'c',
      shorter: 'd',
    })
    expect(() => rewritesOf(JSON.stringify({ practice: 'a', direct: '' }))).toThrow('More direct')
  })

  it('checks in code that shorter is shorter, and carries the result as text', () => {
    const rewrites = { practice: 'x y z', direct: 'x y', shorter: 'Keep it to two sentences.' }
    const verdicts = codeVerdicts(scene, rewrites)
    expect(verdicts.shorter.shorter).toBe(true)
    expect(verdicts.practice.kept).toBeNull()
    const text = rewritesText({ rewrites, verdicts })
    expect(rewritesResult(text)).toEqual({ rewrites, verdicts })
    expect(() => rewritesResult('{}')).toThrow()
  })

  it('offers a rewrite that kept the facts and is not the selection again', () => {
    const verdict = { kept: null, drift: [] as Finding[], shorter: null }
    expect(offerable(scene, scene.selection, verdict)).toBe(false)
    expect(offerable(scene, 'other', verdict)).toBe(true)
    expect(offerable(scene, 'other', { ...verdict, kept: 0.1 })).toBe(false)
    expect(offerable(scene, 'other', { ...verdict, kept: 0.5 })).toBe(true)
  })
})

describe('planImprove', () => {
  it('asks every principle question without a judgment, and only the flagged ones when all hold', () => {
    expect(planImprove([], null)).toEqual(['earns', 'process', 'strict', 'why'])
    expect(planImprove([], held)).toEqual([])
    const findings = judgmentFindings({ ...held, complexity: 2.4, strict: 0.2 })
    expect(planImprove(findings, { ...held, strict: 0.2 })).toEqual(['complexity', 'strict'])
  })

  it('adds the file question when the file is long', () => {
    const findings = lintScene({ ...scene, selection: `- ${PRACTICE_EDIT.good}`, band: 'long' })
    expect(planImprove(findings, held)).toEqual(['length'])
  })
})

describe('improveSystem', () => {
  const thread: ImproveThread = {
    scene,
    steps: ['strict', 'why'],
    at: 0,
    asks: 0,
    cut: false,
    messages: [],
    run: null,
    draft: null,
    checklist: null,
    judged: true,
  }

  it('asks the step in hand and nothing else', () => {
    const system = improveSystem(thread)
    expect(system).toContain('Where is the line')
    expect(system).toContain('Do not write the draft yet')
    expect(improveSystem({ ...thread, asks: 1 })).toContain('ask once more')
  })

  it('asks for the draft once the steps are walked, and for a deletion when the line does nothing', () => {
    expect(improveSystem({ ...thread, at: 2 })).toContain('Write the draft now')
    expect(improveSystem({ ...thread, at: 2, cut: true })).toContain('Propose deleting it')
    expect(improveSystem({ ...thread, at: 2, scene: { ...scene, band: 'over' } })).toContain(
      'must be shorter',
    )
  })
})

describe('draftOf and checklistOf', () => {
  it('takes the last fenced block', () => {
    expect(draftOf('Changed the limit.\n\n```\n- Two sentences.\n```\n\nDoes it?')).toBe(
      '- Two sentences.',
    )
    expect(draftOf('```md\nfirst\n```\n```\nsecond\n```')).toBe('second')
    expect(draftOf('no block')).toBeNull()
  })

  it('lists each judged principle as held or not', () => {
    const list = checklistOf({ ...held, why: 0.2 })
    expect(list.map((item) => [item.principle, item.held])).toEqual([
      ['process', true],
      ['why', false],
      ['strict', true],
      ['earns', true],
      ['focused', true],
    ])
    expect(list[1].message).toContain('no reason')
  })
})
