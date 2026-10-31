import { describe, expect, it } from 'vitest'
import { rulesFromList, rulesFromSkill } from './rules.ts'

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

  it('folds a nested bullet into its parent rule', () => {
    const nested = rulesFromSkill('- Name every file you touch\n  - including generated files\n')
    expect(nested).toHaveLength(1)
    expect(nested[0].text).toBe('Name every file you touch - including generated files')
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
