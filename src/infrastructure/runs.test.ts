import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeJson } from './fs.ts'
import { readRunMeta } from './runs.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'st-runs-'))
  writeFileSync(join(dir, 'SKILL.md'), 'first')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('reading run.json again', () => {
  it('reads a file replaced by one of the same size and time', () => {
    const path = join(dir, 'evals/runs/r1/run.json')
    mkdirSync(join(dir, 'evals/runs/r1'), { recursive: true })
    // A time to the second, so it is set back exactly.
    const then = new Date('2026-11-01T10:00:00Z')
    writeJson(path, { skillName: 'aaaa' })
    utimesSync(path, then, then)
    expect(readRunMeta(dir, 'r1')?.skillName).toBe('aaaa')
    writeJson(path, { skillName: 'bbbb' })
    utimesSync(path, then, then)
    expect(readRunMeta(dir, 'r1')?.skillName).toBe('bbbb')
  })
})
