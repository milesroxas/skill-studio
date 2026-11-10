import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_PREFERENCES } from '@domain/preferences.ts'
import { afterAll, describe, expect, it } from 'vitest'

// The library reads SKILL_STUDIO_HOME once, at import.
const home = mkdtempSync(join(tmpdir(), 'st-preferences-home-'))
process.env.SKILL_STUDIO_HOME = home
afterAll(() => rmSync(home, { recursive: true, force: true }))
const { readPreferences, writePreferences } = await import('./preferences.ts')

describe('preferences', () => {
  it('reads the defaults before anything is stored', () => {
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES)
  })

  it('reads back what was written', () => {
    const chosen = {
      ...DEFAULT_PREFERENCES,
      theme: 'dark',
      motion: 'reduced',
      editorMode: 'markdown',
      aiProvider: 'anthropic',
      aiModel: 'claude-opus-5-5',
    } as const
    writePreferences(chosen)
    expect(readPreferences()).toEqual(chosen)
  })

  it('reads a broken file as the defaults', () => {
    writeFileSync(join(home, '.skill-studio', 'preferences.json'), '{ not json')
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES)
  })
})
