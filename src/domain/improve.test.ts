import { describe, expect, it } from 'vitest'
import { VOICE } from './assist.ts'
import {
  checklistOf,
  codeVerdicts,
  draftOf,
  draftReply,
  drifts,
  dropsFact,
  type ImproveThread,
  improveSystem,
  judgmentFindings,
  keepListMark,
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
  walkAfter,
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
    const text = rewritesText({ rewrites, verdicts, judged: false })
    expect(rewritesResult(text)).toEqual({ rewrites, verdicts, judged: false })
    expect(() => rewritesResult('{}')).toThrow()
  })

  it('offers every rewrite that is not the selection again, and warns where Jev saw a fact dropped', () => {
    const verdict = { kept: null, drift: [] as Finding[], shorter: null }
    expect(offerable(scene, scene.selection)).toBe(false)
    expect(offerable(scene, 'other')).toBe(true)
    expect(dropsFact(verdict)).toBe(false)
    expect(dropsFact({ ...verdict, kept: 0.1 })).toBe(true)
    expect(dropsFact({ ...verdict, kept: 0.5 })).toBe(false)
  })
})

describe('keepListMark', () => {
  it('puts back the list mark the model left off, and leaves one it kept', () => {
    expect(keepListMark('- Try to date it.', 'Always date it.')).toBe('- Always date it.')
    expect(keepListMark('  3. Try to date it.', 'Always date it.')).toBe('  3. Always date it.')
    expect(keepListMark('- Try to date it.', '- Always date it.')).toBe('- Always date it.')
    expect(keepListMark('Try to date it.', 'Always date it.')).toBe('Always date it.')
  })
})

describe('planImprove', () => {
  it('asks every principle question without a judgment, and only the flagged ones when all hold', () => {
    expect(planImprove([], null)).toEqual(['earns', 'process', 'strict', 'why'])
    expect(planImprove([], held)).toEqual([])
    const findings = judgmentFindings({ ...held, complexity: 2.4, strict: 0.2 })
    expect(planImprove(findings, { ...held, strict: 0.2 })).toEqual(['complexity', 'strict'])
  })

  it('asks about a principle whose answer is not a number, as it does about a missing one', () => {
    const lost = { ...held, strict: Number.NaN, why: Number.NaN }
    expect(planImprove([], lost)).toEqual(['strict', 'why'])
  })

  it('adds the file question when the file is long', () => {
    const findings = lintScene({ ...scene, selection: `- ${PRACTICE_EDIT.good}`, band: 'long' })
    expect(planImprove(findings, held)).toEqual(['length'])
  })
})

describe('improveSystem', () => {
  const thread: ImproveThread = {
    scene,
    opened: '2026-11-12T00:00:00.000Z',
    walked: true,
    findings: [],
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

  it('writes from what the writer asked when they asked for no questions, and fixes what the checks found', () => {
    const asked = improveSystem({
      ...thread,
      walked: false,
      at: 2,
      findings: [
        {
          dimension: 'principle',
          principle: 'why',
          lead: 'Say why.',
          message: 'No reason given.',
          quote: null,
          source: 'judge',
        },
      ],
    })
    expect(asked).toContain('Write the draft now from what the writer asked')
    expect(asked).toContain('Say why. No reason given.')
  })

  it('once a draft stands, answers a question without a new draft and talks a deletion over', () => {
    const standing = improveSystem({ ...thread, at: 2, draft: '- Two sentences.' })
    expect(standing).toContain('if it is a question, answer it')
    expect(standing).toContain('as it stands in the file now')
    expect(standing).not.toContain('What the checks found')
    expect(improveSystem({ ...thread, at: 2, cut: true, draft: '' })).not.toContain(
      'Propose deleting it',
    )
  })

  it('offers a draft rather than reporting a change, and leaves the next step open', () => {
    const drafting = improveSystem({ ...thread, at: 2 })
    expect(drafting).toContain(VOICE)
    expect(drafting).toContain('as an offer')
    expect(drafting).toContain('never say you changed, replaced')
    expect(drafting).toContain('After the block, write nothing, unless')
    expect(drafting).toContain('Never ask whether the draft says what they meant')
  })

  it('asks for the draft once the steps are walked, and for a deletion when the line does nothing', () => {
    expect(improveSystem({ ...thread, at: 2 })).toContain('Write the draft now')
    expect(improveSystem({ ...thread, at: 2, cut: true })).toContain('Propose deleting it')
    expect(improveSystem({ ...thread, at: 2, scene: { ...scene, band: 'over' } })).toContain(
      'must be shorter',
    )
  })
})

describe('walkAfter', () => {
  const walk = {
    steps: ['earns', 'strict', 'why'] as ImproveThread['steps'],
    at: 0,
    asks: 0,
    cut: false,
  }

  it('moves on after an answer, and after any reply without the judge', () => {
    expect(walkAfter(walk, { answered: 0.9, cut: null })).toEqual({ at: 1, asks: 0, cut: false })
    expect(walkAfter({ ...walk, asks: 1 }, null)).toEqual({ at: 1, asks: 0, cut: false })
  })

  it('puts an unanswered question once more, then moves on', () => {
    const missed = { answered: 0.1, cut: null }
    expect(walkAfter(walk, missed)).toEqual({ at: 0, asks: 1, cut: false })
    expect(walkAfter({ ...walk, asks: 1 }, missed)).toEqual({ at: 1, asks: 0, cut: false })
    // A reply the judge could not place either way counts as an answer.
    expect(walkAfter(walk, { answered: 0.5, cut: null })).toEqual({ at: 1, asks: 0, cut: false })
  })

  it('goes straight to the draft when the reply says the line does nothing', () => {
    expect(walkAfter(walk, { answered: 0.1, cut: 0.9 })).toEqual({ at: 3, asks: 0, cut: true })
    expect(walkAfter(walk, { answered: 0.9, cut: 0.5 })).toEqual({ at: 1, asks: 0, cut: false })
  })
})

describe('draftReply', () => {
  it('splits a reply around its draft, and holds the place of a draft still arriving', () => {
    expect(draftReply('Changed the limit.\n\n```\n- Two sentences.\n```\n\nDoes it?')).toEqual({
      before: 'Changed the limit.',
      draft: '- Two sentences.',
      writing: false,
      after: 'Does it?',
    })
    expect(draftReply('Changed the limit.\n\n```\n- Two sen')).toEqual({
      before: 'Changed the limit.',
      draft: null,
      writing: true,
      after: '',
    })
    expect(draftReply('Only an answer.')).toEqual({
      before: 'Only an answer.',
      draft: null,
      writing: false,
      after: '',
    })
    // A deletion is an empty block.
    expect(draftReply('It goes.\n\n```\n```')).toMatchObject({ draft: '', writing: false })
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
