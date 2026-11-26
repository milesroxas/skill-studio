/**
 * `st sheet` without drawing: what it says of the outputs it leaves out. The
 * sheet as the drawing host draws it is `pnpm test:draw`'s.
 */

import { EventEmitter } from 'node:events'
import {
  cpSync,
  existsSync,
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
import { leftOutLine, sheet, sheetFile, undrawnLine, whenStopped } from './sheet.ts'

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
    // Quoted as the shell reads it: in double quotes on Windows.
    const skill = process.platform === 'win32' ? '"/s/my skill"' : "'/s/my skill'"
    expect(undrawnLine('/s/my skill', 'r1', 'Launch page', [2])).toBe(
      `Launch page, r1: attempt 2 has no drawn page, so it is left out. Grade the run with TYPESAFE_API_KEY set and without --no-jev or --no-draw to draw it: pnpm st grade ${skill} --run r1`,
    )
    // A grading draws a page only where Jev grades it, so the line says what that takes.
    expect(undrawnLine('/s', 'r1', 'Launch page', [1, 2, 4])).toBe(
      'Launch page, r1: attempts 1, 2 and 4 have no drawn page, so they are left out. Grade the run with TYPESAFE_API_KEY set and without --no-jev or --no-draw to draw them: pnpm st grade /s --run r1',
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
      `Landing page for a bike repair shop, ${RUN}: attempt 1 has no drawn page, so it is left out. Grade the run with TYPESAFE_API_KEY set and without --no-jev or --no-draw to draw it: pnpm st grade ${skill} --run ${RUN}`,
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

describe('whenStopped', () => {
  /** A stand-in for `process`: signals sent with `emit`, and the code it exited with. */
  const fakeProcess = () => {
    const events = new EventEmitter()
    const exited: number[] = []
    return {
      events,
      exited,
      host: {
        once: (event: string, listener: () => void) => events.once(event, listener),
        off: (event: string, listener: () => void) => events.off(event, listener),
        exit: (code: number) => void exited.push(code),
      },
    }
  }

  it('removes the page folder when the command is stopped, then exits as a stopped command does', () => {
    const folder = mkdtempSync(join(scratch, 'page-'))
    const { events, exited, host } = fakeProcess()
    whenStopped(() => rmSync(folder, { recursive: true, force: true }), host)
    events.emit('SIGINT')
    expect(existsSync(folder)).toBe(false)
    expect(exited).toEqual([130])
  })

  it('lets go of the signals once the command has ended by itself', () => {
    const cleaned: string[] = []
    const { events, exited, host } = fakeProcess()
    const release = whenStopped(() => cleaned.push('cleaned'), host)
    release()
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) events.emit(signal)
    expect([cleaned, exited]).toEqual([[], []])
    expect(events.eventNames()).toEqual([])
  })
})
