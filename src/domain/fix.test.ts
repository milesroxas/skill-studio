import { describe, expect, it } from 'vitest'
import {
  ANSWER_BUDGET,
  fixDraftOf,
  fixPrompt,
  fixText,
  fixVersionName,
  readFixText,
  replaceRule,
  ruleSource,
  sheetFiles,
  unchanged,
} from './fix.ts'
import { scanRules } from './rules.ts'

const SKILL = `---
name: launch-note
description: Writes a launch note.
---

# Launch note

## Rules

- Open with the headline and nothing before it, because readers decide in the first line.
- Keep the note under 200 words, since a longer one is skimmed and its last part missed.
  - Count the headline too.
- Quote the brief word for word when you quote it, so nobody reads a claim the brief never made.
`

const ruleText = (i: number) => scanRules(SKILL).rules[i].text

describe('ruleSource', () => {
  it('finds a rule by its words, with its list mark and its lines in the file', () => {
    const source = ruleSource(SKILL, ruleText(0))
    expect(source).toEqual({
      from: 10,
      to: 10,
      text: '- Open with the headline and nothing before it, because readers decide in the first line.',
      section: 'Rules',
    })
  })

  it('takes a nested bullet as part of its rule', () => {
    const source = ruleSource(SKILL, ruleText(1))
    expect(source?.from).toBe(11)
    expect(source?.to).toBe(12)
    expect(source?.text).toContain('  - Count the headline too.')
  })

  it('is null for a rule the file no longer holds', () => {
    expect(
      ruleSource(SKILL, 'Never write in the passive voice, because it hides who acts.'),
    ).toBeNull()
  })
})

describe('replaceRule', () => {
  it('puts the revision in place of the rule and leaves the rest as it was', () => {
    const source = ruleSource(SKILL, ruleText(1))
    if (!source) throw new Error('no rule')
    const next = replaceRule(
      SKILL,
      source,
      '- Keep the note under 200 words, headline included, since a longer one is skimmed.',
    )
    expect(next).toContain(
      '- Keep the note under 200 words, headline included, since a longer one is skimmed.\n- Quote',
    )
    expect(next).not.toContain('Count the headline too')
    expect(next.replace(/- Keep[^\n]*\n/, '')).toBe(
      SKILL.replace(/- Keep[^\n]*\n {2}- Count the headline too\.\n/, ''),
    )
  })

  it('keeps the list mark when the revision leaves it off', () => {
    const source = ruleSource(SKILL, ruleText(0))
    if (!source) throw new Error('no rule')
    const next = replaceRule(
      SKILL,
      source,
      'Open with the headline, because readers decide in the first line.',
    )
    expect(next).toContain(
      '\n- Open with the headline, because readers decide in the first line.\n',
    )
  })

  it('writes the file back in its own line endings', () => {
    const crlf = SKILL.replace(/\n/g, '\r\n')
    const source = ruleSource(crlf, ruleText(2))
    if (!source) throw new Error('no rule')
    const next = replaceRule(crlf, source, '- Quote the brief word for word, so no claim is added.')
    expect(next).toContain('- Quote the brief word for word, so no claim is added.\r\n')
    expect(next.replace(/\r\n/g, '')).not.toContain('\n')
  })
})

describe('sheetFiles', () => {
  it('holds every file whole when they fit', () => {
    const files = [
      { path: 'outputs/a.md', text: 'one' },
      { path: 'outputs/b.md', text: 'two' },
    ]
    expect(sheetFiles(files)).toEqual([
      { path: 'outputs/a.md', text: 'one', cut: false },
      { path: 'outputs/b.md', text: 'two', cut: false },
    ])
  })

  it('cuts a long file and stops at the budget', () => {
    const long = 'x'.repeat(ANSWER_BUDGET)
    const held = sheetFiles([
      { path: 'a', text: long },
      { path: 'b', text: long },
      { path: 'c', text: 'never read' },
    ])
    expect(held.map((f) => f.path)).toEqual(['a', 'b'])
    expect(held.every((f) => f.cut)).toBe(true)
    expect(held.reduce((n, f) => n + f.text.length, 0)).toBe(ANSWER_BUDGET)
  })
})

describe('fixPrompt', () => {
  it('sends the rule, the request and the answer, and marks a file cut short', () => {
    const source = ruleSource(SKILL, ruleText(0))
    if (!source) throw new Error('no rule')
    const { system, user } = fixPrompt({
      rule: source,
      request: 'Write the launch note for Shelf.',
      answer: [{ path: 'outputs/output.md', text: 'Shelf is here.', cut: true }],
    })
    expect(system).toContain('return the rule unchanged')
    expect(user).toContain('<rule name="Rules">\n- Open with the headline')
    expect(user).toContain('<request>\nWrite the launch note for Shelf.\n</request>')
    expect(user).toContain(
      '<file name="outputs/output.md">\nShelf is here.\n[cut here: the file goes on]',
    )
  })

  it('says so when the answer wrote nothing to read', () => {
    const source = ruleSource(SKILL, ruleText(0))
    if (!source) throw new Error('no rule')
    const { user } = fixPrompt({ rule: source, request: 'Write it.', answer: [] })
    expect(user).toContain('The answer wrote no file that can be read as text.')
  })
})

describe('fixDraftOf', () => {
  const source = ruleSource(SKILL, ruleText(0))
  if (!source) throw new Error('no rule')

  it('reads the reason and the revision, with the list mark kept', () => {
    const raw = JSON.stringify({
      why: 'The note opens with the product name.',
      revision: 'Open with the headline.',
    })
    expect(fixDraftOf(raw, source)).toEqual({
      why: 'The note opens with the product name.',
      revision: '- Open with the headline.',
    })
  })

  it('throws on a reply cut off or with no fix', () => {
    expect(() => fixDraftOf('{"why": "x"', source)).toThrow('cut off')
    expect(() => fixDraftOf(JSON.stringify({ why: '', revision: 'x' }), source)).toThrow('no fix')
  })

  it('round-trips through the run text, and knows a rule left as it was', () => {
    const draft = { why: 'It followed the rule.', revision: `${source.text}\n` }
    expect(readFixText(fixText(draft))).toEqual(draft)
    expect(readFixText('not json')).toBeNull()
    expect(unchanged(source, draft)).toBe(true)
    expect(unchanged(source, { ...draft, revision: '- Open with the headline.' })).toBe(false)
  })
})

describe('fixVersionName', () => {
  it('names the version by the rule’s first six words', () => {
    expect(fixVersionName('- Open with the headline and nothing before it.')).toBe(
      'Fix: Open with the headline and nothing…',
    )
    expect(fixVersionName('- **Quote** the brief, always.')).toBe('Fix: Quote the brief, always')
  })
})
