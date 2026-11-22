import { describe, expect, it } from 'vitest'
import { FIX_ORDER, openedSkill, placeMisses } from './fix-order.ts'
import { NO_CORRECTIONS, type Verdict } from './pack.ts'
import type { TranscriptEvent } from './schemas.ts'
import { codeVerdict, jevVerdict } from './verdict.ts'

const fact = (kind: Verdict['kind'], text: string, met: boolean): Verdict =>
  codeVerdict({ kind, text, layer: kind === 'other' ? 'look' : null }, met)
/** A fact Jev answered between the two thresholds: set aside as not sure. */
const unsure = (kind: Verdict['kind'], text: string): Verdict =>
  jevVerdict({ kind, text, layer: null }, 0.5, { yes: 0.7, no: 0.3 }, NO_CORRECTIONS)

const placed = (verdicts: Verdict[], opened: boolean | null) =>
  placeMisses(verdicts, opened).map((m) => [m.verdict.text, m.why])

describe('placeMisses', () => {
  it('says a check missed with every rule kept was missed though the rules were followed', () => {
    expect(
      placed([fact('rule', 'Short lines', true), fact('check', 'Names the price', false)], true),
    ).toEqual([['Names the price', 'followed']])
  })

  it('puts a check missed beside a broken rule after that rule', () => {
    expect(
      placed(
        [
          fact('check', 'Names the price', false),
          fact('rule', 'Short lines', false),
          fact('rule', 'No exclamation marks', true),
        ],
        true,
      ),
    ).toEqual([
      ['Short lines', 'broken'],
      ['Names the price', 'also-broken'],
    ])
  })

  it('places every miss of an answer that never opened the skill on that alone', () => {
    expect(
      placed([fact('rule', 'Short lines', false), fact('check', 'Names the price', false)], false),
    ).toEqual([
      ['Short lines', 'unopened'],
      ['Names the price', 'unopened'],
    ])
  })

  it('reads an answer it cannot tell was opened as opened', () => {
    expect(placed([fact('rule', 'Short lines', false)], null)).toEqual([['Short lines', 'broken']])
  })

  it('places nothing met, set aside, or added by a kind of work', () => {
    expect(
      placed(
        [
          fact('rule', 'Short lines', true),
          unsure('rule', 'Plain words'),
          unsure('check', 'Sounds warm'),
          fact('other', 'One clear main point', false),
        ],
        true,
      ),
    ).toEqual([])
  })

  it('counts a rule set aside as no rule broken', () => {
    expect(
      placed([unsure('rule', 'Plain words'), fact('check', 'Names the price', false)], true),
    ).toEqual([['Names the price', 'followed']])
  })

  it('lists the reasons in the order they are fixed in', () => {
    expect(FIX_ORDER).toEqual(['unopened', 'followed', 'also-broken', 'broken'])
  })
})

describe('openedSkill', () => {
  const tool = (name: string, args: string): TranscriptEvent => ({
    step: 1,
    at: 0,
    kind: 'tool',
    tool: name,
    args,
  })

  it('finds SKILL.md read by any tool', () => {
    expect(openedSkill([tool('Read', '/tmp/x/.agents/skills/note/SKILL.md')])).toBe(true)
    expect(openedSkill([tool('Bash', 'cat SKILL.md')])).toBe(true)
  })

  it('finds the skill loaded through the Skill tool', () => {
    expect(openedSkill([tool('Skill', 'launch-note')])).toBe(true)
  })

  it('says a transcript with steps and no read never opened it', () => {
    expect(openedSkill([tool('Write', 'email.txt'), tool('Read', 'brief.md')])).toBe(false)
  })

  it('says nothing of a transcript with no steps', () => {
    expect(openedSkill(null)).toBeNull()
    expect(openedSkill([])).toBeNull()
  })
})
