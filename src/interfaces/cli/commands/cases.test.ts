import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cases } from './cases.ts'
import { contextOf } from './shared.ts'

let scratch: string
let printed: string[]
beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'st-cases-'))
  printed = []
  vi.spyOn(console, 'log').mockImplementation((line: string) => {
    printed.push(line)
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(scratch, { recursive: true, force: true })
})

/** A scratch skill with a case for each id, each asking for a note. */
function skillWith(ids: string[]): string {
  const skill = join(scratch, 'note')
  mkdirSync(skill, { recursive: true })
  writeFileSync(
    join(skill, 'SKILL.md'),
    '---\nname: note\ndescription: Notes.\n---\n\n- Be short.\n',
  )
  for (const id of ids) {
    mkdirSync(join(skill, 'evals', 'cases', id), { recursive: true })
    writeFileSync(join(skill, 'evals', 'cases', id, 'prompt.md'), 'Write a note.\n')
  }
  return skill
}

describe('st cases', () => {
  it('prints an id of 40 characters whole, as --cases takes it', async () => {
    const long = 'a-launch-note-for-the-spring-sale-in-may' // 40 characters
    expect(long).toHaveLength(40)
    await cases.run(contextOf([skillWith([long, 'short'])], {}, null))
    const rows = printed.slice(1)
    expect(rows.map((row) => row.trim().split(/\s+/)[0]).sort()).toEqual([long, 'short'])
    // The next column starts at the same place on every row.
    const starts = rows.map((row) => row.search(/\d+ grader/))
    expect(new Set(starts).size).toBe(1)
  })

  it('keeps the column where it was when every id is short', async () => {
    await cases.run(contextOf([skillWith(['short'])], {}, null))
    expect(printed[1]).toBe(`  ${'short'.padEnd(35)}0 grader(s)  short`)
  })
})
