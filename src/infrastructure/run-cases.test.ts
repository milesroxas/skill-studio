import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadCases, loadEveryCase } from './cases.ts'
import { readJson } from './fs.ts'
import {
  askOf,
  CASES_FILE,
  keepCases,
  keptCases,
  readKept,
  runCases,
  takenCase,
  yardstickOf,
} from './run-cases.ts'

let dir: string
let run: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'st-run-cases-'))
  run = join(dir, 'evals/runs/r1')
  mkdirSync(run, { recursive: true })
  writeCase('email', 'Write the email.')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const caseDir = (id: string) => join(dir, 'evals/cases', id)

function writeCase(id: string, prompt: string): void {
  mkdirSync(caseDir(id), { recursive: true })
  writeFileSync(join(caseDir(id), 'prompt.md'), prompt)
}

function writeFile(id: string, name: string, text: string): void {
  mkdirSync(join(caseDir(id), 'files'), { recursive: true })
  writeFileSync(join(caseDir(id), 'files', name), text)
}

function writeCheck(id: string, name: string, statement: string, weight = 1): void {
  mkdirSync(join(caseDir(id), 'graders'), { recursive: true })
  writeFileSync(
    join(caseDir(id), 'graders', `${name}.md`),
    `---\ntype: llm\nweight: ${weight}\n---\n${statement}\n`,
  )
}

const email = () => {
  const found = loadCases(dir).find((c) => c.id === 'email')
  if (!found) throw new Error('no email case')
  return found
}

describe('askOf', () => {
  it('changes with the prompt and with a file’s bytes, and with nothing else of the case', () => {
    writeFile('email', 'brief.md', 'One line.')
    const asked = askOf(dir, email())
    writeCheck('email', '01-short', 'It is under 50 words.')
    writeFileSync(
      join(caseDir('email'), 'case.yaml'),
      'title: A new name\nbench:\n  words: [1, 50]\n',
    )
    expect(askOf(dir, email())).toBe(asked)

    writeFile('email', 'brief.md', 'Two lines.')
    const edited = askOf(dir, email())
    expect(edited).not.toBe(asked)
    writeCase('email', 'Write the email, briefly.')
    expect(askOf(dir, email())).not.toBe(edited)
  })

  it('reads a file that is gone as missing, and a prompt by its text whatever space is around it', () => {
    const asked = askOf(dir, email())
    expect(askOf(dir, { ...email(), prompt: '  Write the email.\n' })).toBe(asked)
    expect(askOf(dir, { ...email(), files: ['evals/cases/email/files/gone.md'] })).not.toBe(asked)
  })
})

describe('askOf and yardstickOf, on a case’s run settings', () => {
  const settle = (front: string) =>
    writeFileSync(join(caseDir('email'), 'prompt.md'), `---\n${front}\n---\nWrite the email.\n`)

  it('ask again when the tools or the time change, and hold again when the turns or the time do', () => {
    const asked = askOf(dir, email())
    const held = yardstickOf(dir, email())
    settle('allowed_tools: [Read, Write]')
    expect(askOf(dir, email())).not.toBe(asked)
    expect(yardstickOf(dir, email())).toBe(held)
    // The order the tools are listed in is no part of it.
    const tools = askOf(dir, email())
    settle('allowed_tools: [Write, Read]')
    expect(askOf(dir, email())).toBe(tools)

    settle('max_turns: 5')
    expect(askOf(dir, email())).toBe(asked)
    expect(yardstickOf(dir, email())).not.toBe(held)
    settle('timeout_seconds: 60')
    expect(askOf(dir, email())).not.toBe(asked)
    expect(yardstickOf(dir, email())).not.toBe(held)
  })

  it('read a fingerprint kept before the settings were part of it by the part it has', () => {
    keepCases(dir, run, loadCases(dir))
    const [kept] = keptCases(run) ?? []
    const before = { ...kept, ask: kept.ask.split(':')[0] }
    expect(takenCase(dir, before, email())?.earlier).toBeNull()
    expect(takenCase(dir, before, email())?.ask).toBe(askOf(dir, email()))
    // A run that kept the whole fingerprint is read on the settings too.
    settle('allowed_tools: [Read]')
    expect(takenCase(dir, kept, email())?.earlier).not.toBeNull()
    expect(takenCase(dir, before, email())?.earlier).toBeNull()
    writeCase('email', 'Write a letter.')
    expect(takenCase(dir, before, email())?.earlier).not.toBeNull()
  })
})

describe('yardstickOf', () => {
  it('changes with a check’s words or weight and with the case’s settings, not with the prompt', () => {
    writeCheck('email', '01-short', 'It is under 50 words.')
    const held = yardstickOf(dir, email())
    writeCase('email', 'Write another email.')
    expect(yardstickOf(dir, email())).toBe(held)

    writeCheck('email', '01-short', 'It is under 50 words.', 2)
    const doubled = yardstickOf(dir, email())
    expect(doubled).not.toBe(held)
    writeCheck('email', '02-greets', 'It greets the reader by name.')
    const added = yardstickOf(dir, email())
    expect(added).not.toBe(doubled)
    writeFileSync(join(caseDir('email'), 'case.yaml'), 'bench:\n  words: [1, 50]\n')
    expect(yardstickOf(dir, email())).not.toBe(added)
  })

  it('is the same whatever a check’s file is called and whatever order the checks come in', () => {
    writeCheck('email', '01-short', 'It is under 50 words.')
    writeCheck('email', '02-greets', 'It greets the reader by name.')
    const held = yardstickOf(dir, email())
    rmSync(join(caseDir('email'), 'graders'), { recursive: true })
    writeCheck('email', '01-hello', 'It greets the reader by name.')
    writeCheck('email', '02-brief', 'It is under 50 words.')
    expect(yardstickOf(dir, email())).toBe(held)
  })
})

describe('the cases a run keeps', () => {
  it('are the cases as the run started, each with what it asked', () => {
    keepCases(dir, run, loadCases(dir))
    const kept = keptCases(run)
    expect(kept?.map((entry) => entry.case.id)).toEqual(['email'])
    expect(kept?.[0].case.prompt).toBe('Write the email.')
    expect(kept?.[0].ask).toBe(askOf(dir, email()))
  })

  it('is none for a run that kept no file, and passes over an entry that names no case', () => {
    expect(keptCases(run)).toBeNull()
    keepCases(dir, run, loadCases(dir))
    const file = join(run, CASES_FILE)
    const held = readJson<unknown[]>(file, [])
    writeFileSync(
      file,
      JSON.stringify([
        ...held,
        null,
        { ask: 'x' },
        { ask: 'x', case: { id: '../up', prompt: 'p' } },
      ]),
    )
    expect(keptCases(run)?.map((entry) => entry.case.id)).toEqual(['email'])
    writeFileSync(file, '{ torn')
    expect(keptCases(run)).toBeNull()
  })

  it('tells a run that kept none from one whose file is damaged', () => {
    expect(readKept(run, ['email'])).toEqual({ kept: null, damaged: false })
    keepCases(dir, run, loadCases(dir))
    expect(readKept(run, ['email']).damaged).toBe(false)
    const file = join(run, CASES_FILE)
    const held = readJson<unknown[]>(file, [])
    // A case the run answered that the file does not hold.
    expect(readKept(run, ['email', 'note']).damaged).toBe(true)
    writeFileSync(file, JSON.stringify([...held, { ask: 'x' }]))
    expect(readKept(run, ['email'])).toMatchObject({ damaged: true })
    expect(readKept(run, ['email']).kept?.map((entry) => entry.case.id)).toEqual(['email'])
    writeFileSync(file, '{ torn')
    expect(readKept(run, ['email'])).toEqual({ kept: null, damaged: true })
    writeFileSync(file, '{"email": {}}')
    expect(readKept(run, ['email'])).toEqual({ kept: null, damaged: true })
  })

  it('reads a case written by hand into shapes every reader can use', () => {
    writeFileSync(
      join(run, CASES_FILE),
      JSON.stringify([
        {
          ask: 'a',
          case: {
            id: 'note',
            prompt: 'Write it.',
            graders: [{ statement: 'Short.', weight: 99 }, 'x'],
            bench: { size: 'big' },
          },
        },
      ]),
    )
    const [entry] = keptCases(run) ?? []
    expect(entry.case).toMatchObject({
      title: 'note',
      files: [],
      bench: {},
      settings: { tags: [], allowedTools: null },
    })
    expect(entry.case.graders).toHaveLength(1)
    expect(entry.case.graders[0]).toMatchObject({ statement: 'Short.', image: null, type: 'llm' })
    expect(entry.case.graders[0].weight).toBeLessThan(99)
  })
})

describe('the pictures a run keeps with its cases', () => {
  const picture = (bytes: string) => {
    mkdirSync(join(caseDir('email'), 'references'), { recursive: true })
    writeFileSync(join(caseDir('email'), 'references/look.png'), bytes)
  }

  it('reads a check of the run’s copy on its picture as it was, once the case changed or went', () => {
    picture('first')
    mkdirSync(join(caseDir('email'), 'graders'), { recursive: true })
    writeFileSync(
      join(caseDir('email'), 'graders/01-look.md'),
      '---\nimage: references/look.png\n---\nIt looks like the picture.\n',
    )
    keepCases(dir, run, loadCases(dir))
    const [kept] = keptCases(run) ?? []
    const image = kept.case.graders[0].image ?? ''
    expect(image).toBe('evals/runs/r1/_checks/email/evals/cases/email/references/look.png')
    expect(readFileSync(join(dir, image), 'utf8')).toBe('first')
    const held = takenCase(dir, kept, null)?.yardstick

    picture('second')
    writeCase('email', 'Write a letter.')
    const taken = takenCase(dir, kept, email())
    expect(taken?.earlier).not.toBeNull()
    expect(taken?.case.graders[0].image).toBe(image)
    expect(taken?.yardstick).toBe(held)
    rmSync(caseDir('email'), { recursive: true })
    expect(takenCase(dir, kept, null)?.yardstick).toBe(held)
  })

  it('leaves a check whose picture is not there as it was', () => {
    mkdirSync(join(caseDir('email'), 'graders'), { recursive: true })
    writeFileSync(
      join(caseDir('email'), 'graders/01-look.md'),
      '---\nimage: references/look.png\n---\nIt looks like the picture.\n',
    )
    keepCases(dir, run, loadCases(dir))
    expect(keptCases(run)?.[0].case.graders[0].image).toBeNull()
  })
})

describe('takenCase', () => {
  it('is the skill’s case, checks as they are now, while it asks what the run was asked', () => {
    keepCases(dir, run, loadCases(dir))
    const [kept] = keptCases(run) ?? []
    writeCheck('email', '01-short', 'It is under 50 words.')
    const taken = takenCase(dir, kept, email())
    expect(taken?.earlier).toBeNull()
    expect(taken?.case.graders).toHaveLength(1)
    expect(taken?.yardstick).toBe(yardstickOf(dir, email()))
  })

  it('is the run’s own copy, whole, once the prompt changed or the case is gone', () => {
    writeCheck('email', '01-short', 'It is under 50 words.')
    keepCases(dir, run, loadCases(dir))
    const [kept] = keptCases(run) ?? []
    writeCase('email', 'Write a letter.')
    writeCheck('email', '02-letter', 'It is a letter.')
    const edited = takenCase(dir, kept, email())
    expect(edited?.earlier?.prompt).toBe('Write the email.')
    expect(edited?.case.graders.map((g) => g.statement)).toEqual(['It is under 50 words.'])
    expect(edited?.ask).toBe(kept.ask)
    expect(takenCase(dir, kept, null)?.earlier?.prompt).toBe('Write the email.')
  })

  it('is the skill’s case as it is for a run that kept none, and nothing with neither', () => {
    expect(takenCase(dir, null, email())).toMatchObject({ earlier: null, ask: askOf(dir, email()) })
    expect(takenCase(dir, null, null)).toBeNull()
  })
})

describe('runCases', () => {
  it('takes a case a damaged file lost as it is now, and none the run did not answer', () => {
    writeCase('note', 'Write the note.')
    writeFileSync(join(run, CASES_FILE), '[]')
    writeCase('later', 'Added after the run.')
    const cases = runCases(dir, run, loadCases(dir), [], ['email', 'note'])
    expect(Object.keys(cases).sort()).toEqual(['email', 'note'])
    expect(cases.email.earlier).toBeNull()
  })

  it('lists each case a run kept, and marks the ones the skill no longer asks', () => {
    writeCase('note', 'Write the note.')
    keepCases(dir, run, loadCases(dir))
    writeCase('email', 'Write a letter.')
    rmSync(caseDir('note'), { recursive: true })
    writeCase('later', 'Added after the run.')
    const cases = runCases(dir, run, loadCases(dir))
    expect(Object.keys(cases).sort()).toEqual(['email', 'note'])
    expect(cases.email.earlier?.prompt).toBe('Write the email.')
    expect(cases.note.earlier?.prompt).toBe('Write the note.')
  })

  it('reads a run that kept no cases against the skill’s cases as they are', () => {
    const cases = runCases(dir, run, loadCases(dir))
    expect(cases.email).toEqual({
      ask: askOf(dir, email()),
      yardstick: yardstickOf(dir, email()),
      earlier: null,
    })
  })
})

describe('the checks for every case', () => {
  const writeEvery = (name: string, statement: string, extra = '') => {
    mkdirSync(join(dir, 'evals/graders'), { recursive: true })
    writeFileSync(
      join(dir, 'evals/graders', `${name}.md`),
      `---\nweight: 1\n${extra}---\n${statement}\n`,
    )
  }

  it('load from evals/graders under ids no case’s own check can have, and are no case', () => {
    writeCheck('email', '01-names', 'It names the product.')
    writeEvery('01-names', 'It names the product.')
    writeFileSync(join(dir, 'evals/graders', 'notes.txt'), 'not a check')
    writeFileSync(join(dir, 'evals/graders', 'prompt.md'), '---\n---\nNot a case either.\n')
    const every = loadEveryCase(dir)
    expect(every.map((g) => g.id)).toEqual(['every/01-names', 'every/prompt'])
    expect(loadCases(dir).map((c) => c.id)).toEqual(['email'])
    expect(loadEveryCase(join(dir, 'nowhere'))).toEqual([])
  })

  it('are graded after a case’s own, and count in its yardstick only when there are some', () => {
    writeCheck('email', '01-short', 'It is under 50 words.')
    const held = yardstickOf(dir, email())
    expect(takenCase(dir, null, email(), [])?.yardstick).toBe(held)
    writeEvery('01-names', 'It names the product.')
    const taken = takenCase(dir, null, email(), loadEveryCase(dir))
    expect(taken?.case.graders.map((g) => g.id)).toEqual(['01-short', 'every/01-names'])
    expect(taken?.yardstick).not.toBe(held)
    expect(runCases(dir, run, loadCases(dir), null, [], loadEveryCase(dir)).email.yardstick).toBe(
      taken?.yardstick,
    )
  })

  it('are kept with each case a run answers, and read from that copy once the case changed', () => {
    writeEvery('01-names', 'It names the product.')
    keepCases(dir, run, loadCases(dir), loadEveryCase(dir))
    const [kept] = keptCases(run) ?? []
    expect(kept.every?.map((g) => g.statement)).toEqual(['It names the product.'])
    writeEvery('01-names', 'It names the product and its version.')
    // While the case asks what the run was asked, the checks are read as they are now.
    expect(takenCase(dir, kept, email(), loadEveryCase(dir))?.case.graders.at(-1)?.statement).toBe(
      'It names the product and its version.',
    )
    writeCase('email', 'Write a letter.')
    const earlier = takenCase(dir, kept, email(), loadEveryCase(dir))
    expect(earlier?.case.graders.map((g) => g.statement)).toEqual(['It names the product.'])
    // What the agent was asked, without them.
    expect(earlier?.earlier?.graders).toEqual([])
  })

  it('are none on a run kept before runs kept them', () => {
    keepCases(dir, run, loadCases(dir))
    const file = join(run, CASES_FILE)
    const held = readJson<Array<Record<string, unknown>>>(file, [])
    writeFileSync(file, JSON.stringify(held.map(({ every: _, ...rest }) => rest)))
    const [kept] = keptCases(run) ?? []
    expect(kept.every).toBeUndefined()
    writeEvery('01-names', 'It names the product.')
    writeCase('email', 'Write a letter.')
    expect(takenCase(dir, kept, email(), loadEveryCase(dir))?.case.graders).toEqual([])
  })

  it('keep the picture a check is about with the run, as a case’s check does', () => {
    mkdirSync(join(dir, 'evals/references'), { recursive: true })
    writeFileSync(join(dir, 'evals/references/logo.png'), 'png')
    writeEvery('01-logo', 'It shows the logo.', 'image: references/logo.png\n')
    const [check] = loadEveryCase(dir)
    expect(check.image).toBe('evals/references/logo.png')
    keepCases(dir, run, loadCases(dir), [check])
    const [kept] = keptCases(run) ?? []
    const image = kept.every?.[0].image ?? ''
    expect(image).toBe('evals/runs/r1/_checks/email/evals/references/logo.png')
    expect(readFileSync(join(dir, image), 'utf8')).toBe('png')
  })
})
