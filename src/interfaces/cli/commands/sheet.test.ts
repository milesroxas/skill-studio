/**
 * `st sheet` without drawing: what it says of the outputs it leaves out. The
 * sheet as the drawing host draws it is `pnpm test:draw`'s.
 */
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
import { join, resolve } from 'node:path'
import { pngOf } from '@infrastructure/__fixtures__/png.ts'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { contextOf } from './shared.ts'
import { leftOutLine, sheet, sheetFile, undrawnLine } from './sheet.ts'

const FIXTURE = resolve(import.meta.dirname, '../../../../fixtures/design-skill')
const RUN = '2026-10-30-skill-v0-claude-haiku'
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'st-sheet-test-')))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

describe('the lines st sheet prints', () => {
  it('says which attempts have no drawn page, and how to draw them', () => {
    expect(undrawnLine('/s/my skill', 'r1', 'Launch page', [2])).toBe(
      "Launch page, r1: attempt 2 has no drawn page, so it is left out. Grade the run first: pnpm st grade '/s/my skill' --run r1",
    )
    expect(undrawnLine('/s', 'r1', 'Launch page', [1, 2, 4])).toContain(
      'attempts 1, 2 and 4 have no drawn page, so they are left out.',
    )
  })

  it('says how many attempts a sheet had no room for', () => {
    expect(leftOutLine('Launch page', 1)).toBe(
      'Launch page: 1 attempt is left out, as a sheet holds 12 at most.',
    )
    expect(leftOutLine('Launch page', 8)).toBe(
      'Launch page: 8 attempts are left out, as a sheet holds 12 at most.',
    )
  })

  it('names a sheet by its case, unless the id is no plain file name', () => {
    expect(sheetFile('landing', 0)).toBe('landing.png')
    expect(sheetFile('../up', 2)).toBe('case-3.png')
    expect(sheetFile('.hidden', 0)).toBe('case-1.png')
  })
})

describe('st sheet', () => {
  /** What the command printed and said, run on a scratch copy of `fixtures/design-skill`. */
  async function sheetOf(
    values: Record<string, string | string[]>,
    prepare: (skill: string) => void = () => {},
  ) {
    const skill = join(scratch, `skill-${Math.random().toString(36).slice(2)}`)
    cpSync(FIXTURE, skill, { recursive: true, verbatimSymlinks: true })
    prepare(skill)
    const out: string[] = []
    const said: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: string) => void out.push(line))
    vi.spyOn(console, 'error').mockImplementation((line: string) => void said.push(line))
    const code = await sheet.run(contextOf([skill], values, null))
    return { skill, code, out, said }
  }

  it('leaves out a page no grading drew, says to grade its run, and starts nothing to draw', async () => {
    const outDir = join(scratch, 'sheets')
    mkdirSync(outDir)
    const { skill, code, out, said } = await sheetOf({ run: [RUN], out: outDir })
    expect(code).toBe(1)
    expect(out).toEqual([])
    expect(said).toEqual([
      `Landing page for a bike repair shop, ${RUN}: attempt 1 has no drawn page, so it is left out. Grade the run first: pnpm st grade ${skill} --run ${RUN}`,
    ])
  })

  it('names the sheets it could not make when the host cannot draw, and exits 1', async () => {
    // No Electron to start, whatever this checkout has built.
    vi.stubEnv('ELECTRON_OVERRIDE_DIST_PATH', join(scratch, 'no-electron'))
    const pages = (dir: string) => readdirSync(dir).filter((f) => f.startsWith('st-sheet-page-'))
    const before = pages(tmpdir())
    const { code, out, said } = await sheetOf({ run: [RUN] }, (skill) => {
      const renders = join(skill, 'evals/runs', RUN, 'landing-s1/renders')
      mkdirSync(renders)
      writeFileSync(
        join(renders, 'desktop-1280x960.png'),
        pngOf(4, 3, () => [255, 0, 0, 255]),
      )
    })
    expect(code).toBe(1)
    expect(out).toEqual([])
    expect(said.at(-1)).toBe('Sheets not made: Landing page for a bike repair shop.')
    // Its page's folder is gone with it.
    expect(pages(tmpdir())).toEqual(before)
  })

  it('asks for a run, a run that is there, and a case one of them has a page for', async () => {
    await expect(sheetOf({})).rejects.toThrow('Pass --run <name>, once for each run to show.')
    await expect(sheetOf({ run: ['no-such-run'] })).rejects.toThrow('has no run named no-such-run.')
    await expect(sheetOf({ run: [RUN], case: 'other' })).rejects.toThrow(
      'No run named has a page for the case other.',
    )
  })
})
