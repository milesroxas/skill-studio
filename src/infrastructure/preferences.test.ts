import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_PREFERENCES } from '@domain/preferences.ts'
import { describe, expect, it } from 'vitest'

// The library reads SKILL_STUDIO_HOME once, at import.
const home = mkdtempSync(join(tmpdir(), 'st-preferences-home-'))
process.env.SKILL_STUDIO_HOME = home
const { readPreferences, writePreferences } = await import('./preferences.ts')

describe('preferences', () => {
  it('reads the defaults before anything is stored', () => {
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES)
  })

  it('reads back what was written', () => {
    writePreferences({ theme: 'dark', motion: 'reduced', editorMode: 'markdown' })
    expect(readPreferences()).toEqual({ theme: 'dark', motion: 'reduced', editorMode: 'markdown' })
  })

  it('reads a broken file as the defaults', () => {
    writeFileSync(join(home, '.skill-studio', 'preferences.json'), '{ not json')
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES)
  })
})
