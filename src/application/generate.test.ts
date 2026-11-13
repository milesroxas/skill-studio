import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadCases } from '@infrastructure/cases.ts'
import type { Engine } from '@infrastructure/engines/index.ts'
import type { EngineResult } from '@infrastructure/engines/types.ts'
import { readJson } from '@infrastructure/fs.ts'
import { finishedSamples, readRun, versionsOf } from '@infrastructure/runs.ts'
import { saveVersion } from '@infrastructure/versions.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generateRun, INPUTS_DIR, samplesPerCase, stagedInput, stagedInputs } from './generate.ts'

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

const ENDED: EngineResult = {
  ok: true,
  error: null,
  costUsd: null,
  tokens: null,
  model: 'small',
  finalText: null,
}

/**
 * An engine that does `act` in each sample folder in place of an agent, and
 * counts its sessions. What `act` returns is laid over a session that ended
 * well by itself.
 */
function engineThat(act: (cwd: string, call: number) => unknown): Engine & { calls: number } {
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
      const how = act(request.cwd, engine.calls)
      return { ...ENDED, ...(how && typeof how === 'object' ? how : {}) }
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

  it('gives each sample its own folder for working files, and has the prompt name it', async () => {
    const seen: string[] = []
    let prompt = ''
    const engine = engineThat((cwd) => {
      seen.push(...readdirSync(join(cwd, 'scratch')))
      writeFileSync(join(cwd, 'scratch/probe.py'), 'print(1)')
      prompt = readFileSync(join(cwd, 'prompt.md'), 'utf8')
      writeFileSync(join(cwd, 'outputs/note.md'), 'A note.')
    })
    const { meta } = await generateRun(options(engine, 2))
    // The second sample starts with an empty folder: it never sees the first one's probe.
    expect(engine.calls).toBe(2)
    expect(seen).toEqual([])
    expect(prompt).toContain('go under scratch/ in this directory')
    // A working file is not an output.
    expect(meta.samples.map((sample) => sample.outputs)).toEqual([
      ['outputs/note.md'],
      ['outputs/note.md'],
    ])
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

  it('marks a sample the stop ended as stopped, half a file written or none, and grading leaves it out', async () => {
    const stop = new AbortController()
    const engine = engineThat((cwd) => {
      writeFileSync(join(cwd, 'outputs/note.md'), 'Half a no')
      stop.abort()
      // As an engine reports an agent the stop ended.
      return { ok: false, error: 'stopped' }
    })
    const { name, meta } = await generateRun({ ...options(engine, 2), signal: stop.signal })
    expect(meta.samples).toEqual([
      expect.objectContaining({ dir: 'note-s1', ok: true, stopped: true }),
    ])
    expect(finishedSamples(skill, name)).toEqual({ samples: [], unfinished: 1 })
  })

  it('records no sample for an agent the process could not start, and grading leaves its folder out', async () => {
    const engine = engineThat((cwd, call) => {
      writeFileSync(join(cwd, 'outputs/note.md'), 'A note.')
      // What `exec` rejects with once the app has begun to quit.
      if (call === 2) throw new Error('Stopping.')
    })
    const { name, dir, meta } = await generateRun(options(engine, 3))
    expect(meta.samples.map((s) => s.dir)).toEqual(['note-s1'])
    expect(existsSync(join(dir, 'note-s2'))).toBe(true)
    expect(finishedSamples(skill, name)).toMatchObject({ unfinished: 1 })
    expect(finishedSamples(skill, name).samples.map((s) => s.name)).toEqual(['note-s1'])
  })

  it('records what each agent wrote, so a file put under outputs/ later is no output', async () => {
    const engine = engineThat((cwd) => {
      mkdirSync(join(cwd, 'outputs/src'))
      writeFileSync(join(cwd, 'outputs/src/main.ts'), 'export {}')
      writeFileSync(join(cwd, 'outputs/README.md'), 'How to run it.')
    })
    const { name, dir, meta } = await generateRun(options(engine, 1))
    expect(meta.samples[0].outputs).toEqual(['outputs/README.md', 'outputs/src/main.ts'])
    // A check command builds the script: it is not something the agent wrote.
    writeFileSync(join(dir, 'note-s1/outputs/src/main.js'), 'export {}')
    expect(readRun(skill, name).samples[0].artifacts.map((a) => a.file)).toEqual([
      'outputs/README.md',
      'outputs/src/main.ts',
    ])
  })

  it('keeps two input files of one name apart, so the agent gets both', async () => {
    for (const from of ['a', 'b']) {
      mkdirSync(join(skill, 'evals/files', from), { recursive: true })
      writeFileSync(join(skill, 'evals/files', from, 'data.csv'), `from ${from}`)
    }
    writeFileSync(join(skill, 'evals/files/only.txt'), 'one of a kind')
    const files = ['evals/files/a/data.csv', 'evals/files/b/data.csv', 'evals/files/only.txt']
    writeFileSync(
      join(skill, 'evals/evals.json'),
      JSON.stringify({ evals: [{ id: 7, name: 'Tables', prompt: 'Compare them.', files }] }),
    )
    const tables = loadCases(skill).filter((c) => c.id === '7-tables')
    let prompt = ''
    const seen: string[] = []
    const engine = engineThat((cwd) => {
      prompt = readFileSync(join(cwd, 'prompt.md'), 'utf8')
      for (const from of ['a', 'b'])
        seen.push(readFileSync(join(cwd, 'files/evals/files', from, 'data.csv'), 'utf8'))
      seen.push(readFileSync(join(cwd, 'files/only.txt'), 'utf8'))
    })
    const { dir } = await generateRun({ ...options(engine, 1), cases: tables })
    expect(seen).toEqual(['from a', 'from b', 'one of a kind'])
    expect(prompt).toContain(
      'files/evals/files/a/data.csv, files/evals/files/b/data.csv, files/only.txt',
    )
    // Grading finds each where the run put it.
    const inputs = join(dir, INPUTS_DIR)
    expect(readFileSync(stagedInput(inputs, tables[0], files[1]), 'utf8')).toBe('from b')
    expect(stagedInput(inputs, tables[0], files[2])).toBe(join(inputs, '7-tables/only.txt'))
    // A case that has lost one of the two since still names where the run kept the other.
    const alone = { ...tables[0], files: [files[1], files[2]] }
    expect(stagedInputs(inputs, alone, files[1])).toEqual([
      join(inputs, '7-tables/data.csv'),
      join(inputs, '7-tables', files[1]),
    ])
  })

  it('names the skill to a run against an older version as that version named it', async () => {
    saveVersion(skill, versionsOf(skill).current, 'Short notes', '')
    writeFileSync(join(skill, 'SKILL.md'), '---\nname: Memo Skill\n---\n\n- Keep it long.\n')
    const seen: Record<string, string> = {}
    const engine = engineThat((cwd) => {
      seen.prompt = readFileSync(join(cwd, 'prompt.md'), 'utf8')
      seen.skill = readFileSync(join(cwd, '.agents/skills/notes-skill/SKILL.md'), 'utf8')
    })
    await generateRun({ ...options(engine, 1), configuration: 'old_skill', baseline: 'v0' })
    expect(seen.prompt).toContain('Use the Notes Skill skill: read .agents/skills/notes-skill/')
    expect(seen.skill).toContain('Keep it short')
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
