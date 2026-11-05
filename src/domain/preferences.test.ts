import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES, preferencesOf } from './preferences.ts'

describe('preferencesOf', () => {
  it('reads nothing as the defaults', () => {
    expect(preferencesOf(undefined)).toEqual(DEFAULT_PREFERENCES)
    expect(preferencesOf('dark')).toEqual(DEFAULT_PREFERENCES)
  })

  it('keeps known values', () => {
    expect(preferencesOf({ theme: 'dark', motion: 'reduced', editorMode: 'markdown' })).toEqual({
      theme: 'dark',
      motion: 'reduced',
      editorMode: 'markdown',
    })
  })

  it('drops unknown values and fields', () => {
    expect(preferencesOf({ theme: 'sepia', editorMode: 'markdown', extra: true })).toEqual({
      ...DEFAULT_PREFERENCES,
      editorMode: 'markdown',
    })
  })
})
