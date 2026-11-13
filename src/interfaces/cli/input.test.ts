import { describe, expect, it } from 'vitest'
import { countOf, generateInputOf, openCommand, portOf, runNameOf, withHint } from './input.ts'

describe('countOf', () => {
  it('reads a whole number of one or more', () => {
    expect(countOf('3', '--samples')).toBe(3)
    expect(countOf(undefined, '--samples')).toBeUndefined()
  })

  it.each(['0', '-1', '1.5', 'many', '', 'NaN', 'Infinity'])('refuses %j', (value) => {
    expect(() => countOf(value, '--samples')).toThrow('--samples takes a whole number')
  })
})

describe('portOf', () => {
  it('reads a port, and refuses what is not one', () => {
    expect(portOf('4400', '--port')).toBe(4400)
    expect(portOf(undefined, '--port')).toBeUndefined()
    for (const value of ['0', '65536', 'http', '44.5'])
      expect(() => portOf(value, '--port')).toThrow('--port takes a port')
  })
})

describe('runNameOf', () => {
  it('takes the name of a run folder', () => {
    const name = '2026-11-09-skill-v2-claude-sonnet'
    expect(runNameOf(name, '--run')).toBe(name)
  })

  it.each(['../other', 'a/b', '/etc', '..', '', '.hidden', 'a b'])(
    'refuses %j, which could name a folder elsewhere',
    (value) => {
      expect(() => runNameOf(value, '--run')).toThrow('--run takes the name of a run')
    },
  )
})

describe('generateInputOf', () => {
  it('fills in what the flags leave out', () => {
    expect(generateInputOf('/skills/note', {})).toEqual({
      skill: '/skills/note',
      cases: [],
      configs: [{ engine: 'claude', model: '', effort: '' }],
      samples: 1,
      configuration: 'with_skill',
      baseline: null,
      skillName: null,
      note: '',
      grade: true,
    })
  })

  it('reads every flag', () => {
    expect(
      generateInputOf('/skills/note', {
        engine: 'cursor',
        model: 'gpt-5',
        effort: 'high',
        cases: 'a, b,,',
        samples: '2',
        configuration: 'old_skill',
        baseline: '2026-11-01-skill-v1-claude-sonnet',
        name: 'Shorter rules',
        note: 'cut the preamble',
      }),
    ).toMatchObject({
      cases: ['a', 'b'],
      configs: [{ engine: 'cursor', model: 'gpt-5', effort: 'high' }],
      samples: 2,
      configuration: 'old_skill',
      baseline: '2026-11-01-skill-v1-claude-sonnet',
      skillName: 'Shorter rules',
      note: 'cut the preamble',
    })
  })

  it('refuses a sample count that is not a whole number, or more than a run takes', () => {
    expect(() => generateInputOf('/s', { samples: 'two' })).toThrow('--samples takes a whole')
    expect(() => generateInputOf('/s', { samples: '0' })).toThrow('--samples takes a whole')
    expect(() => generateInputOf('/s', { samples: '500' })).toThrow(/at most|samples/i)
  })

  it('refuses a baseline that is a path, not a run', () => {
    expect(() =>
      generateInputOf('/s', { configuration: 'old_skill', baseline: '../../elsewhere' }),
    ).toThrow('--baseline takes the name of a run')
  })

  it('refuses a configuration there is none of, and names the ones there are', () => {
    expect(() => generateInputOf('/s', { configuration: 'new_skill' })).toThrow(
      '--configuration takes with_skill, without_skill, old_skill',
    )
  })
})

describe('openCommand', () => {
  const url = 'http://localhost:4400/?token=abc-DEF_123'

  it('uses each system’s own opener', () => {
    expect(openCommand('darwin', url)).toEqual({ command: 'open', args: [url], verbatim: false })
    expect(openCommand('linux', url)).toEqual({
      command: 'xdg-open',
      args: [url],
      verbatim: false,
    })
  })

  it('goes through cmd.exe on Windows, with an empty title before the quoted address', () => {
    expect(openCommand('win32', url)).toEqual({
      command: 'cmd',
      args: ['/c', 'start', '""', `"${url}"`],
      verbatim: true,
    })
  })
})

describe('withHint', () => {
  it('names --no-jev when the TypeSafe key is missing', () => {
    expect(withHint('TYPESAFE_API_KEY is not set.')).toBe(
      'TYPESAFE_API_KEY is not set. Add TYPESAFE_API_KEY to .env, or pass --no-jev to grade with code checks only.',
    )
    expect(withHint('Grading needs a TypeSafe key.')).toMatch('--no-jev')
  })

  it('leaves out the app-only way to add the key', () => {
    expect(withHint('No TypeSafe key is set, so Jev cannot judge. Add the key in Settings.')).toBe(
      'No TypeSafe key is set, so Jev cannot judge. Add TYPESAFE_API_KEY to .env, or pass --no-jev to grade with code checks only.',
    )
    // What `st grade` stops with on a run Jev scored: `--no-jev` is the way to grade it all the same.
    expect(
      withHint(
        'Jev scored this run, and no TypeSafe key is set to grade it again. Add the key in Settings.',
      ),
    ).toBe(
      'Jev scored this run, and no TypeSafe key is set to grade it again. Add TYPESAFE_API_KEY to .env, or pass --no-jev to grade with code checks only.',
    )
  })

  it('names --name when a changed skill needs its version named', () => {
    expect(withHint('The skill changed since the last run. Name version v3.')).toMatch(
      'Pass --name',
    )
  })

  it('names --baseline when an old_skill run has no version to run against', () => {
    expect(withHint('old_skill needs the version to run against.')).toMatch(
      'Pass --baseline <version>, such as v1.',
    )
  })

  it('says nothing twice when the failure already names the flag', () => {
    const said = 'TYPESAFE_API_KEY is not set. Add it to .env or pass --no-jev.'
    expect(withHint(said)).toBe(said)
    const named = 'The skill changed since the last run. Name version v3 (st run --name "...").'
    expect(withHint(named)).toBe(named)
  })

  it('leaves any other failure as it is', () => {
    expect(withHint('No case named x.')).toBe('No case named x.')
  })
})
