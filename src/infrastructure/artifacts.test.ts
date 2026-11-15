import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectArtifacts } from './artifacts.ts'
import { listRuns } from './runs.ts'

let skill: string
let sample: string
beforeEach(() => {
  skill = mkdtempSync(join(tmpdir(), 'st-artifacts-'))
  sample = join(skill, 'evals/runs/run-1/note-s1')
  mkdirSync(join(sample, 'outputs/drafts'), { recursive: true })
  writeFileSync(join(sample, 'outputs/note.md'), 'A note.')
  writeFileSync(join(sample, 'outputs/drafts/Cover Letter.md'), 'A letter.')
})
afterEach(() => rmSync(skill, { recursive: true, force: true }))

describe('detectArtifacts', () => {
  it('names each output by its path in the sample, with / between the parts', () => {
    expect(detectArtifacts(sample)).toEqual([
      { file: 'outputs/drafts/Cover Letter.md', kind: 'markdown' },
      { file: 'outputs/note.md', kind: 'markdown' },
    ])
  })

  it('takes any file as an output: text of a kind not listed as text, anything else as a kind Jev cannot read', () => {
    writeFileSync(join(sample, 'outputs/report.csv'), 'name,score\nA,1\n')
    writeFileSync(join(sample, 'outputs/notes'), 'No extension, and text.')
    writeFileSync(join(sample, 'outputs/café.xml'), '<a>é</a>')
    writeFileSync(
      join(sample, 'outputs/report.pdf'),
      Buffer.from([0x25, 0x50, 0x44, 0x46, 0, 1, 2]),
    )
    writeFileSync(join(sample, 'outputs/bad.dat'), Buffer.from([0xff, 0xfe, 0x41]))
    writeFileSync(join(sample, 'outputs/.DS_Store'), Buffer.from([0, 0, 1]))
    expect(detectArtifacts(sample)).toEqual([
      { file: 'outputs/bad.dat', kind: 'other' },
      { file: 'outputs/café.xml', kind: 'markdown' },
      { file: 'outputs/drafts/Cover Letter.md', kind: 'markdown' },
      { file: 'outputs/note.md', kind: 'markdown' },
      { file: 'outputs/notes', kind: 'markdown' },
      { file: 'outputs/report.csv', kind: 'markdown' },
      { file: 'outputs/report.pdf', kind: 'other' },
    ])
  })

  it.skipIf(process.platform === 'win32')(
    'passes over a link the agent left: to nothing, out of the sample, or back on itself',
    () => {
      symlinkSync(join(skill, 'gone.md'), join(sample, 'outputs/dangling.md'))
      symlinkSync('/etc/hosts', join(sample, 'outputs/hosts.txt'))
      symlinkSync(join(sample, 'outputs'), join(sample, 'outputs/loop'))
      expect(detectArtifacts(sample).map((a) => a.file)).toEqual([
        'outputs/drafts/Cover Letter.md',
        'outputs/note.md',
      ])
      // One sample's odd folder never hides the skill's runs.
      expect(listRuns(skill).map((run) => run.name)).toEqual(['run-1'])
    },
  )
})
