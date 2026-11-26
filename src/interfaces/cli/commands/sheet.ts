/**
 * `st sheet`: each case's drawn pages from the runs named, side by side in
 * one PNG a case, a row a run and a column an attempt
 * (`@domain/contact-sheet.ts`). It reads the pictures a grading drew in each
 * output's `renders/`, and draws the sheet with the drawing host, from a page
 * it writes with copies of those pictures in a temporary folder.
 */
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { RendererGone } from '@domain/artifact-address.ts'
import { caseName } from '@domain/case-draft.ts'
import {
  SHEET_PANELS_MAX,
  type SheetLayout,
  type SheetPicture,
  type SheetRow,
  sheetLayout,
  sheetPage,
} from '@domain/contact-sheet.ts'
import { pictureSize } from '@domain/image.ts'
import { casesInOrder } from '@domain/results-address.ts'
import { sampleOf } from '@domain/run-name.ts'
import { loadCases } from '@infrastructure/cases.ts'
import { isDir, realPath, writeText } from '@infrastructure/fs.ts'
import { readRun, runDir } from '@infrastructure/runs.ts'
import { SIGNAL_EXITS } from '../../lifecycle.ts'
import { drawingHost } from '../drawing.ts'
import { runNameOf } from '../input.ts'
import { numbers } from './brief.ts'
import type { Command, FlagValues } from './command.ts'
import { shared } from './flags.ts'
import { shellWord, skillOf } from './shared.ts'

const flags = shared('run', 'case', 'out')

/** A picture a grading drew of a page at a desktop size: `desktop-1280x960.png`. */
const DESKTOP = /^desktop-\d+x\d+\.png$/

/** One output of one run: its case and attempt, whether it is a page, and the picture drawn of it. */
interface Output {
  case: string
  attempt: number
  page: boolean
  picture: { path: string; width: number; height: number } | null
}

/** The latest desktop-size picture in an output's `renders/`, with its size; null for none. */
function pictureOf(sampleDir: string): Output['picture'] {
  const dir = join(sampleDir, 'renders')
  if (!isDir(dir)) return null
  const newest = readdirSync(dir)
    .filter((name) => DESKTOP.test(name))
    .map((name) => ({ path: join(dir, name), at: statSync(join(dir, name)).mtimeMs }))
    .sort((a, b) => b.at - a.at)
  for (const { path } of newest) {
    const size = pictureSize(readFileSync(path), path)
    if (size) return { path, width: size[0], height: size[1] }
  }
  return null
}

/** Each output of a run that ran to its end, by the case a grading names, else its name. */
function outputsOf(skill: string, run: string): Output[] {
  const view = readRun(skill, run)
  const graded = new Map(view.report?.results.map((r) => [r.sample, r.case]) ?? [])
  return view.samples
    .filter((s) => !s.cut)
    .map((s) => {
      const { case: id, index } = sampleOf(s.name, graded.get(s.name) ?? null)
      return {
        case: id,
        attempt: index,
        page: s.artifacts.some((a) => a.kind === 'html'),
        picture: pictureOf(s.path),
      }
    })
}

/**
 * The line for a run's pages of a case that have no picture: a grading draws
 * them only where Jev grades and drawing is not turned off.
 */
export function undrawnLine(skill: string, run: string, name: string, attempts: number[]): string {
  const [which, them] =
    attempts.length > 1
      ? [`attempts ${numbers(attempts)} have no drawn page, so they are`, 'them']
      : [`attempt ${attempts[0]} has no drawn page, so it is`, 'it']
  const grade = `pnpm st grade ${shellWord(skill)} --run ${shellWord(run)}`
  return `${name}, ${run}: ${which} left out. Grade the run with TYPESAFE_API_KEY set and without --no-jev or --no-draw to draw ${them}: ${grade}`
}

/** The file a case's sheet is written to: by its id, when that is a plain file name. */
export const sheetFile = (id: string, n: number): string =>
  /^[\w-][\w.-]*$/.test(id) ? `${id}.png` : `case-${n + 1}.png`

/** The line for the attempts a sheet has no room for. */
export function leftOutLine(name: string, count: number): string {
  return `${name}: ${count} ${count === 1 ? 'attempt is' : 'attempts are'} left out, as a sheet holds ${SHEET_PANELS_MAX} at most.`
}

/** The part of `process` `whenStopped` uses, so a test can stand in for it. */
export interface Stoppable {
  once(event: string, listener: () => void): unknown
  off(event: string, listener: () => void): unknown
  exit(code: number): void
}

/**
 * Do `clean` when the command is stopped, by Ctrl-C, a request to stop or its
 * terminal closing, then exit as a stopped command does. Returns what
 * lets go of the signals, for when the command ends by itself.
 */
export function whenStopped(clean: () => void, host: Stoppable = process): () => void {
  const held = Object.entries(SIGNAL_EXITS).map(([signal, code]) => {
    const stop = (): void => {
      clean()
      host.exit(code)
    }
    host.once(signal, stop)
    return [signal, stop] as const
  })
  return () => {
    for (const [signal, stop] of held) host.off(signal, stop)
  }
}

export const sheet: Command = {
  name: 'sheet',
  help: [
    "  sheet                       Put each case's drawn pages side by side in one picture, a row",
    "                              a run and a column an attempt, and print each picture's path.",
    '                              It shows the pages a grading drew, so grade the runs first.',
    '    --run <name>              A run to show. Once for each run.',
    '    --case <id>               The one case to show; default every case the runs answered.',
    '    --out <dir>               The folder the pictures go in; default a new temporary folder.',
  ],
  flags,
  agents: false,
  async run(context) {
    const values = context.values as FlagValues<typeof flags>
    const { skill } = skillOf(context.args)
    const runs = [...new Set((values.run ?? []).map((r) => runNameOf(r, '--run')))]
    if (!runs.length) throw new Error('Pass --run <name>, once for each run to show.')
    for (const run of runs)
      if (!isDir(runDir(skill, run))) throw new Error(`${skill} has no run named ${run}.`)

    const live = loadCases(skill)
    const outputs = new Map(runs.map((run) => [run, outputsOf(skill, run)]))
    const pages = [...outputs.values()].flat().filter((o) => o.page)
    const ids = casesInOrder(
      live.map((c) => c.id),
      pages.map((o) => o.case),
    )
    if (values.case !== undefined && !ids.includes(values.case))
      throw new Error(`No run named has a page for the case ${values.case}.`)
    const cases = values.case === undefined ? ids : [values.case]
    if (!cases.length) {
      console.error('No output of these runs is a page, so there is nothing to put on a sheet.')
      return 1
    }
    const nameOf = (id: string): string => {
      const found = live.find((c) => c.id === id)
      return found ? caseName(found) : id
    }

    // Each case's sheet, laid out before any is drawn: what is left out is said first.
    const planned: { id: string; name: string; layout: SheetLayout; paths: Map<string, string> }[] =
      []
    for (const id of cases) {
      const name = nameOf(id)
      const rows: SheetRow[] = []
      /** Each picture's file, by its run and attempt. */
      const paths = new Map<string, string>()
      for (const run of runs) {
        const mine = (outputs.get(run) ?? [])
          .filter((o) => o.case === id && o.page)
          .sort((a, b) => a.attempt - b.attempt)
        const undrawn = mine.filter((o) => !o.picture).map((o) => o.attempt)
        if (undrawn.length) console.error(undrawnLine(skill, run, name, undrawn))
        const pictures: SheetPicture[] = []
        for (const { attempt, picture } of mine) {
          if (!picture) continue
          pictures.push({ attempt, width: picture.width, height: picture.height })
          paths.set(`${run}/${attempt}`, picture.path)
        }
        rows.push({ run, pictures })
      }
      const layout = sheetLayout(rows)
      if (!layout) continue
      if (layout.leftOut) console.error(leftOutLine(name, layout.leftOut))
      planned.push({ id, name, layout, paths })
    }

    // Made at the first sheet: a command that draws none leaves no folder.
    let out = values.out ? resolve(values.out) : null
    const outDir = (): string => {
      out ??= mkdtempSync(join(tmpdir(), 'st-sheet-'))
      return out
    }
    // The page and its pictures: the host draws the page from here, and serves it only what is here.
    const work = realPath(mkdtempSync(join(tmpdir(), 'st-sheet-page-')))
    const ending = new AbortController()
    const done = (): void => {
      ending.abort()
      rmSync(work, { recursive: true, force: true })
    }
    // Stopped part way, it ends its host and leaves no page behind either.
    const release = whenStopped(done)
    const host = drawingHost({
      warn: (line) => console.error(line),
      signal: ending.signal,
      after: 'No more sheets are made.',
    })
    /** The cases whose sheet could not be made. */
    const unmade: string[] = []
    try {
      for (const [n, { id, name, layout, paths }] of planned.entries()) {
        const file = (r: number, attempt: number): string => `${n + 1}-${r + 1}-${attempt}.png`
        for (const [r, row] of layout.rows.entries())
          for (const { attempt } of row.panels)
            copyFileSync(paths.get(`${row.run}/${attempt}`) ?? '', join(work, file(r, attempt)))
        const page = join(work, `${n + 1}.html`)
        writeText(page, sheetPage(name, layout, file))
        try {
          const { png } = await host.file(pathToFileURL(page).href, layout)
          const path = join(outDir(), sheetFile(id, n))
          writeText(path, png)
          console.log(path)
        } catch (error) {
          // A host that cannot start, or stopped, has said why, once: no sheet after it is made.
          if (error instanceof RendererGone) {
            unmade.push(...planned.slice(n).map((p) => p.name))
            break
          }
          console.error(`${name}: the sheet could not be drawn: ${(error as Error).message}`)
          unmade.push(name)
        }
      }
    } finally {
      release()
      done()
    }
    if (unmade.length) console.error(`Sheets not made: ${unmade.join(', ')}.`)
    // A sheet that could not be drawn, or none at all, is not what was asked.
    return unmade.length || !planned.length ? 1 : 0
  },
}
