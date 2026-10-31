import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadCases, saveCase } from './cases.ts'

let skill: string
beforeEach(() => {
  skill = mkdtempSync(join(tmpdir(), 'st-cases-'))
})
afterEach(() => rmSync(skill, { recursive: true, force: true }))

const writeCase = (id: string, prompt: string, graders: Record<string, string> = {}) => {
  const dir = join(skill, 'evals/cases', id)
  mkdirSync(join(dir, 'graders'), { recursive: true })
  writeFileSync(join(dir, 'prompt.md'), prompt)
  for (const [name, text] of Object.entries(graders))
    writeFileSync(join(dir, 'graders', `${name}.md`), text)
}

describe('case folders', () => {
  it('reads settings from YAML front matter, lists in either form', () => {
    writeCase(
      'a',
      '---\ntags: [short, intro]\nmax_turns: 8\ntimeout_seconds: nope\nallowed_tools: Read, Write\n---\nWrite it.',
    )
    expect(loadCases(skill)[0].settings).toEqual({
      tags: ['short', 'intro'],
      maxTurns: 8,
      timeoutSeconds: null,
      allowedTools: ['Read', 'Write'],
    })
  })

  it('reads a prompt and graders saved with Windows line endings', () => {
    writeCase('b', '---\r\ntags: [x]\r\n---\r\n\r\nWrite it.\r\n', {
      g1: '---\r\ntype: llm\r\nfocus: tone\r\nweight: 2\r\n---\r\n\r\nIs it calm?\r\n',
    })
    const [loaded] = loadCases(skill)
    expect(loaded.prompt).toBe('Write it.')
    expect(loaded.settings.tags).toEqual(['x'])
    expect(loaded.graders).toEqual([
      { id: 'g1', type: 'llm', focus: 'tone', weight: 2, statement: 'Is it calm?' },
    ])
  })

  it('keeps grader fields it does not edit and writes front matter that reads back', () => {
    writeCase('c', '---\nmax_turns: 3\n---\nOld prompt.', {
      g1: '---\ntype: llm\nfocus: "tone: calm"\nweight: 2\n---\n\nIs it calm?\n',
    })
    saveCase(
      skill,
      {
        id: 'c',
        title: 'C',
        prompt: 'New prompt.',
        expectedOutcome: '',
        words: null,
        graders: [{ id: 'g1', statement: 'Is it calm?', weight: 3 }],
      },
      false,
    )
    const [saved] = loadCases(skill)
    expect(saved.prompt).toBe('New prompt.')
    expect(saved.settings.maxTurns).toBe(3)
    expect(saved.graders).toEqual([
      { id: 'g1', type: 'llm', focus: 'tone: calm', weight: 3, statement: 'Is it calm?' },
    ])
    const grader = readFileSync(join(skill, 'evals/cases/c/graders/g1.md'), 'utf8')
    expect(grader).toBe('---\ntype: llm\nfocus: "tone: calm"\nweight: 3\n---\n\nIs it calm?\n')
  })
})
