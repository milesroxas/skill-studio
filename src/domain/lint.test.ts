import { describe, expect, it } from 'vitest'
import {
  lintRule,
  lintScene,
  proseWords,
  type RuleScene,
  ruleCount,
  rulesIn,
  sceneOf,
  worthChecking,
} from './lint.ts'
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

  it('takes a count over things as no answer to a hedge, and an absolute as none to how much', () => {
    // "each" says how many paragraphs, not how short.
    const each = lintScene(scene('- Try to keep each paragraph reasonably short. Readers skim.'))
    expect(each.map((f) => [f.principle, f.quote])).toEqual([['strict', 'reasonably']])
    // "always" does not say how short either; a number does, in figures or in words.
    expect(principles('- Always keep the title reasonably short. Readers skim.')).toEqual([
      'strict',
    ])
    expect(
      principles('- Keep the title reasonably short, two lines at most. Readers skim.'),
    ).toEqual([])
    // A hedge about effort beside an absolute is a question for Jev.
    expect(principles('- Never open with the date where possible. Readers skim.')).toEqual([])
    expect(principles('- Put the title first if possible. Readers skim.')).toEqual(['strict'])
  })

  it('wants a reason unless the bullet already gives one', () => {
    expect(principles('- Never add a sign-off.')).toContain('why')
    expect(principles('- Never add a sign-off: the sender signs it themselves.')).not.toContain(
      'why',
    )
    expect(principles('- Never add a sign-off. The sender signs it themselves.')).not.toContain(
      'why',
    )
    expect(principles('- Set the status bar to 9:41, so every shot matches.')).not.toContain('why')
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

  it('says when a rule asks for more things than one answer can mark', () => {
    const many = lintScene(
      scene(
        '- Set the status bar to 9:41, full signal and a full battery, with no notifications, cursor, scrollbars or debug overlays, so every shot matches.',
      ),
    )
    expect(many.map((f) => f.message)).toContain(
      'This rule asks for several things, and Jev marks them with one answer. Make each a rule of its own to see which one an output missed.',
    )
    // A long rule that asks one thing: the commas and the "when" of its why are not things asked.
    expect(
      principles(
        '- Name the version, the platform and the date a fix shipped in the first sentence of every note, always, because support staff search release notes by those three facts when a customer writes in, and a note that buries any one of them gets missed.',
      ),
    ).toEqual([])
    // A bound's "or" is no second thing, and the why after the rule is not counted.
    expect(
      principles(
        '- Animate only transform and opacity, 300ms or less, with an ease-out curve. Anything else drops frames, stutters, or janks on scroll.',
      ),
    ).toEqual([])
  })

  it('sets no limit on a rule’s words, and says when its file is long', () => {
    // A rule is as long as what it says needs: a count of words is no finding.
    const words = Array.from({ length: 65 }, (_, i) => `word${i}`).join(' ')
    expect(principles(`- Always ${words}. Readers need each one.`)).toEqual([])
    expect(lintScene(scene(`- ${PRACTICE_EDIT.good}`, { band: 'long' }))).toHaveLength(1)
    const over = lintScene(scene(`- ${PRACTICE_EDIT.good}`, { band: 'over' }))[0]
    expect(over.message).toContain('500 lines')
    expect(over.dimension).toBe('file')
    // The number in the margin reads the rule alone, whatever its file's length.
    expect(lintRule(`- ${PRACTICE_EDIT.good}`)).toEqual([])
  })

  it('flags a phrase that adds words and changes nothing, and quotes it', () => {
    const found = lintScene(
      scene('- In order to date the note, always write the day first. Readers sort by it.'),
    )
    expect(found.map((f) => [f.dimension, f.quote])).toEqual([['length', 'in order to']])
    expect(found[0].message).toBe('“in order to” adds words and changes nothing. Cut it.')
    // Cut, the finding is gone: the fix clears what the check found.
    expect(
      principles('- To date the note, always write the day first. Readers sort by it.'),
    ).toEqual([])
    // The longer phrase is the one quoted, and a quoted phrase is a mention.
    expect(
      lintScene(scene('- Always date it, due to the fact that readers sort by day.')).find(
        (f) => f.dimension === 'length',
      )?.quote,
    ).toBe('due to the fact that')
    expect(
      principles('- Never write "please" or "in order to" in a rule. They add nothing.'),
    ).toEqual([])
    // "A note that opens" is a noun, and "Feel free to" grants a leave: neither is filler.
    expect(
      principles('- Lead with the change, always. A note that opens on it reads fast.'),
    ).toEqual([])
  })

  it('names the one word several words stand for', () => {
    const found = lintScene(
      scene('- Always date the note prior to the title, so a reader is able to sort by it.'),
    )
    expect(found.map((f) => [f.dimension, f.quote])).toEqual([['length', 'is able to']])
    expect(found[0].message).toBe('“is able to” says “can” in more words. Use the one word.')
    expect(
      principles('- Always date the note before the title, so a reader can sort by it.'),
    ).toEqual([])
  })

  it('counts the rules and the words of a passage', () => {
    expect(ruleCount('- Open with the name, always.\n- Never add a sign-off, ever.')).toBe(2)
    expect(ruleCount('Some prose about the skill.')).toBe(0)
    expect(proseWords('- Open with the name.\n  - Never sign off.')).toBe(7)
  })

  it('reads a quoted word as a mention, not a hedge', () => {
    expect(
      principles(
        '- Never write "reasonably" or "where appropriate": they leave the line to the agent.',
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
    const rule = SNIPPETS.find((s) => s.id === 'rule')?.text.replaceAll('|', '') ?? ''
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

describe('a word in the verb’s place', () => {
  it('reads the word a rule opens with as its verb, not as a quality of the result', () => {
    const rule = '- Clear the build cache before every run because stale files break the check.'
    expect(lintScene(scene(rule))).toEqual([])
    expect(
      principles('- Clean up every temp file you made, so the next run starts fresh.'),
    ).toEqual([])
    // The same word further in is still a quality.
    expect(principles('- Keep the summary clear, so a reader gets it in one pass.')).toEqual([
      'process',
    ])
  })

  it('reads an opening word that cannot be a verb as the quality it names', () => {
    for (const rule of [
      '- Concise answers only, under 50 words, so the reader sees the answer at once.',
      '- Clearly state the change in the first line, so the reader sees it at once.',
      '- Good names for every variable, never one letter, so a reader can follow it.',
    ])
      expect(principles(rule), rule).toEqual(['process'])
    expect(principles('- Feel free to add one example, never two, so it stays short.')).toEqual([])
  })

  it('counts a nested bullet indented with a tab as nested', () => {
    const rule =
      '- Always write two sentences exactly, so it is read.\n\t- unless the case says one'
    expect(lintScene(scene(rule)).map((f) => f.dimension)).toContain('complexity')
  })
})

describe('reasons and named words', () => {
  const messages = (rule: string) => lintRule(rule).map((f) => f.message)

  it('counts the branches of a rule that says otherwise', () => {
    const rule =
      '- If the user asks for a table, write one; otherwise write a list, or when there is one item, a sentence, unless they said plain text, because tables cost room.'
    expect(messages(rule).some((m) => /holds \d+ conditions/.test(m))).toBe(true)
  })

  it('counts what a rule asks when it opens with its reason', () => {
    const rule =
      '- Because readers skim, keep the title, the lede, the summary, the byline, the date and the tags on one screen.'
    expect(messages(rule).some((m) => m.includes('several things'))).toBe(true)
  })

  it('does not mark a word the rule only names', () => {
    for (const rule of [
      '- Never write `please` or `basically` in a reply because they add nothing.',
      "- Never write 'please' in a reply because it adds nothing to it.",
      '- Never write ‘please’ in a reply because it adds nothing to it.',
    ])
      expect(messages(rule).filter((m) => m.includes('adds words'))).toEqual([])
  })

  it('still marks a filler word a rule with an apostrophe uses', () => {
    const rule =
      "- Don't answer before the user's file is read, and please keep it short because they skim."
    expect(messages(rule).some((m) => m.includes('adds words'))).toBe(true)
  })
})
