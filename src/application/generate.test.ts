import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadCases } from '@infrastructure/cases.ts'
import type { Engine } from '@infrastructure/engines/index.ts'
import { readJson } from '@infrastructure/fs.ts'
import { versionsOf } from '@infrastructure/runs.ts'
import { saveVersion } from '@infrastructure/versions.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generateRun, samplesPerCase } from './generate.ts'

let skill: string
beforeEach(() => {
  skill = mkdtempSync(join(tmpdir(), 'st-generate-'))
  writeFileSync(
    join(skill, 'SKILL.md'),
    '---\nname: Notes Skill\n---\n\n- Keep it short, always.\n',
  )
  mkdirSync(join(skill, 'scripts'))
  writeFileSync(join(skill, 'scripts/tool.sh'), 'first tool')
  mkdirSync(join(skill, 'evals/cases/note/files'), { recursive: true })
  writeFileSync(join(skill, 'evals/cases/note/prompt.md'), 'Write a note.')
  writeFileSync(join(skill, 'evals/cases/note/files/input.txt'), 'first input')
  mkdirSync(join(skill, 'evals/cases/note/files/screen'))
  writeFileSync(join(skill, 'evals/cases/note/files/screen/Bookings.tsx'), 'a screen')
})
afterEach(() => rmSync(skill, { recursive: true, force: true }))

/** An engine that does `act` in each sample folder in place of an agent, and counts its sessions. */
function engineThat(act: (cwd: string, call: number) => void): Engine & { calls: number } {
  const engine: Engine & { calls: number } = {
    calls: 0,
    id: 'fake',
    label: 'Fake',
    harness: 'agent',
    efforts: [],
    defaultModel: 'small',
    hint: '',
    available: () => true,
    models: async () => ['small'],
    run: async (request) => {
      engine.calls += 1
      act(request.cwd, engine.calls)
      return { ok: true, error: null, costUsd: null, tokens: null, model: 'small', finalText: null }
    },
  }
  return engine
}

const options = (engine: Engine, samples: number) => ({
  skillDir: skill,
  cases: loadCases(skill),
  engine,
  model: null,
  effort: null,
  samples,
  configuration: 'with_skill' as const,
  baseline: null,
  skillName: 'First version',
  note: '',
  parallel: 1,
  log: () => {},
})

describe('samplesPerCase', () => {
  it('is a whole number from 1 to 10', () => {
    expect([2.7, 0, -1, Number.NaN, 50].map(samplesPerCase)).toEqual([2, 1, 1, 1, 10])
  })
})

describe('generateRun', () => {
  it('gives the agent a folder among the input files as it is laid out, and names its files', async () => {
    let seen = ''
    let prompt = ''
    const engine = engineThat((cwd) => {
      seen = readFileSync(join(cwd, 'files/screen/Bookings.tsx'), 'utf8')
      prompt = readFileSync(join(cwd, 'prompt.md'), 'utf8')
      writeFileSync(join(cwd, 'outputs/note.md'), 'A note.')
    })
    await generateRun(options(engine, 1))
    expect(seen).toBe('a screen')
    expect(prompt).toContain('files/input.txt, files/screen/Bookings.tsx')
  })

  it('makes every sample from the skill and the inputs as they were when the run started', async () => {
    const seen: string[][] = []
    const engine = engineThat((cwd, call) => {
      seen.push(
        [
          '.agents/skills/notes-skill/SKILL.md',
          '.agents/skills/notes-skill/scripts/tool.sh',
          'files/input.txt',
        ].map((file) => readFileSync(join(cwd, file), 'utf8')),
      )
      writeFileSync(join(cwd, 'outputs/note.md'), 'A note.')
      // The writer keeps working while the run goes on.
      if (call === 1) {
        writeFileSync(
          join(skill, 'SKILL.md'),
          '---\nname: Notes Skill\n---\n\n- Rewritten since.\n',
        )
        writeFileSync(join(skill, 'scripts/tool.sh'), 'second tool')
        writeFileSync(join(skill, 'evals/cases/note/files/input.txt'), 'second input')
      }
    })
    const { dir, meta } = await generateRun(options(engine, 2))
    expect(seen).toHaveLength(2)
    expect(seen[1]).toEqual(seen[0])
    expect(seen[0][1]).toBe('first tool')
    expect(seen[0][2]).toBe('first input')
    // The run's own copy is what its version names: the whole skill, without evals/.
    expect(readFileSync(join(dir, '_skill/SKILL.md'), 'utf8')).toContain('Keep it short')
    expect(readFileSync(join(dir, '_skill/scripts/tool.sh'), 'utf8')).toBe('first tool')
    expect(existsSync(join(dir, '_skill/evals'))).toBe(false)
    expect(meta.samples.map((s) => [s.dir, s.ok])).toEqual([
      ['note-s1', true],
      ['note-s2', true],
    ])
    expect(meta.finishedAt).not.toBeNull()
  })

  it('names the run before any agent starts, and keeps a folder of inputs even with none', async () => {
    rmSync(join(skill, 'evals/cases/note/files'), { recursive: true })
    const order: string[] = []
    const engine = engineThat(() => order.push('agent'))
    const { name, dir } = await generateRun({
      ...options(engine, 1),
      cases: loadCases(skill),
      onNamed: (named) => order.push(`named ${named}`),
    })
    expect(order).toEqual([`named ${name}`, 'agent'])
    expect(existsSync(join(dir, '_inputs'))).toBe(true)
  })

  it('names the skill folder in a sample by a slug, whatever the front matter says', async () => {
    writeFileSync(join(skill, 'SKILL.md'), '---\nname: ../../Escape Me\n---\n\n- Keep it short.\n')
    let cwd = ''
    const engine = engineThat((dir) => {
      cwd = dir
    })
    await generateRun(options(engine, 1))
    expect(existsSync(join(cwd, '.agents/skills/escape-me/SKILL.md'))).toBe(true)
    expect(existsSync(join(cwd, '.agents/Escape Me'))).toBe(false)
  })

  it('stops every worker when the run can no longer be recorded, and says why', async () => {
    const engine = engineThat((cwd) => {
      // The run's folder goes while its first sample is being written.
      const run = join(cwd, '..')
      rmSync(run, { recursive: true, force: true })
      writeFileSync(run, 'not a folder')
    })
    await expect(generateRun(options(engine, 4))).rejects.toThrow('could not be written to')
    expect(engine.calls).toBe(1)
  })

  it('takes no sample once the job is stopped, and records the run as ended', async () => {
    const stop = new AbortController()
    const engine = engineThat((cwd) => {
      writeFileSync(join(cwd, 'outputs/note.md'), 'A note.')
      stop.abort()
    })
    const { dir } = await generateRun({ ...options(engine, 3), signal: stop.signal })
    expect(engine.calls).toBe(1)
    const meta = readJson<{ samples: unknown[]; finishedAt: string | null }>(
      join(dir, 'run.json'),
      { samples: [], finishedAt: null },
    )
    expect(meta.samples).toHaveLength(1)
    expect(meta.finishedAt).not.toBeNull()
  })

  it('runs against a version saved by hand and never run, stamped with that version', async () => {
    saveVersion(skill, versionsOf(skill).current, 'Short notes', '')
    writeFileSync(join(skill, 'SKILL.md'), '---\nname: Notes Skill\n---\n\n- Keep it long.\n')
    const { dir, meta } = await generateRun({
      ...options(
        engineThat(() => {}),
        1,
      ),
      configuration: 'old_skill',
      baseline: 'v0',
    })
    expect(readFileSync(join(dir, '_skill/SKILL.md'), 'utf8')).toContain('Keep it short')
    expect(meta.skillVersion).toBe('v0')
    expect(meta.skillName).toBe('Short notes')
  })

  it('refuses a version that is not kept', async () => {
    await expect(
      generateRun({
        ...options(
          engineThat(() => {}),
          1,
        ),
        configuration: 'old_skill',
        baseline: 'v4',
      }),
    ).rejects.toThrow('No version v4 is kept.')
  })

  it('refuses a baseline that is not a run name', async () => {
    const engine = engineThat(() => {})
    await expect(
      generateRun({
        ...options(engine, 1),
        configuration: 'old_skill',
        baseline: '../../elsewhere',
      }),
    ).rejects.toThrow('Bad run.')
    expect(engine.calls).toBe(0)
  })
})
