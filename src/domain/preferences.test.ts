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
      welcomed: true,
      hints: 'hide',
      hintsSeen: ['editor', 'cases'],
      aiProvider: 'claude-code',
      aiModel: 'opus',
      aiEffort: 'high',
      updates: 'manual',
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

  it('reads a file from before the welcome as not welcomed, with hints on', () => {
    const read = preferencesOf({ theme: 'dark' })
    expect(read.welcomed).toBe(false)
    expect(read.hints).toBe('show')
    expect(read.hintsSeen).toEqual([])
  })

  it('keeps each seen screen once and drops what is not a short name', () => {
    const read = preferencesOf({ hintsSeen: ['editor', 'editor', 7, 'x'.repeat(41), 'cases'] })
    expect(read.hintsSeen).toEqual(['editor', 'cases'])
    expect(preferencesOf({ hintsSeen: 'editor' }).hintsSeen).toEqual([])
    expect(preferencesOf({ welcomed: 'yes' }).welcomed).toBe(false)
  })

  it('looks for updates on its own unless told to wait', () => {
    expect(preferencesOf({}).updates).toBe('auto')
    expect(preferencesOf({ updates: 'never' }).updates).toBe('auto')
    expect(preferencesOf({ updates: 'manual' }).updates).toBe('manual')
  })

  it('drops unknown values and fields', () => {
    expect(preferencesOf({ theme: 'sepia', editorMode: 'markdown', extra: true })).toEqual({
      ...DEFAULT_PREFERENCES,
      editorMode: 'markdown',
    })
  })

  it('reads a hint put away under a screen id that has since changed', () => {
    expect(preferencesOf({ hintsSeen: ['edit', 'editor', 'cases'] }).hintsSeen).toEqual([
      'editor',
      'cases',
    ])
  })
})
