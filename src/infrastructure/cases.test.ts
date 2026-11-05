import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pngHeader } from '@domain/image-fixtures.ts'
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
      { id: 'g1', type: 'llm', focus: 'tone', weight: 2, statement: 'Is it calm?', image: null },
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
        images: [],
        graders: [{ id: 'g1', statement: 'Is it calm?', weight: 3, image: null }],
      },
      false,
    )
    const [saved] = loadCases(skill)
    expect(saved.prompt).toBe('New prompt.')
    expect(saved.settings.maxTurns).toBe(3)
    expect(saved.graders).toEqual([
      {
        id: 'g1',
        type: 'llm',
        focus: 'tone: calm',
        weight: 3,
        statement: 'Is it calm?',
        image: null,
      },
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
    images: [],
    graders: [
      { id: null, statement: 'The note says Friday.', weight: 2, image: null },
      { id: null, statement: ' ', weight: 1, image: null },
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
        images: [],
        graders: [
          { id: first.id, statement: 'The note names Friday.', weight: 1, image: null },
          { id: null, statement: 'It is under 80 words.', weight: 1, image: null },
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

describe('case pictures', () => {
  /** An upload on disk, as the app would hold one, and the function that finds it. */
  const uploads = () => {
    const dir = mkdtempSync(join(tmpdir(), 'st-uploads-'))
    writeFileSync(join(dir, 'aa.png'), pngHeader(800, 600))
    writeFileSync(join(dir, 'bb.png'), pngHeader(400, 300))
    return (id: string) => join(dir, id)
  }
  const draft = {
    id: 'landing',
    title: 'Landing page',
    prompt: 'Build the page in the mock-up.',
    expectedOutcome: '',
    words: null,
    images: [{ name: 'Home Mock.png', file: null, upload: 'aa.png' }],
    graders: [
      {
        id: null,
        statement: 'The page matches the mock-up.',
        weight: 1,
        image: { name: 'mock.png', file: null, upload: 'bb.png' },
      },
    ],
  }

  it('keeps an added picture in files/, where the agent gets it, and a check’s beside its check', () => {
    saveCase(skill, draft, true, uploads())
    const [saved] = loadCases(skill)
    expect(saved.files).toEqual(['evals/cases/landing/files/home-mock.png'])
    expect(saved.graders[0].image).toBe(
      'evals/cases/landing/references/01-the-page-matches-the-mock-up.png',
    )
    expect(readFileSync(join(skill, saved.graders[0].image ?? ''))).toEqual(
      Buffer.from(pngHeader(400, 300)),
    )
  })

  it('keeps saved pictures on a later save, and removes the ones taken off', () => {
    saveCase(skill, draft, true, uploads())
    const [saved] = loadCases(skill)
    const kept = {
      ...draft,
      images: [{ name: 'home-mock.png', file: saved.files[0], upload: null }],
      graders: [
        {
          ...draft.graders[0],
          id: saved.graders[0].id,
          image: { name: 'mock.png', file: saved.graders[0].image, upload: null },
        },
      ],
    }
    writeFileSync(join(skill, 'evals/cases/landing/files/brief.md'), 'A brief.')
    saveCase(skill, kept, false)
    expect(loadCases(skill)[0].files).toHaveLength(2)
    expect(loadCases(skill)[0].graders[0].image).toBe(saved.graders[0].image)

    saveCase(skill, { ...kept, images: [], graders: [{ ...kept.graders[0], image: null }] }, false)
    const [after] = loadCases(skill)
    // An input file that is not a picture is not the form's to remove.
    expect(after.files).toEqual(['evals/cases/landing/files/brief.md'])
    expect(after.graders[0].image).toBeNull()
    expect(existsSync(join(skill, saved.graders[0].image ?? ''))).toBe(false)
  })

  it('names a second picture of the same name apart from the first', () => {
    const find = uploads()
    saveCase(
      skill,
      {
        ...draft,
        graders: [],
        images: [draft.images[0], { name: 'home mock.png', file: null, upload: 'bb.png' }],
      },
      true,
      find,
    )
    expect(loadCases(skill)[0].files.map((f) => f.split('/').at(-1))).toEqual([
      'home-mock-2.png',
      'home-mock.png',
    ])
  })
})
