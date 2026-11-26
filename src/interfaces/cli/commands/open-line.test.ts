import { cpSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { compare } from './compare.ts'
import { contextOf, printOpen, shellWord } from './shared.ts'

const WINDOWS = process.platform === 'win32'

let scratch: string
let printed: string[]
beforeEach(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'st-open-line-')))
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

describe('the Open line', () => {
  it('names the run `st run` made', () => {
    printOpen(false, '/skills/notes', '2026-11-20-skill-v0-claude-haiku')
    expect(printed).toEqual([
      '\nOpen: pnpm st open /skills/notes --a 2026-11-20-skill-v0-claude-haiku',
    ])
  })

  it('quotes a path a shell would split, so the line runs as copied', () => {
    printOpen(false, "/My Skills/Sam's notes", 'r1', 'r2')
    const path = WINDOWS ? `"/My Skills/Sam's notes"` : `'/My Skills/Sam'\\''s notes'`
    expect(printed).toEqual([`\nOpen: pnpm st open ${path} --a r1 --b r2`])
  })

  it('quotes a Windows path as PowerShell and cmd.exe read it, and only where they would split it', () => {
    expect(shellWord('C:\\Users\\RUNNER~1\\notes', 'win32')).toBe('C:\\Users\\RUNNER~1\\notes')
    expect(shellWord('C:\\Users\\Sam Lee\\notes', 'win32')).toBe('"C:\\Users\\Sam Lee\\notes"')
    expect(shellWord("C:\\Users\\Sam's\\notes", 'win32')).toBe('"C:\\Users\\Sam\'s\\notes"')
    // A shell on macOS or Linux reads a backslash as an escape.
    expect(shellWord('C:\\notes', 'linux')).toBe("'C:\\notes'")
    expect(shellWord('2026-11-20-skill-v0-claude-haiku', 'win32')).toBe(
      '2026-11-20-skill-v0-claude-haiku',
    )
  })

  it('is not printed with --json', () => {
    printOpen(true, '/skills/notes', 'r1', 'r2')
    expect(printed).toEqual([])
  })

  it('ends what `st compare` prints, naming both runs, and is left out of its JSON', async () => {
    // A copy, with a space in its path: the stored runs under fixtures/ are what tests are pinned to.
    const skill = join(scratch, 'demo skill')
    cpSync(resolve('fixtures/demo-skill'), skill, { recursive: true })
    const runs = ['2026-10-30-skill-v0-claude-haiku', '2026-10-30-skill-v0-claude-haiku-2']
    expect(await compare.run(contextOf([skill, ...runs], {}, null))).toBe(0)
    const quoted = WINDOWS ? `"${skill}"` : `'${skill}'`
    expect(printed.at(-1)).toBe(`\nOpen: pnpm st open ${quoted} --a ${runs[0]} --b ${runs[1]}`)
    printed = []
    expect(await compare.run(contextOf([skill, ...runs], { json: true }, null))).toBe(0)
    expect(printed).toHaveLength(1)
    expect(() => JSON.parse(printed[0])).not.toThrow()
  })
})
