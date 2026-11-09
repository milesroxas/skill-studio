import { GLOSSARY } from '@domain/glossary.ts'
import { describe, expect, it } from 'vitest'
import guide from '../../docs/guide.md?raw'
import { guideSections } from './guide.ts'
import { LOOP_STEPS, SCREEN_HELP } from './help.ts'
import { APP_PLACES, isSkillScreen, placeFor, SKILL_PLACES } from './places.ts'

const sections = new Set(guideSections(guide).map((s) => s.id))

describe('guideSections', () => {
  it('gives each heading the id its text spells', () => {
    expect(guideSections('# Title\n\n## 1. Open or create a `skill`\n\n### Not one\n')).toEqual([
      { id: '1-open-or-create-a-skill', title: '1. Open or create a skill' },
    ])
  })
})

describe('the help', () => {
  it('explains every screen of the loop, and the library and settings', () => {
    const screens = [...SKILL_PLACES, ...APP_PLACES]
      .map((p) => p.screen)
      .filter((screen) => screen !== 'docs')
    expect(Object.keys(SCREEN_HELP).sort()).toEqual(screens.sort())
  })

  it('points each screen at a section the guide has', () => {
    for (const [screen, help] of Object.entries(SCREEN_HELP))
      expect(sections.has(help.guide), `${screen}: ${help.guide}`).toBe(true)
  })

  it('keeps a tooltip short enough to read at a glance', () => {
    for (const help of Object.values(SCREEN_HELP)) expect(help.short.length).toBeLessThan(48)
  })

  it('uses only words the glossary explains', () => {
    for (const [screen, help] of Object.entries(SCREEN_HELP))
      for (const term of help.terms) expect(GLOSSARY[term], `${screen}: ${term}`).toBeDefined()
  })

  it('tours screens of the loop, each of which has a name and help', () => {
    for (const step of LOOP_STEPS) {
      expect(isSkillScreen(step.screen)).toBe(true)
      expect(placeFor(step.screen)).toBeDefined()
      expect(SCREEN_HELP[step.screen]).toBeDefined()
    }
  })
})
