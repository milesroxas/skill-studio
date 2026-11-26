import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { loadCases } from '@infrastructure/cases.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { caseAdd } from './case-add.ts'
import type { Values } from './command.ts'
import { commandOf, OPTIONS } from './index.ts'
import { contextOf } from './shared.ts'

let scratch: string
let skill: string
beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'st-case-add-'))
  skill = join(scratch, 'note')
  mkdirSync(join(skill, 'evals/cases'), { recursive: true })
  writeFileSync(
    join(skill, 'SKILL.md'),
    '---\nname: note\ndescription: Notes.\n---\n\n- Be short.\n',
  )
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(scratch, { recursive: true, force: true })
})

/** `st case add <skill> ...argv`, read as `st.ts` reads it. */
function add(...argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: ['case', 'add', skill, ...argv],
    allowPositionals: true,
    options: OPTIONS,
  })
  const found = commandOf(positionals)
  if (found?.command !== caseAdd) throw new Error('st case add was not found.')
  return found.command.run(contextOf(found.args, values as Values, null))
}

describe('st case add', () => {
  it('writes a case with a check for each --check and a copy of each --file', async () => {
    const notes = join(scratch, 'notes.txt')
    writeFileSync(notes, 'Ship on Friday.')
    const screen = join(scratch, 'screen')
    mkdirSync(join(screen, 'parts'), { recursive: true })
    writeFileSync(join(screen, 'index.html'), '<p>Hi</p>')
    writeFileSync(join(screen, 'parts/head.html'), '<h1>Hi</h1>')
    const code = await add(
      '--title',
      'Launch note',
      '--prompt',
      'Write the launch note.',
      '--check',
      'It names the day, Friday.',
      '--check',
      'It is under 100 words.',
      '--file',
      notes,
      '--file',
      screen,
      '--artifact',
      'html',
      '--size',
      '1280x800',
    )
    expect(code).toBe(0)
    const [saved] = loadCases(skill)
    expect(saved).toMatchObject({
      id: 'launch-note',
      title: 'Launch note',
      prompt: 'Write the launch note.',
      bench: { artifact: 'html', size: [1280, 800] },
    })
    expect(saved.graders.map((g) => [g.statement, g.weight])).toEqual([
      ['It names the day, Friday.', 1],
      ['It is under 100 words.', 1],
    ])
    expect(saved.files.sort()).toEqual([
      'evals/cases/launch-note/files/notes.txt',
      'evals/cases/launch-note/files/screen/index.html',
      'evals/cases/launch-note/files/screen/parts/head.html',
    ])
    expect(readFileSync(join(skill, 'evals/cases/launch-note/files/notes.txt'), 'utf8')).toBe(
      'Ship on Friday.',
    )
  })

  it('reads the prompt from --prompt-file, and names a case with no title after its prompt', async () => {
    const file = join(scratch, 'prompt.md')
    writeFileSync(file, 'Reply to the angry customer about the late parcel.\n')
    expect(await add('--prompt-file', file)).toBe(0)
    expect(loadCases(skill)).toMatchObject([
      { id: 'reply-to-the-angry-customer-about', graders: [] },
    ])
  })

  it('refuses what the Cases screen refuses, writing nothing', async () => {
    await add('--title', 'Tone', '--prompt', 'Write it.')
    await expect(add('--title', 'tone ', '--prompt', 'Write it again.')).rejects.toThrow(
      'Another case is called tone',
    )
    await expect(add('--prompt', '  ')).rejects.toThrow('Write a prompt first.')
    await expect(add('--prompt', 'Draw it.', '--size', '0x800')).rejects.toThrow(
      'whole pixels, from 1 to 10,000',
    )
    expect(loadCases(skill).map((c) => c.id)).toEqual(['tone'])
  })

  it('refuses flags it cannot read', async () => {
    const file = join(scratch, 'prompt.md')
    writeFileSync(file, 'Write it.')
    await expect(add('--prompt', 'Write it.', '--prompt-file', file)).rejects.toThrow('not both')
    await expect(add('--title', 'No prompt')).rejects.toThrow('Pass the prompt')
    await expect(add('--prompt', 'Write it.', '--artifact', 'markdown')).rejects.toThrow(
      '--artifact takes html or image, not "markdown"',
    )
    await expect(add('--prompt', 'Write it.', '--size', 'wide')).rejects.toThrow(
      '--size takes a width and a height',
    )
    await expect(add('--prompt', 'Write it.', '--file', join(scratch, 'gone.txt'))).rejects.toThrow(
      'There is no file at',
    )
    mkdirSync(join(scratch, 'a'))
    mkdirSync(join(scratch, 'b'))
    writeFileSync(join(scratch, 'a/x.txt'), 'a')
    writeFileSync(join(scratch, 'b/x.txt'), 'b')
    await expect(
      add(
        '--prompt',
        'Write it.',
        '--file',
        join(scratch, 'a/x.txt'),
        '--file',
        join(scratch, 'b/x.txt'),
      ),
    ).rejects.toThrow('Two --file paths are called x.txt')
    expect(loadCases(skill)).toEqual([])
  })
})
