/**
 * A save of a case that is refused writes nothing: every check that can
 * refuse it is asked before the first write. The prompt's own refusal
 * (`promptFileText`) is reached by no real request, so the reader it holds
 * the text against is made to read every file wrongly, for one save.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const misread = vi.hoisted(() => ({ on: false }))
vi.mock('@domain/text.ts', async (original) => {
  const text = await original<typeof import('@domain/text.ts')>()
  return {
    ...text,
    readFrontMatter: (raw: string) =>
      misread.on ? { meta: {}, text: 'not the request' } : text.readFrontMatter(raw),
  }
})
const { saveCase } = await import('./cases.ts')

let skill: string
beforeEach(() => {
  skill = mkdtempSync(join(tmpdir(), 'st-cases-refused-'))
})
afterEach(() => {
  misread.on = false
  rmSync(skill, { recursive: true, force: true })
})

const draft = {
  id: 'short-note',
  title: 'A short note',
  prompt: 'Write a note about the move to Friday.',
  expectedOutcome: '',
  words: null,
  images: [],
  graders: [{ id: null, statement: 'The note says Friday.', weight: 1, image: null }],
}
const folder = () => join(skill, 'evals/cases/short-note')

describe('a refused save of a new case', () => {
  it('leaves no folder when its prompt would not read back', () => {
    misread.on = true
    expect(() => saveCase(skill, draft, true)).toThrow('would be read as the case’s settings')
    expect(existsSync(folder())).toBe(false)
  })

  it('leaves no folder when a picture of the case or of a check is no longer kept', () => {
    const image = { upload: 'gone.png', file: null, name: 'shot.png' }
    expect(() => saveCase(skill, { ...draft, images: [image] }, true)).toThrow('never added')
    const check = { ...draft.graders[0], image }
    expect(() => saveCase(skill, { ...draft, graders: [check] }, true)).toThrow('never added')
    expect(existsSync(folder())).toBe(false)
  })

  it('is written whole once nothing refuses it', () => {
    saveCase(skill, draft, true)
    expect(existsSync(join(folder(), 'prompt.md'))).toBe(true)
  })
})
