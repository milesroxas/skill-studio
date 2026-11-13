import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeJson } from './fs.ts'
import { finishedSamples, readRun, readRunMeta } from './runs.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'st-runs-'))
  writeFileSync(join(dir, 'SKILL.md'), 'first')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** A run with a folder per sample, each holding one output, and `run.json` as given. */
function writeRun(name: string, folders: string[], meta: Record<string, unknown> | null): string {
  const run = join(dir, 'evals/runs', name)
  for (const folder of folders) {
    mkdirSync(join(run, folder, 'outputs'), { recursive: true })
    writeFileSync(join(run, folder, 'outputs/main.ts'), 'export {}')
  }
  if (meta) writeJson(join(run, 'run.json'), meta)
  return run
}
const listed = (dir: string, over: Record<string, unknown> = {}) => ({ dir, ok: true, ...over })

describe('the samples grading reads', () => {
  it('leaves out a folder the run never recorded, and one it marks stopped', () => {
    writeRun('r1', ['note-s1', 'note-s2', 'note-s3'], {
      samples: [listed('note-s1'), listed('note-s2', { stopped: true })],
    })
    const { samples, unfinished } = finishedSamples(dir, 'r1')
    expect(samples.map((s) => s.name)).toEqual(['note-s1'])
    expect(unfinished).toBe(2)
    // Results still lists every folder, each with how its agent ended: a run being written
    // shows its outputs as they come.
    expect(readRun(dir, 'r1').samples.map((s) => [s.name, s.cut])).toEqual([
      ['note-s1', undefined],
      ['note-s2', 'stopped'],
      ['note-s3', 'unlisted'],
    ])
  })

  it('reads every folder of a run that lists no samples, or has no run.json', () => {
    writeRun('older', ['note-s1', 'note-s2'], { skillVersion: 'v0' })
    writeRun('bare', ['note-s1'], null)
    expect(finishedSamples(dir, 'older')).toMatchObject({ unfinished: 0 })
    expect(finishedSamples(dir, 'older').samples).toHaveLength(2)
    expect(finishedSamples(dir, 'bare').samples).toHaveLength(1)
    expect(readRun(dir, 'older').samples.every((s) => s.cut === undefined)).toBe(true)
  })

  it('reads none of a run cut off before it recorded a sample', () => {
    writeRun('cut', ['note-s1'], { samples: [] })
    expect(finishedSamples(dir, 'cut')).toEqual({ samples: [], unfinished: 1 })
  })

  it('reads a run of flat files whole, whatever its run.json lists', () => {
    const run = join(dir, 'evals/runs/flat')
    mkdirSync(run, { recursive: true })
    writeFileSync(join(run, 'email-1.md'), 'One.')
    writeFileSync(join(run, 'email-2.md'), 'Two.')
    writeJson(join(run, 'run.json'), { samples: [{ file: 'email-1.md' }] })
    expect(finishedSamples(dir, 'flat').samples.map((s) => s.name)).toEqual([
      'email-1.md',
      'email-2.md',
    ])
  })
})

describe("a sample's outputs", () => {
  it('are the files the run recorded when the agent ended, not one put there since', () => {
    const run = writeRun('r1', ['note-s1'], {
      samples: [listed('note-s1', { outputs: ['outputs/main.ts'] })],
    })
    // A check command builds the script beside its source.
    writeFileSync(join(run, 'note-s1/outputs/main.js'), 'export {}')
    expect(readRun(dir, 'r1').samples[0].artifacts).toEqual([
      { file: 'outputs/main.ts', kind: 'code' },
    ])
    expect(finishedSamples(dir, 'r1').samples[0].artifacts).toEqual([
      { file: 'outputs/main.ts', kind: 'code' },
    ])
  })

  it('are every file under outputs/ for a sample with no record of them', () => {
    const run = writeRun('r1', ['note-s1', 'note-s2'], { samples: [listed('note-s1')] })
    writeFileSync(join(run, 'note-s1/outputs/main.js'), 'export {}')
    const [recorded, inFlight] = readRun(dir, 'r1').samples
    expect(recorded.artifacts.map((a) => a.file)).toEqual(['outputs/main.js', 'outputs/main.ts'])
    expect(inFlight.artifacts.map((a) => a.file)).toEqual(['outputs/main.ts'])
  })

  it('never list a recorded file that is gone, or a path that is no output', () => {
    writeRun('r1', ['note-s1'], {
      samples: [listed('note-s1', { outputs: ['outputs/gone.md', '../../SKILL.md', 7] })],
    })
    expect(readRun(dir, 'r1').samples[0].artifacts).toEqual([])
  })
})

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
