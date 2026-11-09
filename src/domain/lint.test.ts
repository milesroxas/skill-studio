import { describe, expect, it } from 'vitest'
import { lintScene, type RuleScene, rulesIn, sceneOf, worthChecking } from './lint.ts'
import { applyPracticeEdit, PRACTICE, PRACTICE_EDIT } from './practice.ts'
import { EXAMPLE_KINDS, SNIPPETS, TEMPLATES, templateBody } from './templates.ts'

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

  it('reads the rule in the first sentence, and lets the why name an outcome or a thing', () => {
    expect(
      principles(
        '- Lead with the change, never the background. A note that opens on it feels slow.',
      ),
    ).toEqual([])
    expect(
      principles('- Set every colour on :root first. A token is a value named once for the page.'),
    ).toEqual([])
  })

  it('leaves a bare rule with no number or absolute to the judge', () => {
    expect(principles('- Open with the name. The sender signs it themselves.')).not.toContain(
      'strict',
    )
    // A hedge beside a number is a question for the judge too, not a finding code is sure of.
    expect(principles('- Keep it to 20 words where possible. Longer notes are skimmed.')).toEqual(
      [],
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

  it('reads a definition as a line that changes nothing, and an instruction as none', () => {
    expect(principles('- A modal is a dialog that blocks the page until it is closed.')).toContain(
      'earns',
    )
    expect(
      principles('- Read the code you are about to change before you propose a change. Why.'),
    ).not.toContain('earns')
    expect(principles('- Name the files you changed. The reader is the one who reviews.')).toEqual(
      [],
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
    // A list of four things is one instruction, not four conditions.
    expect(
      principles(
        '- Start every page with a doctype, a lang, a title and a viewport meta. Without them it renders in quirks mode, reads wrong, or zooms.',
      ),
    ).toEqual([])
  })

  it('measures the rule and the file', () => {
    const words = Array.from({ length: 65 }, (_, i) => `word${i}`).join(' ')
    expect(principles(`- Always ${words}.`)).toContain('length')
    expect(lintScene(scene(`- ${PRACTICE_EDIT.good}`, { band: 'long' }))).toHaveLength(1)
    expect(lintScene(scene(`- ${PRACTICE_EDIT.good}`, { band: 'over' }))[0].message).toContain(
      '500 lines',
    )
  })

  it('reads a quoted word as a mention, not a hedge', () => {
    expect(
      principles(
        '- Never write "reasonably" or "where appropriate": they give the agent nothing to act on.',
      ),
    ).not.toContain('strict')
  })

  it('skips headings, numbered steps, prose and code in either fence', () => {
    expect(
      lintScene(
        scene(
          '## Rules\n\nTry to be reasonably nice here.\n\n1. Read it reasonably.\n\n```\n- try to be nice\n```\n\n~~~md\n- try to be reasonable\n```\n- still inside the tildes, reasonably\n~~~\n',
        ),
      ),
    ).toEqual([])
  })

  it('finds nothing in the templates, the rule snippet and the practice skill’s good rules', () => {
    for (const t of TEMPLATES)
      expect(lintScene(scene(templateBody(t, 'release-notes'))), t.id).toEqual([])
    expect(EXAMPLE_KINDS.length).toBeGreaterThan(0)
    const rule = SNIPPETS.find((s) => s.id === 'rule')?.text.replace('|', '') ?? ''
    expect(lintScene(scene(rule))).toEqual([])
    const practice = templateBody(PRACTICE, PRACTICE.name)
    expect(lintScene(scene(practice)).length).toBeGreaterThan(0)
    expect(lintScene(scene(applyPracticeEdit(practice) ?? ''))).toEqual([])
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

  it('reads prose as no rule at all', () => {
    expect(rulesIn('One line.\nTwo line.\n\nThree.')).toEqual([])
    expect(rulesIn('Is it a bug?\n  Yes: reproduce it.\n  No: plan.')).toEqual([])
  })

  it('ends a bullet at a prose line', () => {
    expect(
      rulesIn('- A rule here now.\nProse after it.\n- Another rule now.').map((u) => u.text),
    ).toEqual(['A rule here now.', 'Another rule now.'])
  })
})

describe('sceneOf', () => {
  const text =
    '# T\n\n## Rules\n\n- First rule here now.\n- Second rule here now.\n- Third rule here now.\n'

  it('widens a selection inside one line to the line', () => {
    const from = text.indexOf('rule here')
    const made = sceneOf(text, { from, to: from + 9 }, 'd')
    expect(made.selection).toBe('- First rule here now.')
    expect(made.from).toBe(text.indexOf('- First'))
    expect(made.to).toBe(text.indexOf('- Second') - 1)
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
  it('needs four words, a list marker not counted', () => {
    expect(worthChecking('one two three')).toBe(false)
    expect(worthChecking('one two three four')).toBe(true)
    expect(worthChecking('- one two three')).toBe(false)
    expect(worthChecking('1. one two three four')).toBe(true)
  })
})
