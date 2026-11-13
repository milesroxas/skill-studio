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
    expect(isShellOperation('settings.key')).toBe(true)
    expect(isShellOperation('ai.status')).toBe(false)
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

  it('read skill files from the tree, a version or a run, and nothing else', () => {
    expect(parsers['skill.files']({ skill: '/s' }).source).toBe('current')
    expect(parsers['skill.files']({ skill: '/s', source: 'v3' }).source).toBe('v3')
    expect(parsers['skill.files']({ skill: '/s', source: '2026-11-01-skill-v3-x' }).source).toBe(
      '2026-11-01-skill-v3-x',
    )
    expect(() => parsers['skill.files']({ skill: '/s', source: '../x' })).toThrow('Bad run.')
  })

  it('restore only a version label, and only when forced to overwrite', () => {
    expect(() => parsers['skill.restoreVersion']({ version: 'latest' })).toThrow('Bad version.')
    expect(parsers['skill.restoreVersion']({ skill: '/s', version: 'v2' }).force).toBe(false)
    expect(
      parsers['skill.restoreVersion']({ skill: '/s', version: 'v2', force: 'yes' }).force,
    ).toBe(false)
  })

  it('delete only a version label, and undo only a plain trash name', () => {
    expect(() => parsers['skill.deleteVersion']({ skill: '/s', version: '../v1' })).toThrow(
      'Bad version.',
    )
    expect(parsers['skill.deleteVersion']({ skill: '/s', version: 'v1' }).version).toBe('v1')
    expect(() => parsers['skill.undeleteVersion']({ skill: '/s', undo: '../x' })).toThrow(
      'Bad undo.',
    )
  })

  it('keep drafts to text files at safe paths', () => {
    const drafts = parsers['skill.saveDrafts']({
      skill: '/s',
      drafts: { files: { 'SKILL.md': { text: 'x', previous: 3 } }, cases: { '+new': {} } },
    }).drafts
    expect(drafts.files['SKILL.md']).toEqual({ text: 'x', previous: null })
    expect(drafts.cases['+new'].graders).toEqual([])
    const based = parsers['skill.saveDrafts']({
      skill: '/s',
      drafts: {
        cases: { intro: {} },
        caseBases: { intro: '2026-11-09T10:00:00.000Z', gone: 'x', '+new': 3 },
      },
    }).drafts
    // A base is kept only beside a draft it dates.
    expect(based.caseBases).toEqual({ intro: '2026-11-09T10:00:00.000Z' })
    // Scoring an earlier version kept with the drafts is not carried on.
    const scored = parsers['skill.saveDrafts']({
      skill: '/s',
      drafts: { files: {}, scoring: { packs: ['generic'], yes: 0.6 } },
    }).drafts
    expect(scored).not.toHaveProperty('scoring')
    expect(() =>
      parsers['skill.saveDrafts']({ drafts: { files: { '../a': { text: 'x' } } } }),
    ).toThrow('Bad path.')
    expect(() => parsers['skill.saveDrafts']({ drafts: { files: { a: {} } } })).toThrow(
      'Bad draft of a.',
    )
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
    expect(parsers['skill.generate']({ skill: '/s', samples: 40 }).samples).toBe(10)
    expect(input.configuration).toBe('without_skill')
    expect(input.grade).toBe(false)
    expect(() => parsers['skill.generate']({ configuration: 'sideways' })).toThrow(
      'Bad configuration.',
    )
  })

  it('accept only known agents', () => {
    expect(() => parsers['library.link']({ path: '/p', agent: 'emacs' })).toThrow('Bad agent.')
    expect(parsers['library.link']({ path: '/p', agent: 'codex' }).scope).toBe('user')
  })

  it('read a correction as met, missed, or taken back', () => {
    const read = (met: unknown) =>
      parsers['skill.correct']({ key: 'run/sample', verdict: 'rule:Be brief.', met }).met
    expect(read(true)).toBe(true)
    expect(read(false)).toBe(false)
    expect(read(undefined)).toBeNull()
    expect(() => parsers['skill.correct']({ key: 'run/sample', verdict: '' })).toThrow(
      'Bad verdict.',
    )
    expect(() => parsers['skill.correct']({ key: '../x', verdict: 'rule:x' })).toThrow()
  })
})

describe('parsers, on what names a folder or sizes a run', () => {
  it('check the baseline run like every other run name', () => {
    expect(() =>
      parsers['skill.generate']({ configuration: 'old_skill', baseline: '../../elsewhere' }),
    ).toThrow('Bad run.')
    expect(parsers['skill.generate']({ baseline: 'run-1' }).baseline).toBe('run-1')
    expect(parsers['skill.generate']({}).baseline).toBeNull()
  })

  it('hold samples to a whole number from 1 to 10', () => {
    expect(parsers['skill.generate']({ samples: 2.7 }).samples).toBe(2)
    expect(parsers['skill.generate']({ samples: 0 }).samples).toBe(1)
    expect(parsers['skill.generate']({ samples: -3 }).samples).toBe(1)
  })

  it('take the packs a skill is graded as: known ones, each once, at least one', () => {
    const packs = (value: unknown) => parsers['skill.gradedAs']({ skill: '/s', packs: value })
    expect(packs(['generic', 'design']).packs).toEqual(['generic', 'design'])
    expect(() => packs([])).toThrow('Bad packs.')
    expect(() => packs('generic')).toThrow('Bad packs.')
    expect(() => packs(['generic', 'generic'])).toThrow('Bad packs.')
    expect(() => packs(['generic', 7])).toThrow('Bad pack.')
    expect(() => packs(['poetry'])).toThrow('Bad pack.')
  })

  it('carry the time a case was last saved, and take none for no check', () => {
    const base = { skill: '/s', case: { id: 'a', prompt: 'p' } }
    expect(parsers['skill.saveCase'](base).savedAt).toBeNull()
    expect(
      parsers['skill.saveCase']({ ...base, savedAt: '2026-11-09T10:00:00.000Z' }).savedAt,
    ).toBe('2026-11-09T10:00:00.000Z')
  })

  it('refuse a message longer than one request carries', () => {
    expect(() => parsers['chat.send']({ text: 'x'.repeat(2_000_000) })).toThrow('longer than')
  })

  it('take an output named as people name files', () => {
    const input = parsers['skill.artifact']({
      skill: '/s',
      run: 'r',
      sample: 'a-s1',
      file: 'outputs/Cover Letter.md',
    })
    expect(input.file).toBe('outputs/Cover Letter.md')
  })
})
