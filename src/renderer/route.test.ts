import { describe, expect, it } from 'vitest'
import { entryOf, hashOf, placeOf } from './route.ts'

describe('placeOf', () => {
  it('reads the screen and its parameters', () => {
    const place = placeOf('#/compare?a=run-1%2Fone&b=')
    expect(place.screen).toBe('compare')
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
