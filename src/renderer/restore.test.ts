import { describe, expect, it } from 'vitest'
import { restoreAsk } from './restore.ts'

describe('restoreAsk', () => {
  const ask = (changed: boolean, unsaved: string[]) =>
    restoreAsk({ version: 'v1', current: 'v3', changed, unsaved })

  it('asks plainly when every edit is kept in a version', () => {
    expect(ask(false, [])).toEqual({
      title: 'Restore v1?',
      description:
        'The skill’s files go back to v1. v3 stays in the list, so you can return to it.',
      action: 'Restore',
    })
  })

  it('warns that unsaved edits are lost, naming the file', () => {
    expect(ask(false, ['SKILL.md'])).toMatchObject({
      title: 'Restore v1 and lose your unsaved edits?',
      description:
        'Your unsaved edits to SKILL.md are lost. v3 stays in the list, so you can return to it.',
      destructive: true,
    })
    expect(ask(false, ['SKILL.md', 'references/a.md']).description).toMatch(
      /^Your unsaved edits to 2 files are lost\./,
    )
  })

  it('warns about saved and unsaved edits since the last run together', () => {
    expect(ask(true, [])).toMatchObject({
      title: 'Restore v1 and lose your latest edits?',
      description:
        'Your edits since the last run are kept nowhere else. Run them first to keep them as a version.',
      destructive: true,
    })
    expect(ask(true, ['SKILL.md']).description).toBe(
      'Your edits since the last run, saved or not, are kept nowhere else. Save and run them first to keep them as a version.',
    )
  })
})
