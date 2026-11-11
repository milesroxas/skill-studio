import { describe, expect, it } from 'vitest'
import { rulesFromSkill } from './rules.ts'
import {
  applyTemplate,
  CHECK_EXAMPLES,
  EXAMPLE_KINDS,
  fittingTemplate,
  insertAt,
  isScaffold,
  referenceTemplate,
  SNIPPETS,
  TEMPLATE_IDS,
  TEMPLATES,
  templateBody,
  templateById,
  templateForPacks,
} from './templates.ts'
import { frontMatterBlock, isSlug } from './text.ts'

const FRONT = '---\nname: notes\ndescription: Notes.\n---\n\n'

describe('templates', () => {
  it('lists every id once, blank first', () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual([...TEMPLATE_IDS])
    expect(TEMPLATES[0].id).toBe('blank')
    expect(templateById('nope').id).toBe('blank')
  })

  it('gives each kind at least four graded rules and the blank none', () => {
    for (const t of EXAMPLE_KINDS) {
      const rules = rulesFromSkill(templateBody(t, 'release-notes'))
      expect(rules.length, t.id).toBeGreaterThanOrEqual(4)
      // Steps and checklists are numbered, so only rules are graded.
      for (const r of rules) expect(r.text, t.id).not.toMatch(/^\d+\./)
    }
    expect(rulesFromSkill(templateBody(templateById('blank'), 'x'))).toEqual([])
  })

  it('titles the body from the skill name', () => {
    expect(templateBody(templateById('writing'), 'release-notes')).toMatch(/^# Release notes\n/)
  })

  it('writes sample cases the case folder accepts', () => {
    for (const t of EXAMPLE_KINDS) {
      expect(t.cases.length, t.id).toBeGreaterThanOrEqual(3)
      const ids = t.cases.map((c) => c.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const c of t.cases) {
        expect(isSlug(c.id), c.id).toBe(true)
        expect(c.prompt.trim().length).toBeGreaterThan(20)
        expect(c.expectedOutcome.trim().length).toBeGreaterThan(0)
        expect(c.graders.length).toBeGreaterThanOrEqual(2)
        for (const g of c.graders) expect(g.statement.trim().length).toBeGreaterThan(0)
        if (c.words) expect(c.words[1]).toBeGreaterThan(c.words[0])
      }
    }
  })

  it('pairs each kind with a judge pack beyond generic, and finds it from the bench', () => {
    for (const t of EXAMPLE_KINDS)
      expect(
        t.packs.some((p) => p !== 'generic'),
        t.id,
      ).toBe(true)
    expect(templateForPacks(['generic', 'code']).id).toBe('code')
    expect(templateForPacks(['generic']).id).toBe(EXAMPLE_KINDS[0].id)
    expect(fittingTemplate(['generic', 'code'])?.id).toBe('code')
    expect(fittingTemplate(['generic'])).toBeUndefined()
  })
})

describe('isScaffold', () => {
  it('is true for the blank scaffold and false once a rule is written', () => {
    const blank = applyTemplate(FRONT, templateById('blank'), 'notes')
    expect(isScaffold(blank)).toBe(true)
    expect(isScaffold(FRONT)).toBe(true)
    expect(isScaffold(`${blank}- Lead with the change for the reader.\n`)).toBe(false)
    expect(isScaffold(applyTemplate(FRONT, templateById('writing'), 'notes'))).toBe(false)
  })
})

describe('applyTemplate', () => {
  it('keeps the front matter and replaces the body', () => {
    const text = applyTemplate(
      `${FRONT}# Old\n\n- Old rule that stays graded.\n`,
      templateById('code'),
      'notes',
    )
    expect(frontMatterBlock(text)).toBe(frontMatterBlock(FRONT))
    expect(text).not.toMatch('Old rule')
    expect(text).toMatch('# Notes')
  })

  it('works with no front matter', () => {
    expect(applyTemplate('', templateById('design'), 'ui')).toMatch(/^# Ui\n/)
  })
})

describe('insertAt', () => {
  const rule = SNIPPETS.find((s) => s.id === 'rule')!
  const tree = SNIPPETS.find((s) => s.id === 'tree')!

  it('starts a block on its own line and puts the cursor at the marker', () => {
    const { text, cursor } = insertAt('## Rules\n\n- One.', 17, 17, tree)
    expect(text).toBe(
      '## Rules\n\n- One.\n## Which to choose\n\nIs the first question true?\n  Yes: do this.\n  No:\n    Is the second question true?\n      Yes: do that.\n      No: default.\n',
    )
    expect(text.slice(cursor, cursor + 5)).toBe('first')
  })

  it('replaces a selection and joins a list at a line start', () => {
    const { text, cursor } = insertAt('- a\n- b\n', 4, 7, rule)
    expect(text).toBe(
      '- a\n- What to do, numeric or absolute. Why it matters, in the same bullet.\n\n',
    )
    expect(text.slice(cursor, cursor + 4)).toBe('What')
  })

  it('never leaves a marker in the text', () => {
    for (const s of SNIPPETS) expect(insertAt('', 0, 0, s).text).not.toMatch('|')
  })
})

describe('check examples and reference template', () => {
  it('shows a vague check against one the judge can mark', () => {
    expect(CHECK_EXAMPLES.length).toBeGreaterThanOrEqual(3)
    for (const ex of CHECK_EXAMPLES) {
      expect(ex.bad).not.toBe(ex.good)
      expect(ex.why.length).toBeGreaterThan(10)
    }
  })

  it('titles a reference from its path and grades none of it', () => {
    const text = referenceTemplate('references/style-guide.md')
    expect(text).toMatch(/^# Style guide\n/)
    expect(rulesFromSkill(text)).toEqual([])
  })
})
