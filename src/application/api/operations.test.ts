import { describe, expect, it } from 'vitest'
import type { Contract } from './contract.ts'
import { isOperation, isShellOperation, parsers } from './operations.ts'

describe('parsers', () => {
  it('cover every operation in the contract', () => {
    const names: Array<keyof Contract> = Object.keys(parsers) as Array<keyof Contract>
    for (const name of names) expect(isOperation(name)).toBe(true)
    expect(isOperation('nope')).toBe(false)
    expect(isOperation(42)).toBe(false)
  })

  it('keep the settings operations for the shell', () => {
    expect(isShellOperation('settings.read')).toBe(true)
    expect(isShellOperation('settings.jevKey')).toBe(true)
    expect(isShellOperation('skill.state')).toBe(false)
  })

  it('refuse run and sample names that could leave the folder', () => {
    expect(() => parsers['skill.run']({ skill: '/s', run: '../x' })).toThrow('Bad run.')
    expect(() =>
      parsers['skill.artifact']({ skill: '/s', run: 'r', sample: 's', file: '../a' }),
    ).toThrow('Bad file.')
    expect(
      parsers['skill.artifact']({ skill: '/s', run: 'r', sample: 's', file: 'outputs/a.md' }),
    ).toEqual({
      skill: '/s',
      run: 'r',
      sample: 's',
      file: 'outputs/a.md',
    })
  })

  it('coerce a generate request and bound its writers', () => {
    const input = parsers['skill.generate']({
      skill: '/s',
      cases: ['a', 1],
      configs: Array.from({ length: 6 }, () => ({ engine: 'claude', model: 'sonnet' })),
      samples: 'two',
      configuration: 'without_skill',
      grade: false,
    })
    expect(input.cases).toEqual(['a', '1'])
    expect(input.configs).toHaveLength(4)
    expect(input.configs[0]).toEqual({ engine: 'claude', model: 'sonnet', effort: '' })
    expect(input.samples).toBe(1)
    expect(input.configuration).toBe('without_skill')
    expect(input.grade).toBe(false)
    expect(() => parsers['skill.generate']({ configuration: 'sideways' })).toThrow(
      'Bad configuration.',
    )
  })

  it('accept only known votes, labels and agents', () => {
    expect(() => parsers['skill.preference']({ a: 'r/s', b: 'r/t', vote: 'maybe' })).toThrow(
      'Bad vote.',
    )
    expect(() => parsers['skill.anchor']({ label: 'meh' })).toThrow('Bad label.')
    expect(() => parsers['library.link']({ path: '/p', agent: 'emacs' })).toThrow('Bad agent.')
    expect(parsers['library.link']({ path: '/p', agent: 'codex' }).scope).toBe('user')
  })
})
