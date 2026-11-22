/**
 * Why each miss of an answer happened, so the list on Results can put what to
 * fix first and say each reason once, over the rows it covers. Pure.
 *
 * A miss is placed by what else the answer did:
 * - `unopened`: the skill was never opened, so no rule or check it missed
 *   says anything about the skill's words. The fix is the skill as a whole:
 *   its description, so the agent opens it.
 * - `followed`: no rule was missed and a check still was. The rules ask for
 *   the wrong thing, or leave out what the check needs.
 * - `also-broken`: a check missed on an answer that broke a rule too. The
 *   broken rule may be why, so it is fixed first.
 * - `broken`: a rule the answer did not follow.
 *
 * An answer without the skill was held to no rule, so nothing of it is placed:
 * its misses are checks alone, and say nothing about the skill's words. A part
 * a kind of work adds (a verdict of kind `other`) is placed by nothing either.
 */
import { isMissed, type Verdict } from './pack.ts'
import type { TranscriptEvent } from './schemas.ts'

export type MissReason = 'unopened' | 'followed' | 'also-broken' | 'broken'

export interface PlacedMiss {
  verdict: Verdict
  why: MissReason
}

/**
 * The reasons in the order they are fixed in: the skill unopened first, since
 * nothing else counts until it is; then a check missed with every rule kept,
 * since checks say what a good answer needs; then a check missed beside a
 * broken rule; then the broken rules.
 */
export const FIX_ORDER: readonly MissReason[] = ['unopened', 'followed', 'also-broken', 'broken']

/**
 * Every rule and check an answer with the skill missed, each with why.
 * `opened` is whether its transcript shows the skill read (`openedSkill`):
 * null when that is not known, which places a miss as if it was.
 */
export function placeMisses(verdicts: readonly Verdict[], opened: boolean | null): PlacedMiss[] {
  const missed = verdicts.filter(isMissed)
  const rules = missed.filter((v) => v.kind === 'rule')
  const checks = missed.filter((v) => v.kind === 'check')
  if (opened === false)
    return [...rules, ...checks].map((verdict) => ({ verdict, why: 'unopened' }))
  return [
    ...rules.map((verdict): PlacedMiss => ({ verdict, why: 'broken' })),
    ...checks.map(
      (verdict): PlacedMiss => ({ verdict, why: rules.length ? 'also-broken' : 'followed' }),
    ),
  ]
}

/**
 * Whether a transcript shows the skill read: a call of the Skill tool, or a
 * tool call that names a SKILL.md, as the workflow pack reads it. Null for a
 * transcript with no step in it, which says nothing either way.
 */
export function openedSkill(events: readonly TranscriptEvent[] | null): boolean | null {
  if (!events?.length) return null
  return events.some(
    (e) => e.kind === 'tool' && (/^skill$/i.test(e.tool ?? '') || /SKILL\.md/.test(e.args ?? '')),
  )
}
