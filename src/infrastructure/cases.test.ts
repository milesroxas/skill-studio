import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pngHeader } from '@domain/__fixtures__/image.ts'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { caseSavedAt, countCases, deleteCase, findCase, loadCases, saveCase } from './cases.ts'

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

  it('holds a hand-written weight to 1 to 5, and reads a missing or bad one as 1', () => {
    writeCase('w', 'Write it.', {
      g1: '---\nweight: 10\n---\n\nToo heavy.\n',
      g2: '---\nweight: 0.4\n---\n\nToo light.\n',
      g3: '---\nweight: two\n---\n\nNot a number.\n',
    })
    const [loaded] = loadCases(skill)
    expect(loaded.graders.map((g) => g.weight)).toEqual([5, 1, 1])
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

  it('keeps a size and the phone check in the bench block, and takes them out again', () => {
    saveCase(skill, { ...draft, size: [1600, 900], phone: true }, true)
    const yamlPath = join(skill, 'evals/cases/short-note/case.yaml')
    expect(readFileSync(yamlPath, 'utf8')).toBe(
      'title: A short note\nexpected_outcome: Short, says the new day.\nbench:\n  words: [ 10, 80 ]\n  size: [ 1600, 900 ]\n  phone: true\n',
    )
    expect(loadCases(skill)[0].bench).toMatchObject({ size: [1600, 900], phone: true })
    saveCase(skill, { ...draft, size: null, phone: false }, false)
    expect(readFileSync(yamlPath, 'utf8')).not.toMatch(/size|phone/)
    expect(() => saveCase(skill, { ...draft, size: [0, 900] }, false)).toThrow('whole pixels')
    expect(() => saveCase(skill, { ...draft, size: [1600, 20_000] }, false)).toThrow('10,000')
  })

  it('drops a size written by hand that a save would refuse', () => {
    saveCase(skill, draft, true)
    const yamlPath = join(skill, 'evals/cases/short-note/case.yaml')
    for (const size of ['[ 1000000, 900 ]', '"1440x900"', '[ 1440 ]', '[ 1440.5, 900 ]']) {
      writeFileSync(yamlPath, `title: A short note\nbench:\n  size: ${size}\n  phone: yes please\n`)
      const { bench } = loadCases(skill)[0]
      expect(bench.size).toBeUndefined()
      expect(bench.phone).toBeUndefined()
    }
    writeFileSync(yamlPath, 'title: A short note\nbench:\n  size: [ 1440, 900 ]\n')
    expect(loadCases(skill)[0].bench.size).toEqual([1440, 900])
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

  it('refuses a save over a case written since it was loaded, and takes one that matches', () => {
    const rel = saveCase(skill, draft, true)
    const loadedAt = caseSavedAt(skill, rel)
    expect(loadedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    // The form's own time matches: the save goes through, and the folder's time moves on.
    saveCase(skill, { ...draft, title: 'Renamed' }, false, undefined, loadedAt)
    // Someone else writes the prompt a while later.
    const later = new Date(Date.now() + 5000)
    utimesSync(join(skill, rel, 'prompt.md'), later, later)
    expect(() => saveCase(skill, draft, false, undefined, loadedAt)).toThrow(
      'changed on disk since you opened it',
    )
    expect(loadCases(skill)[0].title).toBe('Renamed')
    // Without a time to check against, the save is taken as before.
    saveCase(skill, draft, false)
    expect(loadCases(skill)[0].title).toBe('A short note')
  })

  it('says when the case to save over was deleted', () => {
    const rel = saveCase(skill, draft, true)
    const loadedAt = caseSavedAt(skill, rel)
    deleteCase(skill, 'short-note')
    expect(() => saveCase(skill, draft, false, undefined, loadedAt)).toThrow('was deleted on disk')
    expect(caseSavedAt(skill, rel)).toBeNull()
  })
})

describe('case pictures', () => {
  /** An upload on disk, as the app would hold one, and the function that finds it. */
  const made: string[] = []
  afterAll(() => {
    for (const dir of made) rmSync(dir, { recursive: true, force: true })
  })
  const uploads = () => {
    const dir = mkdtempSync(join(tmpdir(), 'st-uploads-'))
    made.push(dir)
    writeFileSync(join(dir, 'aa.png'), pngHeader(800, 600))
    writeFileSync(join(dir, 'bb.png'), pngHeader(400, 300))
    const at = (id: string) => join(dir, id)
    return { picture: at, input: at }
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

describe('findCase', () => {
  it('never takes a case for another whose id it leads', () => {
    writeCase('email', 'Write an email.')
    writeCase('email-reply', 'Reply to an email.')
    const cases = loadCases(skill)
    expect(findCase(cases, 'email-reply')?.id).toBe('email-reply')
    expect(findCase(cases, 'email')?.id).toBe('email')
    // A legacy output file is `<case>-<n>.md`: the longer id that leads it is the case.
    expect(findCase(cases, 'email-reply-2.md')?.id).toBe('email-reply')
    expect(findCase(cases, 'email-2.md')?.id).toBe('email')
    expect(findCase(cases, 'memo-1.md')).toBeNull()
  })
})

describe('cases that cannot be read', () => {
  it('leaves out a case whose case.yaml does not parse, and reads the rest', () => {
    writeCase('good', 'Write it.')
    writeCase('torn', 'Write it.')
    writeFileSync(join(skill, 'evals/cases/torn/case.yaml'), 'title: [unclosed\n  bench: {')
    expect(loadCases(skill).map((c) => c.id)).toEqual(['good'])
  })

  it('takes from evals.json only entries whose key is a slug, with files inside the skill', () => {
    mkdirSync(join(skill, 'evals'), { recursive: true })
    writeFileSync(
      join(skill, 'evals/evals.json'),
      JSON.stringify({
        evals: [
          { id: 1, name: 'First', prompt: 'One.', files: ['evals/files/a.md', '../../etc/passwd'] },
          { id: '../up', prompt: 'Two.' },
          { id: 3, name: 'No prompt' },
          { id: 4, prompt: 'Four.', bench: { evidence: ['references/facts.md', '/etc/hosts'] } },
        ],
      }),
    )
    const cases = loadCases(skill)
    expect(cases.map((c) => c.id)).toEqual(['1-first', '4'])
    expect(cases[0].files).toEqual(['evals/files/a.md'])
    expect(cases[1].bench.evidence).toEqual(['references/facts.md'])
  })

  it('counts cases without reading them', () => {
    writeCase('a', 'One.')
    writeCase('b', 'Two.')
    writeFileSync(join(skill, 'evals/cases/b/case.yaml'), 'title: [unclosed')
    mkdirSync(join(skill, 'evals/cases/empty'))
    expect(countCases(skill)).toBe(2)
  })

  it('counts an evals.json case once when a folder has its id, and never one that is left out', () => {
    writeCase('1-first', 'One, as a folder.')
    writeFileSync(
      join(skill, 'evals/evals.json'),
      JSON.stringify({
        evals: [
          { id: 1, name: 'First', prompt: 'One.' },
          { id: 2, prompt: 'Two.' },
          { id: 'test_3', prompt: 'Three.' },
          { id: 4, name: 'No prompt' },
        ],
      }),
    )
    expect(loadCases(skill).map((c) => c.id)).toEqual(['1-first', '2'])
    expect(countCases(skill)).toBe(2)
  })

  it('warns, naming the entry, of an evals.json case it leaves out', () => {
    mkdirSync(join(skill, 'evals'), { recursive: true })
    writeFileSync(
      join(skill, 'evals/evals.json'),
      JSON.stringify({ evals: [{ id: 'test_1', prompt: 'One.' }, { id: 'nothing-asked' }] }),
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(loadCases(skill)).toEqual([])
      loadCases(skill)
      const said = warn.mock.calls.map(([line]) => String(line))
      expect(said.filter((line) => line.includes('"test_1"'))).toHaveLength(1)
      expect(said.find((line) => line.includes('"test_1"'))).toContain('evals.json')
      expect(said.filter((line) => line.includes('"nothing-asked"'))).toHaveLength(1)
    } finally {
      warn.mockRestore()
    }
  })
})

describe.skipIf(process.platform === 'win32')('a case folder reached through a link', () => {
  let outside: string
  beforeEach(() => {
    outside = mkdtempSync(join(tmpdir(), 'st-cases-outside-'))
    writeFileSync(join(outside, 'shot.png'), pngHeader(10, 10))
    writeFileSync(join(outside, 'theirs.md'), '---\ntype: llm\n---\n\nTheirs.\n')
  })
  afterEach(() => rmSync(outside, { recursive: true, force: true }))

  const draft = {
    id: 'linked',
    title: 'Linked',
    prompt: 'Do it.',
    expectedOutcome: '',
    words: null,
    images: [],
    graders: [],
  }

  it.each(['files', 'graders', 'references'])(
    'is refused before anything is written when %s/ leads out of the skill',
    (folder) => {
      writeCase('linked', 'Old prompt.')
      rmSync(join(skill, 'evals/cases/linked', folder), { recursive: true, force: true })
      symlinkSync(outside, join(skill, 'evals/cases/linked', folder))
      expect(() => saveCase(skill, draft, false)).toThrow('leads outside')
      expect(readdirSync(outside).sort()).toEqual(['shot.png', 'theirs.md'])
      expect(readFileSync(join(skill, 'evals/cases/linked/prompt.md'), 'utf8')).toBe('Old prompt.')
    },
  )

  it("replaces a check's picture that is a link out of the skill, and leaves what it led to", () => {
    const at = (id: string) => join(outside, id)
    const find = { picture: at, input: at }
    writeFileSync(join(outside, 'new.png'), pngHeader(20, 20))
    saveCase(
      skill,
      {
        ...draft,
        graders: [{ id: null, statement: 'It matches.', weight: 1, image: null }],
      },
      true,
    )
    const [check] = loadCases(skill)[0].graders
    mkdirSync(join(skill, 'evals/cases/linked/references'))
    const picture = join(skill, 'evals/cases/linked/references', `${check.id}.png`)
    symlinkSync(join(outside, 'shot.png'), picture)
    saveCase(
      skill,
      {
        ...draft,
        graders: [
          {
            id: check.id,
            statement: 'It matches.',
            weight: 1,
            image: { name: 'new.png', file: null, upload: 'new.png' },
          },
        ],
      },
      false,
      find,
    )
    expect(readFileSync(join(outside, 'shot.png'))).toEqual(Buffer.from(pngHeader(10, 10)))
    expect(readFileSync(picture)).toEqual(Buffer.from(pngHeader(20, 20)))
  })

  it('writes through a link to a prompt elsewhere in the skill, and keeps the link', () => {
    writeCase('linked', 'Old prompt.')
    mkdirSync(join(skill, 'shared'))
    writeFileSync(join(skill, 'shared/prompt.md'), 'Shared prompt.')
    const prompt = join(skill, 'evals/cases/linked/prompt.md')
    rmSync(prompt)
    symlinkSync(join(skill, 'shared/prompt.md'), prompt)
    saveCase(skill, draft, false)
    expect(lstatSync(prompt).isSymbolicLink()).toBe(true)
    expect(readFileSync(join(skill, 'shared/prompt.md'), 'utf8')).toBe('Do it.\n')
  })
})

describe('writing a case', () => {
  it('leaves no temporary file beside the files it writes', () => {
    saveCase(
      skill,
      {
        id: 'note',
        title: 'Note',
        prompt: 'Write a note.',
        expectedOutcome: '',
        words: null,
        images: [],
        graders: [{ id: null, statement: 'It is short.', weight: 1, image: null }],
      },
      true,
    )
    const dir = join(skill, 'evals/cases/note')
    expect(readFileSync(join(dir, 'prompt.md'), 'utf8')).toBe('Write a note.\n')
    const names = [...readdirSync(dir), ...readdirSync(join(dir, 'graders'))]
    expect(names.filter((name) => name.endsWith('.tmp'))).toEqual([])
  })
})
