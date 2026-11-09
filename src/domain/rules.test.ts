import { describe, expect, it } from 'vitest'
import { rulesFromList, rulesFromSkill, scanRules } from './rules.ts'

const skill = `---
name: tidy-writer
description: - this front matter line looks like a bullet but is not one
---

# Tidy writer

- Lead with the **answer** in the first sentence.
- Short

## Formatting

* Use \`code\` spans for file names and commands.
- Wrap long bullets onto the next line
  and keep them as one rule.
- [Style guide](https://example.com)

\`\`\`md
- A bullet inside a code block is an example, not a rule.
\`\`\`

### Links

- Link to the [house style](docs/style.md) when you cite it.
`

describe('rulesFromSkill', () => {
  const rules = rulesFromSkill(skill)

  it('takes bullets in order with sequential ids', () => {
    expect(rules.map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r4'])
  })

  it('strips bold, code and link markup', () => {
    expect(rules[0].text).toBe('Lead with the answer in the first sentence.')
    expect(rules[1].text).toBe('Use code spans for file names and commands.')
    expect(rules[3].text).toBe('Link to the house style when you cite it.')
  })

  it('tags each rule with the nearest heading above it', () => {
    expect(rules.map((r) => r.section)).toEqual([
      'Tidy writer',
      'Formatting',
      'Formatting',
      'Links',
    ])
  })

  it('joins indented continuation lines into one rule', () => {
    expect(rules[2].text).toBe('Wrap long bullets onto the next line and keep them as one rule.')
  })

  it('skips front matter, code blocks, link-only and short bullets', () => {
    const texts = rules.map((r) => r.text).join('\n')
    expect(texts).not.toMatch(/front matter|code block|Style guide|Short/)
  })

  it('uses SKILL.md as the section before any heading', () => {
    expect(rulesFromSkill('- Always write in plain English please.')[0].section).toBe('SKILL.md')
  })

  it('folds nested bullets into their parent rule as clauses, without list markers', () => {
    const nested = rulesFromSkill(
      '- Name every file you touch\n  - including generated files\n  1. and lock files\n- Ease these elements in:\n  * modals and sheets\n',
    )
    expect(nested.map((r) => r.text)).toEqual([
      'Name every file you touch; including generated files; and lock files',
      'Ease these elements in: modals and sheets',
    ])
  })

  it('reads a skill saved with Windows line endings', () => {
    const crlf = rulesFromSkill(skill.replace(/\n/g, '\r\n'))
    expect(crlf).toEqual(rules)
  })

  it('skips bullets inside a tilde fence, and inside a backtick fence that holds tildes', () => {
    const fenced = [
      '- Always lead with the answer here.',
      '~~~md',
      '- A bullet inside a tilde fence is an example.',
      '```',
      '- Still inside: backticks do not close a tilde fence.',
      '~~~~',
      '- Outside again: a longer fence of the same character closed it.',
      '````',
      '~~~',
      '- A tilde fence inside four backticks is text.',
      '````',
      '- Never end with a question here.',
    ].join('\n')
    expect(rulesFromSkill(fenced).map((r) => r.text)).toEqual([
      'Always lead with the answer here.',
      'Outside again: a longer fence of the same character closed it.',
      'Never end with a question here.',
    ])
  })

  it('returns nothing for a skill with no bullets', () => {
    expect(rulesFromSkill('# Title\n\nJust prose here.')).toEqual([])
  })
})

describe('rulesFromList', () => {
  it('trims each rule and tags it as from bench.json', () => {
    expect(rulesFromList(['  Be brief. '])).toEqual([
      { id: 'r1', text: 'Be brief.', section: 'bench.json rules' },
    ])
  })
})

describe('scanRules', () => {
  it('names the line of each rule, front matter included, and each bullet it skipped', () => {
    const scan = scanRules(skill)
    expect(scan.rules.map((r) => r.text)).toEqual(rulesFromSkill(skill).map((r) => r.text))
    // Line 8 is the first bullet: three front matter lines, a blank, the title and a blank before it.
    // The wrapped bullet on line 14 takes line 15 with it.
    expect(scan.spans).toEqual([
      { from: 8, to: 8 },
      { from: 13, to: 13 },
      { from: 14, to: 15 },
      { from: 24, to: 24 },
    ])
    expect(scan.skipped).toEqual([
      { line: 9, reason: 'short' },
      { line: 16, reason: 'link' },
    ])
  })

  it('counts lines from one when there is no front matter', () => {
    expect(scanRules('- One two three four.\n').spans).toEqual([{ from: 1, to: 1 }])
  })

  it('names the same lines when the file has Windows line endings', () => {
    const crlf = scanRules(skill.replace(/\n/g, '\r\n'))
    expect(crlf.spans).toEqual(scanRules(skill).spans)
    expect(crlf.skipped).toEqual(scanRules(skill).skipped)
  })
})
