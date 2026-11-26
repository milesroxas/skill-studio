import { cpSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { compare } from './compare.ts'
import { contextOf, printOpen } from './shared.ts'

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
    expect(printed).toEqual([`\nOpen: pnpm st open '/My Skills/Sam'\\''s notes' --a r1 --b r2`])
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
    expect(printed.at(-1)).toBe(`\nOpen: pnpm st open '${skill}' --a ${runs[0]} --b ${runs[1]}`)
    printed = []
    expect(await compare.run(contextOf([skill, ...runs], { json: true }, null))).toBe(0)
    expect(printed).toHaveLength(1)
    expect(() => JSON.parse(printed[0])).not.toThrow()
  })
})
