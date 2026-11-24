/**
 * The folder the assistant reads a case's outputs in: a copy of the request,
 * the skill as the run had it, and each output's files, with a sheet of what
 * to answer. It is made under the system's temporary folder with nothing
 * above it, as a sample's own folder is (`workdir.ts`), so a session started
 * there finds no instructions, no skill and no other run by going up. Every
 * file is a copy: nothing in it leads back to the skill.
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { layoutText, readLayout } from '@domain/layout.ts'
import { factsAsked, type ReadFact, type ReadOutput, sheetText } from '@domain/reading.ts'
import type { Sample } from '@domain/views.ts'
import { assertInside, isFile, listFiles, textOf, treeFiles, writeText } from './fs.ts'

/** How each room's own folder under the system's temporary folder begins. */
export const ROOM_PREFIX = 'skill-studio-reading-'

/** A text file past this many bytes is copied, and not held for checking quotes against. */
const TEXT_MAX = 2 * 1024 * 1024

/** How much of a page's measured layout the room holds, in characters. */
const LAYOUT_ROOM = 40_000

/** One output to put in a room. */
export interface RoomSample {
  sample: Sample
  /** Its rules and checks, as scored now (`readFacts`). */
  facts: ReadFact[]
}

export interface RoomInput {
  /** The run's folder. */
  runDir: string
  caseId: string
  /** What the case asked. */
  request: string
  samples: RoomSample[]
  /** Ask every fact and show none of Jev's answers (`factsAsked`). */
  blind: boolean
}

export interface Room {
  /** Where a session is started. */
  dir: string
  /** Each output as a reading is checked against it, by its folder in the room. */
  outputs: Record<string, ReadOutput>
  /** Delete the room. */
  dispose(): void
}

const roomRel = (...parts: string[]): string => parts.join('/')

/** Copy one file into the room, and hold its text when it reads as text. */
export function put(room: string, rel: string, from: string, texts?: Record<string, string>): void {
  const to = join(room, rel)
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
  if (!texts) return
  const bytes = readFileSync(from)
  if (bytes.length > TEXT_MAX) return
  const text = textOf(bytes)
  if (text !== null) texts[rel] = text
}

/** Every file under `from`, copied to `to` in the room. A link that leaves `from` is passed over. */
function putTree(room: string, to: string, from: string): void {
  for (const { rel, real } of treeFiles(from, { hidden: true })) put(room, roomRel(to, rel), real)
}

/** The page as drawn and its measured layout, when the app drew one: the first picture in `renders/`. */
export function putPage(
  room: string,
  name: string,
  sampleDir: string,
  texts: Record<string, string>,
) {
  const renders = join(sampleDir, 'renders')
  const [picture] = listFiles(renders, (file) => file.endsWith('.png'))
  if (!picture) return
  put(room, roomRel(name, 'page.png'), join(renders, picture))
  const measured = join(renders, picture.replace(/\.png$/, '.json'))
  if (!isFile(measured)) return
  try {
    const layout = readLayout(JSON.parse(readFileSync(measured, 'utf8')))
    if (!layout) return
    const rel = roomRel(name, 'layout.txt')
    const text = layoutText(layout, LAYOUT_ROOM)
    writeText(join(room, rel), text)
    texts[rel] = text
  } catch {
    // A layout that does not read is no layout: the page is still there to look at.
  }
}

/**
 * Make the room for one case of a run. Each output goes in a folder of its
 * own name: the files its agent wrote, as the run lists them, its notes, and
 * its page as drawn with the measured layout. The caller disposes of it.
 */
export function makeRoom(input: RoomInput): Room {
  const parent = mkdtempSync(join(tmpdir(), ROOM_PREFIX))
  const made = join(parent, 'room')
  mkdirSync(made)
  const dir = realpathSync.native(made)
  try {
    writeText(join(dir, 'request.md'), input.request)
    putTree(dir, 'inputs', join(input.runDir, '_inputs', input.caseId))
    putTree(dir, 'skill', join(input.runDir, '_skill'))
    const outputs: Record<string, ReadOutput> = {}
    const sheet = input.samples.map(({ sample, facts }) => {
      const texts: Record<string, string> = {}
      for (const artifact of sample.artifacts) {
        const from = assertInside(sample.path, join(sample.path, artifact.file))
        if (isFile(from)) put(dir, roomRel(sample.name, artifact.file), from, texts)
      }
      const notes = join(sample.path, 'notes.md')
      if (isFile(notes)) put(dir, roomRel(sample.name, 'notes.md'), notes, texts)
      putPage(dir, sample.name, sample.path, texts)
      const asked = factsAsked(facts, input.blind)
      outputs[sample.name] = { facts, asked, files: texts }
      const paths = treeFiles(join(dir, sample.name)).map(({ rel }) => roomRel(sample.name, rel))
      return { name: sample.name, facts, asked, paths }
    })
    writeText(join(dir, 'sheet.md'), sheetText(sheet, input.blind))
    return { dir, outputs, dispose: () => rmSync(parent, { recursive: true, force: true }) }
  } catch (error) {
    rmSync(parent, { recursive: true, force: true })
    throw error
  }
}

/**
 * Every file in a room a model reads as text, by its path in the room: all
 * but pictures. What a session reading the folder would find, for a model
 * sent it in one message instead.
 */
export function roomText(dir: string): Array<{ path: string; text: string }> {
  return treeFiles(dir)
    .filter(({ rel }) => !/\.(png|jpe?g|webp|gif)$/i.test(rel))
    .map(({ rel, real }) => ({ path: rel.replace(/\\/g, '/'), text: readFileSync(real, 'utf8') }))
}
