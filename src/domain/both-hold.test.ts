/**
 * Where two rules surely apply to the same outputs, as grading decides it:
 * the scope `st sort` holds two rules, or a check and a rule, to before code
 * compares their readings. Over the rules of the `launch-note` test skill, as
 * `scanRules` reads them.
 */
import { describe, expect, it } from 'vitest'
import { everywhere, ownCondition, sameScope } from './both-hold.ts'
import { type Rule, scanRules } from './rules.ts'

const SKILL = `---
name: launch-note
description: Write a launch note.
---

- Keep each note under 500 words. Nobody reads past that.

# Launch note

## Rules for every announcement

- Open with the brief's Headline, word for word. A reworded headline is one the team did not approve.
- Write no more than 120 words. Most readers stop after the first screen.
- When the brief gives a Price, state it with its currency code, such as 12 USD.

## Rules for an email

- Put the subject on the first line, after Subject: , in 50 characters or fewer.
- For an email, sign with the name the brief gives under Signed by.
`

const rules = scanRules(SKILL).rules
const ruleOf = (start: string): Rule => {
  const found = rules.find((r) => r.text.startsWith(start))
  if (!found) throw new Error(`no rule ${start}`)
  return found
}

describe('where two rules apply', () => {
  it('holds two rules under one heading to each other, and none under two headings', () => {
    expect(sameScope(ruleOf('Open with'), ruleOf('Write no more'))).toBe(true)
    expect(sameScope(ruleOf('Write no more'), ruleOf('Put the subject'))).toBe(false)
    expect(sameScope(ruleOf('Keep each note'), ruleOf('Write no more'))).toBe(false)
  })

  it('leaves a rule with a condition of its own out, and reads "word for word" as none', () => {
    expect(ownCondition(ruleOf('When the brief'))).toBe(true)
    expect(ownCondition(ruleOf('For an email'))).toBe(true)
    expect(ownCondition(ruleOf('Open with'))).toBe(false)
    expect(sameScope(ruleOf('Write no more'), ruleOf('When the brief'))).toBe(false)
  })

  it('holds a check only beside a rule above every heading with no condition of its own', () => {
    expect(everywhere(ruleOf('Keep each note'))).toBe(true)
    expect(everywhere(ruleOf('Write no more'))).toBe(false)
    expect(
      everywhere({ id: 'r1', text: 'If the brief has a Price, state it.', section: 'SKILL.md' }),
    ).toBe(false)
  })
})
