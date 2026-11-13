import { describe, expect, it } from 'vitest'
import { bulletsOf, rulesFromList, rulesFromSkill, scanRules } from './rules.ts'

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

  it('leaves out a blank rule and one said twice, which would share one answer', () => {
    expect(
      rulesFromList(['', '  ', 'Same rule here.', ' Same rule here. ']).map((r) => r.text),
    ).toEqual(['Same rule here.'])
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

describe('what is and is not a bullet', () => {
  it('reads nothing inside an HTML comment, on one line or over several', () => {
    const md = [
      '- Always lead with the answer here.',
      '<!-- - A rule on one commented line. -->',
      '<!--',
      '- A rule set aside for now.',
      '- Another one set aside too. -->',
      '- Never end with a question here.',
    ].join('\n')
    expect(rulesFromSkill(md).map((r) => r.text)).toEqual([
      'Always lead with the answer here.',
      'Never end with a question here.',
    ])
  })

  it('leaves a comment out of the bullet it sits in, and reads on', () => {
    const md = '- Always lead with the answer\n  <!-- todo: say why -->\n  in the first line.\n'
    expect(rulesFromSkill(md).map((r) => r.text)).toEqual([
      'Always lead with the answer in the first line.',
    ])
  })

  it('reads a bullet up to three spaces in as top-level, as Markdown does', () => {
    const scan = scanRules(
      [
        ' - One space in is a rule.',
        '  - Two spaces in is a rule.',
        '   * Three spaces in is a rule.',
        '    - Four spaces in is code.',
      ].join('\n'),
    )
    expect(scan.rules.map((r) => r.text)).toEqual([
      'One space in is a rule.',
      'Two spaces in is a rule.',
      'Three spaces in is a rule.',
    ])
    expect(scan.spans).toEqual([
      { from: 1, to: 1 },
      { from: 2, to: 2 },
      { from: 3, to: 3 },
    ])
  })

  it('reads a bullet one space in, under a bullet at the margin, as a rule of its own', () => {
    const md = '- Always lead with the answer.\n - Never end with a question.\n'
    expect(rulesFromSkill(md).map((r) => r.text)).toEqual([
      'Always lead with the answer.',
      'Never end with a question.',
    ])
  })

  it('reads an indented list under a line of prose, with its own nested bullets as clauses', () => {
    const md =
      'When you write:\n  - Name every file you touch\n    - and lock files\n  - Keep the note under forty words.\n'
    expect(rulesFromSkill(md).map((r) => r.text)).toEqual([
      'Name every file you touch; and lock files',
      'Keep the note under forty words.',
    ])
  })

  it('never reads a bullet under a numbered step, or under a bullet a blank line closed', () => {
    const md = [
      '1. Read the request first.',
      '   - A detail of the first step.',
      '',
      '   - Another detail of that step.',
      '+ A plus item is no rule.',
      '  - Nor is a detail under it.',
      '- Always lead with the answer.',
      '',
      '  - A detail after a blank line.',
      '',
      'A paragraph ends the list.',
      '  - Now an indented bullet stands alone.',
    ].join('\n')
    expect(rulesFromSkill(md).map((r) => r.text)).toEqual([
      'Always lead with the answer.',
      'Now an indented bullet stands alone.',
    ])
  })

  it('counts a bullet written twice once, and says the second is not checked again', () => {
    const scan = scanRules(
      '- Always lead with the answer.\n- Keep it short and plain.\n- Always lead with the **answer**.\n',
    )
    expect(scan.rules.map((r) => [r.id, r.text])).toEqual([
      ['r1', 'Always lead with the answer.'],
      ['r2', 'Keep it short and plain.'],
    ])
    expect(scan.spans).toHaveLength(2)
    expect(scan.skipped).toEqual([{ line: 3, reason: 'repeat' }])
  })

  it('reads an indented thematic break as a break', () => {
    expect(scanRules('  - - -\n\n- Always write two sentences exactly.\n').skipped).toEqual([])
  })

  it('reads a thematic break as a break, not a bullet too short to be a rule', () => {
    const scan = scanRules('# S\n\n* * *\n\n- - -\n\n- Always write two sentences exactly.\n')
    expect(scan.rules.map((r) => r.text)).toEqual(['Always write two sentences exactly.'])
    expect(scan.skipped).toEqual([])
  })

  it('joins a nested bullet indented with a tab', () => {
    const scan = scanRules('- Always write two sentences exactly.\n\t- unless the case says one\n')
    expect(scan.rules[0].text).toBe('Always write two sentences exactly. unless the case says one')
    expect(scan.spans).toEqual([{ from: 1, to: 2 }])
  })

  it('reads on past a line that opens with inline code in three backticks', () => {
    const md = '```code``` is inline here\n\n- Always write two sentences exactly.\n'
    expect(rulesFromSkill(md).map((r) => r.text)).toEqual(['Always write two sentences exactly.'])
  })

  it('gives each bullet its lines as written and the heading it stands under', () => {
    const lines = [
      'intro',
      '- one',
      '  more',
      '',
      '## Next',
      '* two',
      '1. a step',
      '~~~',
      '- code',
      '~~~',
    ]
    expect(bulletsOf(lines)).toEqual([
      { from: 1, to: 2, lines: ['- one', '  more'], section: null },
      { from: 5, to: 5, lines: ['* two'], section: 'Next' },
    ])
  })
})
