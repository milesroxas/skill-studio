import { describe, expect, it } from 'vitest'
import { lintScene, type RuleScene, rulesIn, sceneOf, worthChecking } from './lint.ts'
import { PRACTICE_EDIT } from './practice.ts'

const scene = (selection: string, more: Partial<RuleScene> = {}): RuleScene => ({
  selection,
  before: '',
  after: '',
  description: 'Writes a short thank-you note.',
  band: 'fine',
  ...more,
})

const principles = (selection: string) =>
  lintScene(scene(selection)).map((f) => f.principle ?? f.dimension)

describe('lintScene', () => {
  it('flags the walkthrough’s vague rule and passes the exact one', () => {
    const bad = lintScene(scene(`- ${PRACTICE_EDIT.bad}`))
    expect(bad.map((f) => f.principle)).toContain('strict')
    expect(bad.find((f) => f.principle === 'strict')?.quote).toBe('reasonable')
    expect(lintScene(scene(`- ${PRACTICE_EDIT.good}`))).toEqual([])
  })

  it('reads an outcome adjective as a missing step', () => {
    expect(principles('- Keep the note clear and natural, under 40 words.')).toEqual(
      expect.arrayContaining(['process', 'why']),
    )
  })

  it('wants a reason unless the bullet already gives one', () => {
    expect(principles('- Never add a sign-off.')).toContain('why')
    expect(principles('- Never add a sign-off: the sender signs it themselves.')).not.toContain(
      'why',
    )
    expect(principles('- Never add a sign-off. The sender signs it themselves.')).not.toContain(
      'why',
    )
  })

  it('reads a definition as a line that changes nothing', () => {
    expect(principles('- A modal is a dialog that blocks the page until it is closed.')).toContain(
      'earns',
    )
  })

  it('counts nested bullets and piled conditions as complexity', () => {
    expect(
      principles('- Always open with the name.\n  - Unless there is none.\n  - Or two.'),
    ).toContain('complexity')
    expect(
      principles(
        '- If the request names a person and the note is short, or when it is long but formal, open with the name unless it is a group, and never sign off.',
      ),
    ).toContain('complexity')
  })

  it('measures the rule and the file', () => {
    const words = Array.from({ length: 65 }, (_, i) => `word${i}`).join(' ')
    expect(principles(`- Always ${words}.`)).toContain('length')
    expect(lintScene(scene(`- ${PRACTICE_EDIT.good}`, { band: 'long' }))).toHaveLength(1)
    expect(lintScene(scene(`- ${PRACTICE_EDIT.good}`, { band: 'over' }))[0].message).toContain(
      '500 lines',
    )
  })

  it('skips headings, numbered steps and code', () => {
    expect(
      lintScene(scene('## Rules\n\n1. Read it reasonably.\n\n```\ntry to be nice\n```\n')),
    ).toEqual([])
  })
})

describe('rulesIn', () => {
  it('joins a bullet with its indented lines and strips the marks', () => {
    expect(rulesIn('- **Open** with the `name`\n  and nothing else.\n- Second rule here.')).toEqual(
      [
        {
          raw: '- **Open** with the `name`\n  and nothing else.',
          text: 'Open with the name and nothing else.',
        },
        { raw: '- Second rule here.', text: 'Second rule here.' },
      ],
    )
  })

  it('reads a paragraph as one unit', () => {
    expect(rulesIn('One line.\nTwo line.\n\nThree.').map((u) => u.text)).toEqual([
      'One line. Two line.',
      'Three.',
    ])
  })
})

describe('sceneOf', () => {
  const text =
    '# T\n\n## Rules\n\n- First rule here now.\n- Second rule here now.\n- Third rule here now.\n'

  it('keeps a selection inside one line as it is', () => {
    const from = text.indexOf('rule here')
    const made = sceneOf(text, { from, to: from + 9 }, 'd')
    expect(made.selection).toBe('rule here')
    expect(made.from).toBe(from)
  })

  it('widens a selection across lines to whole lines, without the closing newline', () => {
    const from = text.indexOf('rule here now.\n- Second') + 3
    const to = text.indexOf('- Third')
    const made = sceneOf(text, { from, to }, 'd')
    expect(made.selection).toBe('- First rule here now.\n- Second rule here now.')
    expect(made.before).toBe('# T\n## Rules')
    expect(made.after).toBe('- Third rule here now.')
    expect(made.band).toBe('fine')
    expect(made.description).toBe('d')
  })
})

describe('worthChecking', () => {
  it('needs four words', () => {
    expect(worthChecking('one two three')).toBe(false)
    expect(worthChecking('one two three four')).toBe(true)
  })
})
