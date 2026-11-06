import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_PREFERENCES } from '@domain/preferences.ts'
import { describe, expect, it } from 'vitest'

// The library reads SKILL_STUDIO_HOME once, at import.
const home = mkdtempSync(join(tmpdir(), 'st-reset-home-'))
process.env.SKILL_STUDIO_HOME = home
const { readPreferences, writePreferences } = await import('./preferences.ts')
const { clearStudioData } = await import('./reset.ts')

const write = (path: string, text = '{}'): void => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text)
}

describe('clearStudioData', () => {
  it('does nothing in a home the app never wrote to', () => {
    expect(() => clearStudioData()).not.toThrow()
  })

  it('removes the app’s own folder, so the next launch is a first one', () => {
    writePreferences({ ...DEFAULT_PREFERENCES, welcomed: true, theme: 'dark' })
    write(join(home, '.skill-studio/drafts/abc.json'))
    write(join(home, '.skill-studio/practice/thank-you-note/SKILL.md'), '# Thank you')
    clearStudioData()
    expect(existsSync(join(home, '.skill-studio'))).toBe(false)
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES)
  })

  it('removes the settings from before the app was Skill Studio, and their empty folder', () => {
    write(join(home, '.skill-tester/library.json'))
    clearStudioData()
    expect(existsSync(join(home, '.skill-tester'))).toBe(false)
  })

  it('keeps anything else in that old folder', () => {
    write(join(home, '.skill-tester/library.json'))
    write(join(home, '.skill-tester/notes.md'), 'mine')
    clearStudioData()
    expect(existsSync(join(home, '.skill-tester/library.json'))).toBe(false)
    expect(existsSync(join(home, '.skill-tester/notes.md'))).toBe(true)
  })

  it('leaves every skill where the person keeps it', () => {
    const skill = join(home, '.claude/skills/thank-you-note')
    write(join(skill, 'SKILL.md'), '# Thank you')
    write(join(skill, 'evals/cases/one/case.yaml'), 'weight: 1')
    write(join(home, '.skill-studio/library.json'))
    clearStudioData()
    expect(existsSync(join(skill, 'SKILL.md'))).toBe(true)
    expect(existsSync(join(skill, 'evals/cases/one/case.yaml'))).toBe(true)
  })
})
