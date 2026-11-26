import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { loadCases } from '@infrastructure/cases.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { caseCheck } from './case-check.ts'
import { contextOf } from './shared.ts'

let scratch: string
let printed: string[]
beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'st-case-check-'))
  printed = []
  vi.spyOn(console, 'log').mockImplementation((line: string) => {
    printed.push(line)
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(scratch, { recursive: true, force: true })
})

const check = (skill: string): Promise<number> => caseCheck.run(contextOf([skill], {}, null))

/** A printed line with the skill's folder as `<skill>`: a path is printed as the system writes it, with `\\` on Windows. */
const under =
  (skill: string) =>
  (line: string): string =>
    line.replace(realpathSync(skill), '<skill>').replaceAll(sep, '/')

/** A scratch skill whose cases are the given files, by path under the skill. */
function skillWith(files: Record<string, string>): string {
  const skill = join(scratch, 'note')
  const all = { 'SKILL.md': '---\nname: note\ndescription: Notes.\n---\n\n- Be short.\n', ...files }
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(join(skill, path, '..'), { recursive: true })
    writeFileSync(join(skill, path), text)
  }
  return skill
}

describe('st case check', () => {
  it('lists each case and check file that will not load or is skipped, and exits 1', async () => {
    const skill = skillWith({
      'evals/cases/good/prompt.md': 'Write it.',
      'evals/cases/good/case.yaml': 'title: Tone\nbench:\n  words: 100-200\n',
      'evals/cases/good/graders/01-short.md': 'It is short.',
      'evals/cases/good/graders/02-heavy.md': '---\nweight: 9\n---\n\nIt is kind.',
      'evals/cases/good/graders/03-odd.md': '---\nweight: heavy\n---\n\nIt is plain.',
      'evals/cases/good/graders/04-fine.md': '---\nweight: 2\n---\n\nIt is fine.',
      'evals/cases/no prompt here/prompt.md': 'Write it.',
      'evals/cases/empty/notes.md': 'Nothing yet.',
      'evals/graders/01-every.md': 'Every answer is polite.',
    })
    expect(await check(skill)).toBe(1)
    const [head, ...lines] = printed
    expect(head).toBe('note: 1 case(s), 3 check(s), 7 problem(s)')
    const said = lines.map(under(skill)).sort()
    expect(said).toEqual(
      [
        "  - <skill>/evals/cases/good/graders/01-short.md is skipped: a check's file starts with front matter (---), even an empty block.",
        '  - <skill>/evals/cases/good/graders/02-heavy.md: weight 9 is out of range, 1 to 5, so it is read as 5.',
        '  - <skill>/evals/cases/good/graders/03-odd.md: weight heavy is not a whole number from 1 to 5, so it is read as 1.',
        '  - <skill>/evals/cases/good/case.yaml: bench.words is "100-200", which is not a least and a most number of words, so it is left out.',
        "  - <skill>/evals/cases/no prompt here is left out: a case's folder names a folder in every run, so its name may hold only letters, digits, dots, dashes and underscores.",
        "  - <skill>/evals/cases/empty is skipped: a case's folder holds its prompt in prompt.md.",
        "  - <skill>/evals/graders/01-every.md is skipped: a check's file starts with front matter (---), even an empty block.",
      ].sort(),
    )
  })

  it('lists a case that cannot be read, and each folder and evals.json entry another case shadows', async () => {
    const skill = skillWith({
      'evals/cases/good/prompt.md': 'Write it.',
      'evals/cases/bad/prompt.md': 'Write it.',
      'evals/cases/bad/case.yaml': 'title: [unclosed\n',
      'evals/good/prompt.md': 'Write it here too.',
      'evals/cases/3-kept/prompt.md': 'Keep it.',
      'evals/evals.json': JSON.stringify({
        evals: [
          { id: 1, name: 'none' },
          { id: 'x y', prompt: 'Hi.' },
          { id: 3, name: 'kept', prompt: 'Keep it.' },
          { id: 4, name: 'own', prompt: 'Its own.' },
        ],
      }),
    })
    expect(await check(skill)).toBe(1)
    const [head, ...lines] = printed
    expect(head).toBe('note: 3 case(s), 0 check(s), 5 problem(s)')
    const said = lines.map(under(skill))
    expect(said).toEqual([
      '  - <skill>/evals/cases/bad could not be read as a case: Flow sequence in block collection must be sufficiently indented and end with a ] at line 2, column 1: title: [unclosed ^',
      '  - <skill>/evals/good is skipped: the case good under evals/cases/ is read in its place.',
      '  - <skill>/evals/evals.json: the case 1 has no prompt, so it is left out.',
      '  - <skill>/evals/evals.json: the case "x y" is left out: its name, x y, names a folder in every run. Use lowercase letters, digits and single dashes, like release-notes.',
      '  - <skill>/evals/evals.json: the case 3 is skipped: the case folder 3-kept is read in its place.',
    ])
  })

  it('lists an evals.json that is not JSON, and still reads the case folders', async () => {
    const skill = skillWith({
      'evals/cases/good/prompt.md': 'Write it.',
      'evals/evals.json': '{ nope',
    })
    expect(await check(skill)).toBe(1)
    const said = printed.map(under(skill))
    expect(said).toEqual([
      'note: 1 case(s), 0 check(s), 1 problem(s)',
      "  - <skill>/evals/evals.json is malformed and could not be read: Expected property name or '}' in JSON at position 2 (line 1 column 3)",
    ])
    // The app still stops on it, as it did.
    expect(() => loadCases(skill)).toThrow('is malformed')
  })

  it('lists a title two cases share', async () => {
    const skill = skillWith({
      'evals/cases/good/prompt.md': 'Write it.',
      'evals/cases/good/case.yaml': 'title: Tone\n',
      'evals/cases/again/prompt.md': 'Write it again.',
      'evals/cases/again/case.yaml': 'title: tone \n',
    })
    expect(await check(skill)).toBe(1)
    expect(printed).toEqual([
      'note: 2 case(s), 0 check(s), 1 problem(s)',
      '  - 2 cases are called tone (again, good): cases are told apart by title, so give each one its own.',
    ])
  })

  it('passes a skill whose cases all load as written', async () => {
    const skill = skillWith({
      'evals/cases/good/prompt.md': 'Write it.',
      'evals/cases/good/case.yaml': 'title: Tone\n',
      'evals/cases/good/graders/01-short.md': '---\nweight: 2\n---\n\nIt is short.',
      'evals/graders/01-every.md': '---\n---\n\nEvery answer is polite.',
    })
    expect(await check(skill)).toBe(0)
    expect(printed).toEqual(['note: 1 case(s), 2 check(s), no problems'])
  })

  const fixtures = resolve(import.meta.dirname, '../../../../fixtures')
  it.each(readdirSync(fixtures))('passes on a copy of fixtures/%s', async (name) => {
    // A copy, never the fixture in place; its runs are not read.
    const skill = join(scratch, name)
    cpSync(join(fixtures, name), skill, {
      recursive: true,
      filter: (path) => relative(join(fixtures, name), path) !== join('evals', 'runs'),
    })
    expect(await check(skill)).toBe(0)
    expect(printed.join('\n')).toMatch(/no problems$/)
  })
})
