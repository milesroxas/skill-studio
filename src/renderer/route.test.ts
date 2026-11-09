import { NEW_CASE_KEY } from '@domain/schemas.ts'
import { describe, expect, it } from 'vitest'
import { caseKey, entryOf, hashOf, openAt, placeOf } from './route.ts'

describe('placeOf', () => {
  it('reads the screen and its parameters', () => {
    const place = placeOf('#/results?a=run-1%2Fone&b=')
    expect(place.screen).toBe('results')
    expect(place.params.get('a')).toBe('run-1/one')
    expect(place.params.get('b')).toBe('')
  })

  it('is home when the hash names no screen', () => {
    expect(placeOf('').screen).toBe('home')
    expect(placeOf('#/').screen).toBe('home')
  })

  it('reads a renamed screen under its new id', () => {
    const place = placeOf('#/edit?file=SKILL.md')
    expect(place.screen).toBe('editor')
    expect(place.params.get('file')).toBe('SKILL.md')
  })

  it('opens the screen a retired screen’s work moved to, keeping what the address named', () => {
    const compare = placeOf('#/compare?a=run-1%2Fone&b=run-2%2Fone')
    expect(compare.screen).toBe('results')
    expect(compare.params.get('b')).toBe('run-2/one')
    for (const old of ['overview', 'generate', 'blind', 'transcript', 'insights', 'knobs'])
      expect(placeOf(`#/${old}`).screen).toBe('results')
    expect(placeOf('#/versions').screen).toBe('editor')
  })
})

describe('hashOf', () => {
  it('writes what placeOf reads', () => {
    const place = placeOf(hashOf('editor', { file: 'references/a b.md' }))
    expect(place.screen).toBe('editor')
    expect(place.params.get('file')).toBe('references/a b.md')
  })

  it('leaves the question mark off a screen with no parameters', () => {
    expect(hashOf('cases')).toBe('#/cases')
  })
})

describe('entryOf', () => {
  it('reads an entry the app wrote', () => {
    expect(entryOf({ index: 3, skill: '/skills/notes' })).toEqual({
      index: 3,
      skill: '/skills/notes',
    })
  })

  it('is null for a state the app did not write', () => {
    expect(entryOf(null)).toBeNull()
    expect(entryOf('3')).toBeNull()
    expect(entryOf({ index: '3', skill: '' })).toBeNull()
    expect(entryOf({ index: 3 })).toBeNull()
  })
})

describe('openAt', () => {
  const ids = ['shift', 'thanks']

  it('names the Editor file, SKILL.md by default', () => {
    expect(openAt(placeOf('#/editor?file=references/voice.md'), ids)).toEqual({
      file: 'references/voice.md',
      case: null,
    })
    expect(openAt(placeOf('#/editor'), ids).file).toBe('SKILL.md')
  })

  it('names the case Cases shows, as the screen picks it', () => {
    expect(openAt(placeOf('#/cases?id=thanks'), ids)).toEqual({ file: null, case: 'thanks' })
    expect(caseKey(new URLSearchParams('id=gone'), ids)).toBe('shift')
    expect(caseKey(new URLSearchParams('new=1'), ids)).toBe(NEW_CASE_KEY)
    expect(caseKey(new URLSearchParams(), [])).toBe(NEW_CASE_KEY)
  })

  it('names nothing elsewhere', () => {
    expect(openAt(placeOf('#/results?run=r1'), ids)).toEqual({ file: null, case: null })
  })
})
