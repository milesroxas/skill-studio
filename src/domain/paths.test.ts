import { describe, expect, it, vi } from 'vitest'
import { byFileOrder, isEditablePath, isWithin } from './paths.ts'

describe('isWithin', () => {
  it('accepts the root itself and anything below it', () => {
    expect(isWithin('/runs/case-s1', '/runs/case-s1')).toBe(true)
    expect(isWithin('/runs/case-s1/outputs/a.md', '/runs/case-s1')).toBe(true)
    expect(isWithin('/runs/case-s1/', '/runs/case-s1')).toBe(true)
  })

  it('rejects a sibling that only shares a name prefix', () => {
    expect(isWithin('/runs/case-s10/a.md', '/runs/case-s1')).toBe(false)
  })

  it('resolves .. segments before comparing', () => {
    expect(isWithin('/runs/case-s1/../case-s2/a.md', '/runs/case-s1')).toBe(false)
    expect(isWithin('/runs/case-s1/x/../a.md', '/runs/case-s1')).toBe(true)
  })

  it('keeps a file whose name starts with two dots inside', () => {
    expect(isWithin('/runs/case-s1/..notes', '/runs/case-s1')).toBe(true)
  })
})

describe('isEditablePath', () => {
  it('accepts SKILL.md and a file under references/', () => {
    expect(isEditablePath('SKILL.md')).toBe(true)
    expect(isEditablePath('references/voice.md')).toBe(true)
    expect(isEditablePath('references/notes/..voice.md')).toBe(true)
  })

  it('rejects anything else, and a reference path that does not read as written', () => {
    expect(isEditablePath('evals/bench.json')).toBe(false)
    expect(isEditablePath('skill.md')).toBe(false)
    expect(isEditablePath('references')).toBe(false)
    expect(isEditablePath('references/')).toBe(false)
    expect(isEditablePath('references//voice.md')).toBe(false)
    expect(isEditablePath('references/./voice.md')).toBe(false)
    expect(isEditablePath('references/../../x')).toBe(false)
    expect(isEditablePath('references/../SKILL.md')).toBe(false)
    expect(isEditablePath('references\\voice.md')).toBe(false)
  })
})

describe('byFileOrder', () => {
  it('puts SKILL.md first and sorts the rest in one fixed locale', () => {
    const compare = vi.spyOn(String.prototype, 'localeCompare')
    expect(['references/b.md', 'SKILL.md', 'references/a.md'].sort(byFileOrder)).toEqual([
      'SKILL.md',
      'references/a.md',
      'references/b.md',
    ])
    expect(compare).toHaveBeenCalled()
    for (const call of compare.mock.calls) expect(call[1]).toBe('en')
    compare.mockRestore()
  })
})
