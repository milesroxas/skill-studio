import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { compare } from './compare.ts'
import { report } from './report.ts'
import { contextOf } from './shared.ts'

const RUNS = ['2026-10-30-skill-v0-claude-haiku', '2026-10-30-skill-v0-claude-haiku-2']
/** The longest a case id may be, past each column the tables began with. */
const LONG = 'a-launch-note-for-the-spring-sale-in-may'

let scratch: string
let printed: string[]
beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'st-tables-'))
  printed = []
  vi.spyOn(console, 'log').mockImplementation((line: string) => {
    printed.push(...line.split('\n'))
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(scratch, { recursive: true, force: true })
})

/**
 * A scratch copy of `fixtures/demo-skill` whose one case, and each run's
 * answer to it, is named `id`: the stored runs under fixtures/ are what tests
 * are pinned to.
 */
function skillNamed(id: string): string {
  const skill = join(scratch, 'demo-skill')
  cpSync(resolve('fixtures/demo-skill'), skill, { recursive: true })
  renameSync(join(skill, 'evals/cases/release-note'), join(skill, 'evals/cases', id))
  for (const run of RUNS) {
    const dir = join(skill, 'evals/runs', run)
    renameSync(join(dir, 'release-note-s1'), join(dir, `${id}-s1`))
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')))
      writeFileSync(
        join(dir, file),
        readFileSync(join(dir, file), 'utf8').replaceAll('release-note', id),
      )
  }
  return skill
}

describe('the tables st report and st compare print', () => {
  it('print a case and a sample of the longest id whole, each column where its head is', async () => {
    expect(LONG).toHaveLength(40)
    const skill = skillNamed(LONG)
    expect(await report.run(contextOf([skill], { run: RUNS[0] }, null))).toBe(0)
    const head = printed.find((line) => line.startsWith('sample')) ?? ''
    const [scores] = printed.filter((line) => line.startsWith(`${LONG}-s1 `))
    expect(scores.slice(head.indexOf('case'))).toMatch(new RegExp(`^${LONG} +\\d`))
    expect(printed).toContainEqual(
      expect.stringMatching(new RegExp(`^  ${LONG}-s1 +checks 3 of 3`)),
    )

    printed = []
    expect(await compare.run(contextOf([skill, ...RUNS], {}, null))).toBe(0)
    const sampleHead = printed.find((line) => line.startsWith('sample')) ?? ''
    const [moved] = printed.filter((line) => line.startsWith(`${LONG} ${LONG}-s1 `))
    // The first change ends where its head does.
    const first = new RegExp(`^${LONG} ${LONG}-s1 +-?\\d+`).exec(moved)?.[0] ?? ''
    expect(first.length).toBe(sampleHead.indexOf('total') + 'total'.length)
    expect(printed).toContainEqual(
      expect.stringMatching(new RegExp(`^  ${LONG} the same    checks met 3 of 3`)),
    )
  })
})
