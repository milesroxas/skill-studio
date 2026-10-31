import { describe, expect, it } from 'vitest'
import { assertSafe, assertSafePath } from './fs.ts'

describe('assertSafe', () => {
  it('returns a plain name', () => {
    expect(assertSafe('run-1.2_x', 'run')).toBe('run-1.2_x')
  })

  it.each(['', null, undefined, '.', '..', '.hidden', 'a/b', 'a\\b', 'a b', '-flag'])(
    'rejects %j',
    (value) => {
      expect(() => assertSafe(value, 'run')).toThrow('Bad run.')
    },
  )
})

describe('assertSafePath', () => {
  it('accepts nested safe segments', () => {
    expect(assertSafePath('references/style/tone.md', 'path')).toBe('references/style/tone.md')
  })

  it.each([
    '',
    null,
    '../SKILL.md',
    'references/../../etc/passwd',
    'references/./x.md',
    '/etc/passwd',
    'references//x.md',
    'references/',
    'references/.env',
    'C:\\Windows',
  ])('rejects %j', (value) => {
    expect(() => assertSafePath(value, 'path')).toThrow('Bad path.')
  })
})
