import { describe, expect, it } from 'vitest'
import { VOICE } from './assist.ts'
import {
  checklistOf,
  draftOf,
  draftReply,
  drifts,
  dropsFact,
  type ImproveThread,
  improveSystem,
  judgmentFindings,
  keepListMark,
  kindsFor,
  measured,
  mergeFindings,
  needsOf,
  noVerdict,
  offerable,
  oneRule,
  openIn,
  planImprove,
  type RuleJudgment,
  refinePrompt,
  refineText,
  revisionOf,
  revisionText,
  rewritesOf,
  rewritesPrompt,
  rewritesResult,
  rewritesSchema,
  rewritesText,
  toFix,
  walkAfter,
  withheld,
} from './improve.ts'
import { lintScene, type RuleScene } from './lint.ts'
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
  const SEVERAL =
    '- Set the status bar to 9:41, full signal and a full battery, with no notifications, cursor, scrollbars or debug overlays, so every shot matches.'

  it('asks for the three in one reply and reads them back', () => {
    const kinds = kindsFor(scene)
    expect(kinds).toEqual(['practice', 'direct', 'shorter'])
    const { system, user } = rewritesPrompt(scene, [])
    expect(system).toContain('practice:')
    expect(system).toContain('shorter:')
    expect(system).not.toContain('split:')
    expect(user).toContain('found nothing wrong')
    expect(
      rewritesOf(JSON.stringify({ practice: 'a b', direct: 'c', shorter: 'd' }), kinds),
    ).toEqual({ practice: 'a b', direct: 'c', shorter: 'd' })
    expect(() => rewritesOf(JSON.stringify({ practice: 'a', direct: '' }), kinds)).toThrow(
      'More direct',
    )
  })

  it('offers Split up in place of Shorter for one rule that asks for several things', () => {
    const several = { ...scene, selection: SEVERAL }
    const kinds = kindsFor(several)
    expect(kinds).toEqual(['practice', 'direct', 'split'])
    expect(rewritesPrompt(several, []).system).toContain('split:')
    expect(rewritesPrompt(several, []).system).not.toContain('shorter:')
    expect(Object.keys(rewritesSchema(kinds).properties)).toEqual(kinds)
    expect(rewritesSchema(kinds).required).toEqual(kinds)
    // Two rules selected together are not one rule to split.
    expect(kindsFor({ selection: `${SEVERAL}\n${scene.selection}` })).toContain('shorter')
  })

  it('lets a rule be as long as it needs: the cut may hand the selection back', () => {
    expect(rewritesPrompt(scene, []).system).toContain('return the selection unchanged')
    expect(withheld(scene, 'shorter', scene.selection)).toBe(
      'Nothing to cut. Every word here does work.',
    )
    // Other words, and no fewer: not a cut, so not offered as one.
    const reworded = scene.selection.replace('Try to', 'Aim to')
    expect(withheld(scene, 'shorter', reworded)).toContain('Nothing to cut')
    expect(offerable(scene, 'shorter', '- Keep the note short.')).toBe(true)
    expect(measured(scene, 'shorter', '- Keep the note short.')).toMatch(/^4 words, \d+ fewer$/)
  })

  it('withholds a split still in one piece, and counts the rules of one that is not', () => {
    const several = { ...scene, selection: SEVERAL }
    expect(withheld(several, 'split', '- Set the status bar to 9:41 and full signal.')).toContain(
      'Nothing to split',
    )
    const split =
      '- Set the status bar to 9:41, so every shot matches.\n- Hide the cursor in every shot. A cursor dates it.'
    expect(withheld(several, 'split', split)).toBeNull()
    expect(measured(several, 'split', split)).toBe('2 rules')
    expect(measured(several, 'practice', split)).toBeNull()
  })

  it('offers no rewrite that is the selection again, and warns where Jev saw a fact dropped', () => {
    expect(withheld(scene, 'practice', scene.selection)).toBe('Same as the selection.')
    expect(offerable(scene, 'direct', ` ${scene.selection}\n`)).toBe(false)
    expect(offerable(scene, 'practice', 'other')).toBe(true)
    expect(dropsFact(noVerdict())).toBe(false)
    expect(dropsFact({ ...noVerdict(), kept: 0.1 })).toBe(true)
    expect(dropsFact({ ...noVerdict(), kept: 0.5 })).toBe(false)
  })

  it('carries the result as text', () => {
    const rewrites = { practice: 'x y z', direct: 'x y', shorter: 'Keep it to two sentences.' }
    const verdicts = { practice: noVerdict(), direct: noVerdict(), shorter: noVerdict() }
    const text = rewritesText({ rewrites, verdicts, judged: false })
    expect(rewritesResult(text)).toEqual({ rewrites, verdicts, judged: false })
    expect(() => rewritesResult('{}')).toThrow()
  })
})

describe('what a rewrite leaves open', () => {
  it('asks a rewrite to fix only what new words can fix', () => {
    const findings = judgmentFindings({ ...held, earns: 0.1, focused: 0.1, why: 0.1, strict: 0.5 })
    expect(toFix(findings).map((f) => f.principle)).toEqual(['why'])
    const file = lintScene({ ...scene, selection: `- ${PRACTICE_EDIT.good}`, band: 'over' })
    expect(drifts(file)).toBe(true)
    expect(toFix(file)).toEqual([])
  })

  it('reads a rewrite with the checks that read the selection', () => {
    expect(openIn(`- ${PRACTICE_EDIT.good}`, null)).toEqual([])
    expect(openIn(`- ${PRACTICE_EDIT.good}`, held)).toEqual([])
    expect(openIn(`- ${PRACTICE_EDIT.bad}`, null).map((f) => f.principle)).toContain('strict')
    // Sure of a missing reason, unsure of the boundary, sure the line does no work: one is open.
    const judged = { ...held, why: 0.1, strict: 0.5, earns: 0.1 }
    expect(openIn(`- ${PRACTICE_EDIT.good}`, judged).map((f) => f.principle)).toEqual(['why'])
  })

  it('names what is still needed, each thing once', () => {
    const open = openIn('- Try to keep the note clear.', { ...held, why: 0.1 })
    expect(needsOf(open)).toEqual(['a number, or an always or never', 'a step to take', 'a reason'])
    expect(needsOf([])).toEqual([])
  })

  it('tells one rule from several, for the questions Jev asks of one', () => {
    expect(oneRule(scene.selection)).toBe(true)
    expect(oneRule('- Open with the name, always.\n- Never add a sign-off, ever.')).toBe(false)
  })

  it('asks once more with what a first revision left open', () => {
    const open = openIn(`- ${PRACTICE_EDIT.bad}`, null)
    const { user } = refinePrompt({ ...scene, selection: `- ${PRACTICE_EDIT.bad}` }, open, true)
    expect(user).toContain('was meant to fix these and did not')
  })

  it('carries a revision and what it leaves open as text', () => {
    const revision = { text: '- Two sentences.', open: openIn(`- ${PRACTICE_EDIT.bad}`, null) }
    expect(revisionOf(revisionText(revision))).toEqual(revision)
    expect(revisionOf('{"text": "- Two."}')).toEqual({ text: '- Two.', open: [] })
    expect(() => revisionOf('{"text": ""}')).toThrow('could not be read')
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
    expect(planImprove(findings, held)).toEqual(['file'])
  })

  it('does not ask about the file for a filler phrase in the rule', () => {
    const findings = lintScene({
      ...scene,
      selection: '- In order to date the note, always write the day first. Readers sort by it.',
    })
    expect(findings.map((f) => f.dimension)).toEqual(['length'])
    expect(planImprove(findings, held)).toEqual([])
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
      'cut any that does no work',
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

  it('lists each judged principle as held, unless Jev is sure it is missing', () => {
    // Jev could not decide on the boundary: that is not a point the draft misses.
    const list = checklistOf({ ...held, why: 0.2, strict: 0.5 })
    expect(list.map((item) => [item.principle, item.held])).toEqual([
      ['process', true],
      ['why', false],
      ['strict', true],
      ['earns', true],
      ['focused', true],
    ])
    expect(list[1].message).toContain('no reason')
  })

  it('reads a draft with the checks that mark the rule once it is applied', () => {
    // Jev held every principle, and the draft still hedges and pads: both show under it.
    const list = checklistOf(
      held,
      '- In order to date it, try to write the day. Readers sort by it.',
    )
    expect(list.filter((item) => !item.held).map((item) => item.principle)).toEqual([
      'strict',
      'length',
    ])
    expect(list.find((item) => item.principle === 'strict')?.message).toContain('“try to”')
    expect(checklistOf(held, `- ${PRACTICE_EDIT.good}`).every((item) => item.held)).toBe(true)
  })
})
