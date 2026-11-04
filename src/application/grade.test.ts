import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Report } from '@domain/schemas.ts'
import { readJson } from '@infrastructure/fs.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gradeRun } from './grade.ts'

const FIXTURE = resolve(import.meta.dirname, '../../fixtures/demo-skill')
const RUN = '2026-10-30-skill-v0-claude-haiku'

let skill: string

beforeAll(() => {
  skill = join(mkdtempSync(join(tmpdir(), 'st-grade-')), 'demo-skill')
  cpSync(FIXTURE, skill, { recursive: true, verbatimSymlinks: true })
})

afterAll(() => rmSync(join(skill, '..'), { recursive: true, force: true }))

describe('gradeRun without Jev (st grade --no-jev)', () => {
  it('writes report.json with code-only scores for every sample', async () => {
    const report = await gradeRun(skill, RUN, { useJev: false })
    const path = join(skill, 'evals/runs', RUN, 'report.json')
    expect(existsSync(path)).toBe(true)
    const saved = readJson<Report | null>(path, null)
    expect(saved?.model).toBeNull()
    expect(saved?.results.map((r) => r.sample)).toEqual(['release-note-s1'])
    const [result] = report.results
    expect(result.case).toBe('release-note')
    // Jev layers stay null; the workflow pack's code layers are scored.
    expect(result.scores).toMatchObject({ adherence: null, rubric: null, process: null })
    expect(result.scores.efficiency).toBeTypeOf('number')
    expect(result.scores.total).toBeTypeOf('number')
  })
})
