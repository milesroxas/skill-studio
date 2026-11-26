import { describe, expect, it } from 'vitest'
import {
  breaksLine,
  caseName,
  inputEntries,
  isPicture,
  newCaseId,
  oneLineTitle,
  titleTaken,
  unusedTitle,
} from './case-draft.ts'
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

describe('case names', () => {
  const cases = [
    { id: 'tone-check', title: 'Tone check' },
    { id: 'untitled', title: 'untitled' },
  ]

  it('names a case by its title, or the start of its prompt, never its id', () => {
    expect(caseName({ id: 'tone-check', title: 'Tone check', prompt: 'Hi.' })).toBe('Tone check')
    expect(caseName({ id: 'write-a-note', title: 'write-a-note', prompt: 'Write a note.' })).toBe(
      'Write a note.',
    )
    expect(caseName({ id: 'x', title: '', prompt: 'Write a note about the move to Friday.' })).toBe(
      'Write a note about the move…',
    )
    expect(caseName({ id: 'x', title: '', prompt: ' ' })).toBe('x')
  })

  it('finds a title another case has, whatever its capitals', () => {
    expect(titleTaken(cases, ' TONE check ')).toBe(true)
    expect(titleTaken(cases, 'Tone check', 'tone-check')).toBe(false)
    // A case with no title of its own holds none.
    expect(titleTaken(cases, 'untitled')).toBe(false)
    expect(titleTaken(cases, ' ')).toBe(false)
  })

  it('reads a title as one line: every line break, tab and run of spaces one space', () => {
    expect(oneLineTitle('Tone\ncheck')).toBe('Tone check')
    expect(oneLineTitle(' Tone \r\n\r\n check\t2 ')).toBe('Tone check 2')
    expect(oneLineTitle('Tone\u0085check\u2028now\u00A0\u3000ok')).toBe('Tone check now ok')
    // A title that is only white space is none.
    expect(oneLineTitle(' \r\n\t\u0085 ')).toBe('')
    expect(caseName({ id: 'x', title: ' \r\n\t ', prompt: 'Write a note.' })).toBe('Write a note.')
    expect(caseName({ id: 'x', title: 'Tone\r\ncheck', prompt: 'Hi.' })).toBe('Tone check')
    // A long title keeps every word: there is no limit to cut it at.
    const long = Array.from({ length: 200 }, (_, n) => `word${n}`)
    expect(oneLineTitle(long.join('\r\n'))).toBe(long.join(' '))
  })

  it('tells a line break between words from white space at either end, or a tab', () => {
    expect(
      ['Tone\ncheck', 'Tone\r\ncheck', 'Tone\rcheck', 'Tone\u2028check'].map(breaksLine),
    ).toEqual([true, true, true, true])
    expect(
      ['Tone check\n', '\r\nTone check', 'Tone\tcheck', 'Tone  check', '\n'].map(breaksLine),
    ).toEqual([false, false, false, false, false])
  })

  it('finds a title another case has across a line break, a tab or a run of spaces', () => {
    expect(titleTaken(cases, 'Tone\ncheck')).toBe(true)
    expect(titleTaken(cases, 'tone\r\n  CHECK')).toBe(true)
    expect(titleTaken(cases, 'Tone\tcheck')).toBe(true)
    expect(titleTaken([{ id: 'a', title: 'Tone\ncheck' }], 'Tone check')).toBe(true)
    expect(titleTaken(cases, '\r\n\t')).toBe(false)
    expect(unusedTitle(cases, 'Tone\ncheck')).toBe('Tone check 2')
  })

  it('numbers a title another case has', () => {
    expect(unusedTitle(cases, 'Tone check')).toBe('Tone check 2')
    expect(
      unusedTitle([...cases, { id: 'tone-check-2', title: 'Tone check 2' }], 'Tone check'),
    ).toBe('Tone check 3')
    expect(unusedTitle(cases, 'Other ')).toBe('Other')
  })
})

describe('input files', () => {
  const dir = 'evals/cases/results'
  const c = {
    dir,
    files: [
      `${dir}/files/shot.png`,
      `${dir}/files/notes.md`,
      `${dir}/files/screens/a.tsx`,
      `${dir}/files/screens/logo.png`,
    ],
  }

  it('counts only an image right in files/ as a picture', () => {
    expect(c.files.filter((f) => isPicture(c, f))).toEqual([`${dir}/files/shot.png`])
    expect(isPicture({ dir: null }, 'evals/legacy.png')).toBe(true)
  })

  it('lists each file or folder, less the removed, with the added taking a name’s place', () => {
    const screens = { name: 'screens', upload: 'a'.repeat(24), files: 3, folder: true }
    expect(inputEntries(c, {})).toEqual([
      { name: 'notes.md', files: 1, folder: false, added: false },
      { name: 'screens', files: 2, folder: true, added: false },
    ])
    expect(inputEntries(c, { removed: ['notes.md'], added: [screens] })).toEqual([
      { name: 'screens', files: 3, folder: true, added: true },
    ])
  })
})
