import { describe, expect, it } from 'vitest'
import { aiChoiceOf, aiChoicePatch, DEFAULT_PREFERENCES, preferencesOf } from './preferences.ts'

describe('preferencesOf', () => {
  it('reads nothing as the defaults', () => {
    expect(preferencesOf(undefined)).toEqual(DEFAULT_PREFERENCES)
    expect(preferencesOf('dark')).toEqual(DEFAULT_PREFERENCES)
  })

  it('keeps known values', () => {
    const stored = {
      theme: 'dark',
      motion: 'reduced',
      editorMode: 'markdown',
      aiProvider: 'claude-code',
      aiModel: 'opus',
      aiEffort: 'high',
    }
    expect(preferencesOf(stored)).toEqual(stored)
  })

  it('reads an unknown provider or effort as not chosen', () => {
    const read = preferencesOf({ aiProvider: 'acme', aiModel: 'x', aiEffort: 'extreme' })
    expect(read.aiProvider).toBe('')
    expect(read.aiEffort).toBe('')
    expect(aiChoiceOf(read)).toBeNull()
  })

  it('turns a choice into preferences and back', () => {
    const choice = { provider: 'anthropic', model: 'claude-opus-5-5', effort: 'medium' } as const
    expect(aiChoiceOf({ ...DEFAULT_PREFERENCES, ...aiChoicePatch(choice) })).toEqual(choice)
  })

  it('drops unknown values and fields', () => {
    expect(preferencesOf({ theme: 'sepia', editorMode: 'markdown', extra: true })).toEqual({
      ...DEFAULT_PREFERENCES,
      editorMode: 'markdown',
    })
  })
})
