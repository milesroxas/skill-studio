/**
 * How often each of the skill's rules is followed and broken across graded
 * outputs, so a rule most outputs break can be told from one they follow. It
 * is counted the way Results counts a rule: met is followed, missed is
 * broken, and a rule set aside (Not sure, Not read, Cannot be marked, Does not
 * apply) is neither. An
 * output with no score counts for nothing. A rule is read on the newest
 * version that ran it (`newestRates`): what an older version's outputs broke
 * says nothing of the skill once a later one has run the same rule. Pure.
 */
import type { Verdict } from './pack.ts'

/** How many outputs followed one rule, and how many broke it. */
export interface RuleRate {
  followed: number
  broken: number
}

/**
 * Each rule's rate over `outputs`, by its words, as Jev was asked it and as
 * SKILL.md states it. A rule is named by its words, so one edited since is
 * another rule, with a rate of its own. An output counts each rule once.
 */
export function ruleRates(
  outputs: ReadonlyArray<{ total: number | null; verdicts: readonly Verdict[] }>,
): Map<string, RuleRate> {
  const rates = new Map<string, RuleRate>()
  for (const output of outputs) {
    if (output.total === null) continue
    const seen = new Set<string>()
    for (const v of output.verdicts) {
      const words = v.text.trim()
      if (v.kind !== 'rule' || v.aside || seen.has(words)) continue
      seen.add(words)
      const rate = rates.get(words) ?? { followed: 0, broken: 0 }
      if (v.met) rate.followed += 1
      else rate.broken += 1
      rates.set(words, rate)
    }
  }
  return rates
}

/**
 * Each rule's rate on the newest version that counted it. `rated` holds one
 * version's rates each, the oldest version first. A rule a later version's
 * outputs followed is no longer read as broken for what an earlier one did:
 * the skill around it changed, and that is the fix being looked for.
 */
export function newestRates(
  rated: ReadonlyArray<ReadonlyMap<string, RuleRate>>,
): Map<string, RuleRate> {
  const newest = new Map<string, RuleRate>()
  for (const rates of rated) for (const [words, rate] of rates) newest.set(words, rate)
  return newest
}

/** More of the outputs that counted the rule broke it than followed it. */
export const mostlyBroken = (rate: RuleRate): boolean => rate.broken > rate.followed
