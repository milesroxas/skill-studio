import { describe, expect, it } from 'vitest'
import { newCaseId } from './case-draft.ts'
import { isSlug } from './text.ts'

describe('newCaseId', () => {
  it('names a case after its title', () => {
    expect(newCaseId({ title: 'A colleague covered a shift', prompt: 'Thank Priya.' }, [])).toBe(
      'a-colleague-covered-a-shift',
    )
  })

  it('names a case with no title after the first words of its prompt', () => {
    const id = newCaseId(
      { title: '', prompt: 'Thank Priya for covering my on-call shift on Saturday.' },
      [],
    )
    expect(id).toBe('thank-priya-for-covering-my-on-call')
    expect(isSlug(id)).toBe(true)
  })

  it('adds a number when a case already has the id', () => {
    const draft = { title: 'Intro', prompt: 'x' }
    expect(newCaseId(draft, ['intro'])).toBe('intro-2')
    expect(newCaseId(draft, ['intro', 'intro-2'])).toBe('intro-3')
  })

  it('still names a case whose words hold no letter or digit', () => {
    expect(newCaseId({ title: '', prompt: '¿¡…!?' }, [])).toBe('case')
    expect(newCaseId({ title: '', prompt: '' }, ['case'])).toBe('case-2')
  })
})
