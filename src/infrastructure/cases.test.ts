import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteCase, loadCases, saveCase } from './cases.ts'

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

describe('saveCase and deleteCase', () => {
  const draft = {
    id: 'short-note',
    title: 'A short note',
    prompt: 'Write a note about the move to Friday.',
    expectedOutcome: 'Short, says the new day.',
    words: [10, 80] as [number, number],
    graders: [
      { id: null, statement: 'The note says Friday.', weight: 2 },
      { id: null, statement: ' ', weight: 1 },
    ],
  }

  it('writes a new case folder as hand-written YAML, skipping blank checks', () => {
    expect(saveCase(skill, draft, true)).toBe('evals/cases/short-note')
    const yaml = readFileSync(join(skill, 'evals/cases/short-note/case.yaml'), 'utf8')
    expect(yaml).toBe(
      'title: A short note\nexpected_outcome: Short, says the new day.\nbench:\n  words: [ 10, 80 ]\n',
    )
    const [saved] = loadCases(skill)
    expect(saved.graders.map((g) => [g.id, g.weight])).toEqual([['01-the-note-says-friday', 2]])
  })

  it('refuses a bad id, an empty prompt, a bad range and a duplicate', () => {
    expect(() => saveCase(skill, { ...draft, id: 'Short Note' }, true)).toThrow('lowercase')
    expect(() => saveCase(skill, { ...draft, prompt: ' ' }, true)).toThrow('prompt')
    expect(() => saveCase(skill, { ...draft, words: [80, 10] }, true)).toThrow('word range')
    saveCase(skill, draft, true)
    expect(() => saveCase(skill, draft, true)).toThrow('already exists')
  })

  it('updates checks in place, drops removed ones and clears an emptied bench', () => {
    saveCase(skill, draft, true)
    const [first] = loadCases(skill)[0].graders
    saveCase(
      skill,
      {
        ...draft,
        words: null,
        graders: [
          { id: first.id, statement: 'The note names Friday.', weight: 1 },
          { id: null, statement: 'It is under 80 words.', weight: 1 },
        ],
      },
      false,
    )
    const [saved] = loadCases(skill)
    expect(saved.bench).toEqual({})
    expect(saved.graders.map((g) => [g.id, g.statement])).toEqual([
      ['01-the-note-says-friday', 'The note names Friday.'],
      ['02-it-is-under-80-words', 'It is under 80 words.'],
    ])
  })

  it('deletes a folder case', () => {
    saveCase(skill, draft, true)
    deleteCase(skill, 'short-note')
    expect(loadCases(skill)).toEqual([])
    expect(() => deleteCase(skill, 'short-note')).toThrow('Only folder cases')
  })
})
