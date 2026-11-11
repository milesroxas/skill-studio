import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectArtifacts, primaryArtifact } from './artifacts.ts'
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

describe('primaryArtifact', () => {
  const page = { file: 'outputs/index.html', kind: 'html' as const }
  const script = { file: 'outputs/app.js', kind: 'code' as const }
  const notes = { file: 'outputs/notes.md', kind: 'markdown' as const }

  it('takes the case’s kind, then Markdown, as before', () => {
    expect(primaryArtifact([script, page], 'html')).toBe(page)
    expect(primaryArtifact([script, notes, page], undefined, ['html'])).toBe(notes)
    expect(primaryArtifact([script, page], undefined)).toBe(script)
  })

  it('takes a kind a pack judges over the first file, and a page by its main name', () => {
    expect(primaryArtifact([script, page], undefined, ['html', 'image'])).toBe(page)
    const component = { file: 'outputs/Pricing.tsx', kind: 'code' as const }
    const about = { file: 'outputs/about.html', kind: 'html' as const }
    const preview = { file: 'outputs/preview.html', kind: 'html' as const }
    expect(primaryArtifact([component, about, preview], undefined, ['html'])).toBe(preview)
    expect(primaryArtifact([component, preview], undefined, ['code', 'html'])).toBe(component)
  })
})
