import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { ReadFact } from '@domain/reading.ts'
import type { Sample } from '@domain/views.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeRoom, ROOM_PREFIX, type Room } from './reading-room.ts'

let run: string
let outside: string
let room: Room | null
beforeEach(() => {
  run = mkdtempSync(join(tmpdir(), 'st-room-run-'))
  outside = mkdtempSync(join(tmpdir(), 'st-room-outside-'))
  room = null
})
afterEach(() => {
  room?.dispose()
  rmSync(run, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
})

function write(path: string, text: string | Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

const fact = (ref: string, jev: ReadFact['jev']): ReadFact => ({
  id: `rule:${ref}`,
  ref,
  kind: 'rule',
  text: `Rule ${ref}.`,
  jev,
  yours: null,
})

/** A sample folder with one page, its notes and a file the run does not list. */
function sample(name: string): Sample {
  const path = join(run, name)
  write(join(path, 'outputs/page.html'), '<h1>Thank you for the dinner</h1>')
  write(join(path, 'outputs/later.txt'), 'built by a check command')
  write(join(path, 'notes.md'), 'I wrote the page.')
  write(join(path, 'transcript.jsonl'), '{}')
  return {
    name,
    path,
    artifacts: [{ file: 'outputs/page.html', kind: 'html' }],
    hasTranscript: true,
    legacy: false,
  }
}

const build = (samples: Sample[], blind = false): Room => {
  room = makeRoom({
    runDir: run,
    caseId: 'note',
    request: 'Write a thank-you page.',
    samples: samples.map((s) => ({
      sample: s,
      facts: [fact('R1', 'met'), fact('R2', 'not sure')],
    })),
    blind,
  })
  return room
}

describe('makeRoom', () => {
  it('holds the request, the skill, the case’s files and each output’s own', () => {
    write(join(run, '_skill/SKILL.md'), '- Keep it short.')
    write(join(run, '_inputs/note/brief.md'), 'For Priya.')
    write(join(run, '_inputs/other/secret.md'), 'Another case.')
    const { dir } = build([sample('note-s1')])
    expect(readFileSync(join(dir, 'request.md'), 'utf8')).toBe('Write a thank-you page.')
    expect(readFileSync(join(dir, 'skill/SKILL.md'), 'utf8')).toBe('- Keep it short.')
    expect(readdirSync(join(dir, 'inputs'))).toEqual(['brief.md'])
    expect(readdirSync(join(dir, 'note-s1')).sort()).toEqual(['notes.md', 'outputs'])
    // Only what the run lists as written: not a file put there later, and not the transcript.
    expect(readdirSync(join(dir, 'note-s1/outputs'))).toEqual(['page.html'])
  })

  it('is a folder of its own under the temporary folder, with nothing else beside it', () => {
    const { dir } = build([sample('note-s1')])
    expect(readdirSync(dirname(dir))).toEqual(['room'])
    expect(dirname(dir)).toContain(ROOM_PREFIX)
  })

  it('holds each output’s text files for checking a quote, by their path in the room', () => {
    const { outputs } = build([sample('note-s1')])
    expect(outputs['note-s1'].files).toEqual({
      'note-s1/outputs/page.html': '<h1>Thank you for the dinner</h1>',
      'note-s1/notes.md': 'I wrote the page.',
    })
  })

  it('asks only what Jev was not sure of, and everything when blind', () => {
    expect(build([sample('note-s1')]).outputs['note-s1'].asked.map((f) => f.ref)).toEqual(['R2'])
    room?.dispose()
    expect(build([sample('note-s1')], true).outputs['note-s1'].asked).toHaveLength(2)
  })

  it('writes the sheet with each output’s files', () => {
    const { dir } = build([sample('note-s1'), sample('note-s2')])
    const sheet = readFileSync(join(dir, 'sheet.md'), 'utf8')
    expect(sheet).toContain('# Output note-s1')
    expect(sheet).toContain('# Output note-s2')
    expect(sheet).toContain('Its files: note-s2/notes.md, note-s2/outputs/page.html')
  })

  it('puts the page as drawn beside the output, with its layout when it reads', () => {
    const one = sample('note-s1')
    write(join(one.path, 'renders/desktop-1280x960.png'), new Uint8Array([137, 80, 78, 71, 0]))
    write(join(one.path, 'renders/desktop-1280x960.json'), 'not a layout')
    const { dir, outputs } = build([one])
    expect(existsSync(join(dir, 'note-s1/page.png'))).toBe(true)
    expect(existsSync(join(dir, 'note-s1/layout.txt'))).toBe(false)
    // A picture is no text to quote from.
    expect(Object.keys(outputs['note-s1'].files)).not.toContain('note-s1/page.png')
  })

  it('refuses an output that leads out of its sample', () => {
    const one = sample('note-s1')
    write(join(outside, 'key.txt'), 'a secret')
    symlinkSync(join(outside, 'key.txt'), join(one.path, 'outputs/key.txt'))
    one.artifacts.push({ file: 'outputs/key.txt', kind: 'markdown' })
    expect(() => build([one])).toThrow()
  })

  it('passes over a link in the skill that leaves it', () => {
    write(join(run, '_skill/SKILL.md'), '- Keep it short.')
    write(join(outside, 'key.txt'), 'a secret')
    symlinkSync(join(outside, 'key.txt'), join(run, '_skill/key.txt'))
    const { dir } = build([sample('note-s1')])
    expect(readdirSync(join(dir, 'skill'))).toEqual(['SKILL.md'])
  })

  it('is gone once disposed of', () => {
    const made = build([sample('note-s1')])
    made.dispose()
    expect(existsSync(dirname(made.dir))).toBe(false)
  })
})
