import { spawn } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { mergeConfig } from '@domain/config.ts'
import { isWithin } from '@domain/paths.ts'
import { loadCases } from '@infrastructure/cases.ts'
import type { Engine } from '@infrastructure/engines/index.ts'
import type { EngineRequest, EngineResult } from '@infrastructure/engines/types.ts'
import { readJson } from '@infrastructure/fs.ts'
import { STAMP_LOCK_FILE } from '@infrastructure/grading-lock.ts'
import {
  finishedSamples,
  readRun,
  readSampleTranscript,
  runSamples,
  sampleFile,
  versionsOf,
} from '@infrastructure/runs.ts'
import { saveVersion } from '@infrastructure/versions.ts'
import { packById } from '@judges/index.ts'
import { Jev } from '@judges/jev.ts'
import { workflowScoring } from '@judges/workflow/score.ts'
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
/** Other folders a test made, removed after it. */
const made: string[] = []
afterEach(() => {
  rmSync(skill, { recursive: true, force: true })
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const ROOT = resolve(import.meta.dirname, '../..')

/**
 * One process that starts a run of a draft of a skill with an engine that
 * does nothing: it says it is ready, waits for the word to go, and prints the
 * version the run took.
 */
const START_SCRIPT = `
import { existsSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const [skill, draft, ready, go, named] = process.argv.slice(2)
const root = ${JSON.stringify(ROOT)}
const { generateRun } = await import(pathToFileURL(root + '/src/application/generate.ts').href)
const { loadCases } = await import(pathToFileURL(root + '/src/infrastructure/cases.ts').href)
const ended = { ok: true, error: null, costUsd: null, tokens: null, model: 'small', finalText: null }
const engine = {
  id: 'fake', label: 'Fake', harness: 'agent', efforts: [], defaultModel: 'small', hint: '',
  limitsTools: true, available: () => true, models: async () => ['small'], run: async () => ended,
}
const cases = loadCases(skill)
writeFileSync(ready, '')
while (!existsSync(go)) {}
const { meta } = await generateRun({
  skillDir: skill, from: draft, cases, engine, model: null, effort: null, samples: 1,
  configuration: 'with_skill', baseline: null, skillName: named ?? draft, ownName: Boolean(named),
  note: '', parallel: 1, log: () => {},
})
console.log(meta.skillVersion)
`

const ENDED: EngineResult = {
  ok: true,
  error: null,
  costUsd: null,
  tokens: null,
  model: 'small',
  finalText: null,
}

/**
 * An engine that does `act` in each agent's folder in place of an agent, and
 * counts its sessions. What `act` returns is laid over a session that ended
 * well by itself.
 */
function engineThat(
  act: (cwd: string, call: number, request: EngineRequest) => unknown,
): Engine & { calls: number } {
  const engine: Engine & { calls: number } = {
    calls: 0,
    id: 'fake',
    label: 'Fake',
    harness: 'agent',
    efforts: [],
    defaultModel: 'small',
    hint: '',
    limitsTools: true,
    available: () => true,
    models: async () => ['small'],
    run: async (request) => {
      engine.calls += 1
      const how = act(request.cwd, engine.calls, request)
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
    const engine = engineThat((cwd, _call, request) => {
      seen = readFileSync(join(cwd, 'files/screen/Bookings.tsx'), 'utf8')
      prompt = request.prompt
      writeFileSync(join(cwd, 'outputs/note.md'), 'A note.')
    })
    await generateRun(options(engine, 1))
    expect(seen).toBe('a screen')
    expect(prompt).toContain('files/input.txt, files/screen/Bookings.tsx')
  })

  it('gives each sample its own folder for working files, and has the prompt name it', async () => {
    const seen: string[] = []
    let prompt = ''
    const engine = engineThat((cwd, _call, request) => {
      seen.push(...readdirSync(join(cwd, 'scratch')))
      writeFileSync(join(cwd, 'scratch/probe.py'), 'print(1)')
      prompt = request.prompt
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

  it('keeps its cases, so a prompt or a file changed since is told from what it was asked', async () => {
    const engine = engineThat((cwd) => writeFileSync(join(cwd, 'outputs/note.md'), 'A note.'))
    const { name, dir } = await generateRun(options(engine, 1))
    expect(
      readJson<Array<{ case: { prompt: string } }>>(join(dir, '_cases.json'), []),
    ).toMatchObject([{ case: { id: 'note', prompt: 'Write a note.' } }])
    // Nothing changed: the run answered the case as the skill asks it.
    expect(readRun(skill, name).cases.note.earlier).toBeNull()
    writeFileSync(join(skill, 'evals/cases/note/files/input.txt'), 'second input')
    expect(readRun(skill, name).cases.note.earlier?.prompt).toBe('Write a note.')
    writeFileSync(join(skill, 'evals/cases/note/files/input.txt'), 'first input')
    writeFileSync(join(skill, 'evals/cases/note/prompt.md'), 'Write a longer note.')
    expect(readRun(skill, name).cases.note.earlier?.prompt).toBe('Write a note.')
    rmSync(join(skill, 'evals/cases/note'), { recursive: true })
    expect(readRun(skill, name).cases.note.earlier?.prompt).toBe('Write a note.')
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
    let found: string[] = []
    const engine = engineThat((cwd) => {
      found = readdirSync(join(cwd, '.agents/skills'))
    })
    const { dir } = await generateRun(options(engine, 1))
    expect(found).toEqual(['escape-me'])
    expect(existsSync(join(dir, 'note-s1/.agents/skills/escape-me/SKILL.md'))).toBe(true)
    expect(existsSync(join(dir, 'note-s1/.agents/Escape Me'))).toBe(false)
  })

  it('stops every worker when the run can no longer be recorded, and says why', async () => {
    let named = ''
    let work = ''
    const log: string[] = []
    const engine = engineThat((cwd) => {
      work = cwd
      // The run's folder goes while its first sample is being written.
      const run = join(skill, 'evals/runs', named)
      rmSync(run, { recursive: true, force: true })
      writeFileSync(run, 'not a folder')
    })
    await expect(
      generateRun({
        ...options(engine, 4),
        log: (line) => log.push(line),
        onNamed: (name) => {
          named = name
        },
      }),
    ).rejects.toThrow('could not be written to')
    expect(engine.calls).toBe(1)
    // With nowhere to move it to, the agent's work stays where it is, and the log says where.
    expect(log.join('\n')).toContain(`the rest is in ${work}`)
    expect(existsSync(work)).toBe(true)
    rmSync(dirname(work), { recursive: true, force: true })
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

  it('marks a sample that failed with no stop, a file left or none, and grading leaves it out', async () => {
    const engine = engineThat((cwd, call) => {
      if (call !== 3)
        writeFileSync(join(cwd, 'outputs/note.md'), call === 1 ? 'A note.' : 'Half a no')
      // 2: the time limit ends it; 3: signed out, nothing written; 4: it never began.
      if (call === 2) return { ok: false, error: 'timed out after 60 s', ended: 'timeout' }
      if (call === 3) return { ok: false, error: 'Not logged in · Please run /login' }
      if (call === 4) return { ok: false, error: 'spawn claude ENOENT', ended: 'unstarted' }
      // 5: it exits well but the session reports an error, as a refusal does.
      if (call === 5) return { ok: true, error: 'error_during_execution' }
      return null
    })
    const { name, dir, meta } = await generateRun(options(engine, 5))
    expect(meta.samples.map((s) => [s.dir, s.ok, s.failed])).toEqual([
      ['note-s1', true, undefined],
      ['note-s2', true, 'ran out of time'],
      ['note-s3', false, 'ended with an error'],
      ['note-s4', true, 'could not start'],
      ['note-s5', true, 'ended with an error'],
    ])
    expect(meta.samples[2].error).toBe('Not logged in · Please run /login')
    // What the engine said is kept beside the sample, and run.json reads back the same.
    expect(readJson(join(dir, 'note-s2/agent.json'), {})).toMatchObject({ ok: false })
    expect(readRun(skill, name).samples.map((s) => s.cut)).toEqual([
      undefined,
      'failed',
      'failed',
      'failed',
      'failed',
    ])
    expect(finishedSamples(skill, name)).toMatchObject({ unfinished: 4 })
  })

  it('records a sample whose making threw as failed, so it is not graded as a whole answer', async () => {
    const engine = engineThat(() => {
      throw new Error('EACCES: permission denied')
    })
    const { meta } = await generateRun(options(engine, 1))
    expect(meta.samples).toEqual([
      expect.objectContaining({ dir: 'note-s1', ok: false, failed: 'could not start' }),
    ])
  })

  it('leaves a sample that ran to its end and wrote nothing as one that did not fail', async () => {
    const { name, meta } = await generateRun(
      options(
        engineThat(() => {}),
        1,
      ),
    )
    expect(meta.samples).toEqual([expect.objectContaining({ ok: false })])
    expect(meta.samples[0].failed).toBeUndefined()
    expect(finishedSamples(skill, name)).toMatchObject({ unfinished: 0 })
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

  it('gives the agent a case’s hidden files, and leaves the skill’s own out of its copy', async () => {
    mkdirSync(join(skill, 'evals/cases/note/files/.github'), { recursive: true })
    writeFileSync(join(skill, 'evals/cases/note/files/.eslintrc.json'), '{"root": true}')
    writeFileSync(join(skill, 'evals/cases/note/files/.github/ci.yml'), 'on: push')
    writeFileSync(join(skill, '.secret'), 'the skill’s own')
    let seen: string[] = []
    let prompt = ''
    let secret = true
    const engine = engineThat((cwd, _call, request) => {
      seen = ['files/.eslintrc.json', 'files/.github/ci.yml'].map((file) =>
        readFileSync(join(cwd, file), 'utf8'),
      )
      prompt = request.prompt
      secret = existsSync(join(cwd, '.agents/skills/notes-skill/.secret'))
    })
    const { dir } = await generateRun(options(engine, 1))
    expect(seen).toEqual(['{"root": true}', 'on: push'])
    expect(secret).toBe(false)
    expect(existsSync(join(dir, '_skill/.secret'))).toBe(false)
    expect(prompt).toContain('files/.eslintrc.json')
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
    const engine = engineThat((cwd, _call, request) => {
      prompt = request.prompt
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

  it('takes no version for a run without the skill, so edited files still count as untested', async () => {
    const write = engineThat((cwd) => writeFileSync(join(cwd, 'outputs/note.md'), 'A note.'))
    await generateRun(options(write, 1))
    writeFileSync(join(skill, 'SKILL.md'), '---\nname: Notes Skill\n---\n\n- Keep it shorter.\n')
    // No name is needed: the run tests no version.
    const { meta } = await generateRun({
      ...options(write, 1),
      configuration: 'without_skill',
      skillName: null,
    })
    expect(meta).toMatchObject({ skillVersion: 'v1', skillName: '' })
    const { versions, current } = versionsOf(skill)
    expect(versions.map((v) => v.version)).toEqual(['v0'])
    expect(current).toMatchObject({ version: 'v1', changed: true })
    // The next run with the skill takes that number, under its own name.
    const { meta: next } = await generateRun({ ...options(write, 1), skillName: 'Shorter' })
    expect(next).toMatchObject({ skillVersion: 'v1', skillName: 'Shorter' })
    expect(versionsOf(skill).current).toMatchObject({ version: 'v1', changed: false })
  })

  it('names the skill to a run against an older version as that version named it', async () => {
    saveVersion(skill, versionsOf(skill).current, 'Short notes', '')
    writeFileSync(join(skill, 'SKILL.md'), '---\nname: Memo Skill\n---\n\n- Keep it long.\n')
    const seen: Record<string, string> = {}
    const engine = engineThat((cwd, _call, request) => {
      seen.prompt = request.prompt
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

  it('gives a run against a saved version its scripts, and says when a copy kept none', async () => {
    mkdirSync(join(skill, 'scripts'), { recursive: true })
    writeFileSync(join(skill, 'scripts/count.sh'), 'wc -w')
    saveVersion(skill, versionsOf(skill).current, 'Short notes', '')
    rmSync(join(skill, 'scripts'), { recursive: true })
    const seen: string[] = []
    const engine = engineThat((cwd) => {
      seen.push(readFileSync(join(cwd, '.agents/skills/notes-skill/scripts/count.sh'), 'utf8'))
    })
    const log: string[] = []
    await generateRun({
      ...options(engine, 1),
      configuration: 'old_skill',
      baseline: 'v0',
      log: (line) => log.push(line),
    })
    expect(seen).toEqual(['wc -w'])
    expect(log.join('\n')).not.toMatch('references/ only')

    // A copy saved with SKILL.md and references alone, as an older app saved one.
    rmSync(join(skill, 'evals/versions/v0/files/scripts'), { recursive: true })
    rmSync(join(skill, 'evals/runs'), { recursive: true })
    await generateRun({
      ...options(
        engineThat(() => {}),
        1,
      ),
      configuration: 'old_skill',
      baseline: 'v0',
      log: (line) => log.push(line),
    })
    expect(log.join('\n')).toMatch(
      'v0 was kept with SKILL.md and references/ only: this run gets none of its scripts',
    )
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

  it('runs the files of a folder outside the skill as the version, held against the skill’s', async () => {
    const draft = mkdtempSync(join(tmpdir(), 'st-draft-'))
    made.push(draft)
    const working = readFileSync(join(skill, 'SKILL.md'), 'utf8')
    await generateRun(
      options(
        engineThat(() => {}),
        1,
      ),
    )
    writeFileSync(join(draft, 'SKILL.md'), '---\nname: Notes Skill\n---\n\n- Keep it long.\n')
    mkdirSync(join(draft, 'scripts'))
    writeFileSync(join(draft, 'scripts/tool.sh'), 'draft tool')
    let seen = ''
    const engine = engineThat((cwd) => {
      seen = readFileSync(join(cwd, '.agents/skills/notes-skill/SKILL.md'), 'utf8')
    })
    // New files take the next number, and a name.
    await expect(
      generateRun({ ...options(engine, 1), from: draft, skillName: null }),
    ).rejects.toThrow('Name this version (v1) to run it.')
    const { dir, meta } = await generateRun({
      ...options(engine, 1),
      from: draft,
      skillName: 'Long',
    })
    expect(meta).toMatchObject({ skillVersion: 'v1', skillName: 'Long' })
    expect(seen).toContain('Keep it long')
    expect(readFileSync(join(dir, '_skill/SKILL.md'), 'utf8')).toContain('Keep it long')
    expect(readFileSync(join(dir, '_skill/scripts/tool.sh'), 'utf8')).toBe('draft tool')
    // The skill's own files are untouched, and are still the version they were.
    expect(readFileSync(join(skill, 'SKILL.md'), 'utf8')).toBe(working)
    expect(readFileSync(join(skill, 'scripts/tool.sh'), 'utf8')).toBe('first tool')
    expect(versionsOf(skill).current).toMatchObject({ version: 'v0', changed: false })
    expect(versionsOf(skill).versions.map((v) => v.version)).toEqual(['v0', 'v1'])
    // The same files as a kept version are that version, with no name asked.
    const again = await generateRun({ ...options(engine, 1), from: draft, skillName: null })
    expect(again.meta).toMatchObject({ skillVersion: 'v1', skillName: 'Long' })
    cpSync(join(skill, 'SKILL.md'), join(draft, 'SKILL.md'))
    cpSync(join(skill, 'scripts'), join(draft, 'scripts'), { recursive: true })
    const same = await generateRun({ ...options(engine, 1), from: draft, skillName: null })
    expect(same.meta).toMatchObject({ skillVersion: 'v0', skillName: 'First version' })
  })

  it('refuses a draft folder with no SKILL.md, none named, one inside or around the skill, and a run that is not with_skill', async () => {
    const engine = engineThat(() => {})
    const empty = mkdtempSync(join(tmpdir(), 'st-draft-'))
    made.push(empty)
    // An empty name is no folder, not the skill's own files.
    await expect(generateRun({ ...options(engine, 1), from: '' })).rejects.toThrow(
      'No folder was named',
    )
    await expect(generateRun({ ...options(engine, 1), from: empty })).rejects.toThrow(
      'No SKILL.md at',
    )
    mkdirSync(join(skill, 'drafts/long'), { recursive: true })
    writeFileSync(join(skill, 'drafts/long/SKILL.md'), '- Keep it long.\n')
    await expect(
      generateRun({ ...options(engine, 1), from: join(skill, 'drafts/long') }),
    ).rejects.toThrow("is inside the skill's folder")
    await expect(generateRun({ ...options(engine, 1), from: skill })).rejects.toThrow(
      "is inside the skill's folder",
    )
    const around = mkdtempSync(join(tmpdir(), 'st-around-'))
    made.push(around)
    cpSync(skill, join(around, 'notes'), { recursive: true })
    writeFileSync(join(around, 'SKILL.md'), '- Keep it long.\n')
    await expect(
      generateRun({ ...options(engine, 1), skillDir: join(around, 'notes'), from: around }),
    ).rejects.toThrow("holds the skill's folder")
    writeFileSync(join(empty, 'SKILL.md'), '- Keep it long.\n')
    for (const configuration of ['without_skill', 'old_skill'] as const)
      await expect(
        generateRun({ ...options(engine, 1), configuration, baseline: 'v0', from: empty }),
      ).rejects.toThrow(`cannot be ${configuration}`)
    expect(engine.calls).toBe(0)
    expect(existsSync(join(skill, 'evals/runs'))).toBe(false)
  })

  it('leaves the runs folder as it found it when a run is refused', async () => {
    const engine = engineThat(() => {})
    const runs = join(skill, 'evals/runs')
    const draft = mkdtempSync(join(tmpdir(), 'st-draft-'))
    made.push(draft)
    writeFileSync(join(draft, 'SKILL.md'), '- Keep it long.\n')
    const refused = [
      { skillName: null },
      { from: join(draft, 'missing') },
      { from: draft, configuration: 'without_skill' as const },
    ]
    for (const how of refused)
      await expect(generateRun({ ...options(engine, 1), ...how })).rejects.toThrow()
    expect(existsSync(runs)).toBe(false)
    await generateRun(options(engine, 1))
    const then = new Date('2026-01-01T00:00:00Z')
    utimesSync(runs, then, then)
    writeFileSync(join(skill, 'SKILL.md'), '---\nname: Notes Skill\n---\n\n- Keep it shorter.\n')
    for (const how of [...refused, { from: draft, skillName: null }])
      await expect(generateRun({ ...options(engine, 1), ...how })).rejects.toThrow()
    expect(statSync(runs).mtimeMs).toBe(then.getTime())
    expect(readdirSync(runs)).toHaveLength(1)
  })

  /**
   * Start a run of each of two drafts, `a` and `b`, in two processes at once,
   * each named `named` when given; each process's version, or its failure.
   */
  async function startTogether(named?: string): Promise<PromiseSettledResult<string>[]> {
    const scratch = mkdtempSync(join(tmpdir(), 'st-stamp-'))
    made.push(scratch)
    // Files enough that one start takes a while, so the two would overlap with nothing to stop them.
    for (let n = 0; n < 200; n += 1) writeFileSync(join(skill, 'scripts', `tool-${n}.sh`), `${n}`)
    const drafts = ['a', 'b'].map((letter) => {
      const draft = join(scratch, `draft-${letter}`)
      cpSync(skill, draft, {
        recursive: true,
        filter: (path) => !path.startsWith(join(skill, 'evals')),
      })
      writeFileSync(join(draft, 'SKILL.md'), `---\nname: Notes Skill\n---\n\n- Draft ${letter}.\n`)
      return draft
    })
    const script = join(scratch, 'start.mts')
    writeFileSync(script, START_SCRIPT)
    const go = join(scratch, 'go')
    const children = drafts.map((draft, i) => {
      const child = spawn(
        process.execPath,
        [
          '--import',
          'tsx',
          script,
          skill,
          draft,
          join(scratch, `ready-${i}`),
          go,
          ...(named ? [named] : []),
        ],
        { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
      )
      let out = ''
      let err = ''
      child.stdout.on('data', (chunk) => (out += chunk))
      child.stderr.on('data', (chunk) => (err += chunk))
      return new Promise<string>((done, fail) =>
        child.on('close', (code) => (code === 0 ? done(out.trim()) : fail(new Error(err)))),
      )
    })
    while (![0, 1].every((i) => existsSync(join(scratch, `ready-${i}`))))
      await new Promise((done) => setTimeout(done, 10))
    writeFileSync(go, '')
    return Promise.allSettled(children)
  }

  it('gives two runs of two drafts started together in two processes two numbers', async () => {
    const versions = (await startTogether()).map((result) =>
      result.status === 'fulfilled' ? result.value : String(result.reason),
    )
    expect(versions.sort()).toEqual(['v0', 'v1'])
    // Two runs, and the lock given back.
    expect(readdirSync(join(skill, 'evals/runs'))).toHaveLength(2)
    expect(existsSync(join(skill, 'evals/runs', STAMP_LOCK_FILE))).toBe(false)
  }, 60_000)

  it('refuses the second of two drafts started together under one new name', async () => {
    const results = await startTogether('Draft A')
    const kept = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
    const refused = results.flatMap((r) => (r.status === 'rejected' ? [String(r.reason)] : []))
    expect(kept).toEqual(['v0'])
    expect(refused).toHaveLength(1)
    expect(refused[0]).toContain('v0 is already called "Draft A"')
    // One run, one version of that name, and the lock given back.
    expect(readdirSync(join(skill, 'evals/runs'))).toHaveLength(1)
    expect(versionsOf(skill).versions.map((v) => [v.version, v.name])).toEqual([['v0', 'Draft A']])
    expect(existsSync(join(skill, 'evals/runs', STAMP_LOCK_FILE))).toBe(false)
  }, 60_000)

  it('refuses new files a name another version has, read as a person reads it, before it writes', async () => {
    const engine = engineThat(() => {})
    const runs = join(skill, 'evals/runs')
    const own = { ...options(engine, 1), ownName: true }
    await generateRun({ ...own, skillName: 'Draft A' })
    const then = new Date('2026-01-01T00:00:00Z')
    utimesSync(runs, then, then)
    const draft = mkdtempSync(join(tmpdir(), 'st-draft-'))
    made.push(draft)
    writeFileSync(join(draft, 'SKILL.md'), '---\nname: Notes Skill\n---\n\n- Keep it long.\n')
    // From a draft or from the skill's own edited files, the name is held by v0 however it is typed.
    for (const name of ['Draft A', '  draft a ', 'DRAFT  A', 'draft\ta'])
      await expect(generateRun({ ...own, from: draft, skillName: name })).rejects.toThrow(
        'v0 is already called "Draft A". Give these files (v1) a name of their own to run them.',
      )
    writeFileSync(join(skill, 'SKILL.md'), '---\nname: Notes Skill\n---\n\n- Keep it shorter.\n')
    await expect(generateRun({ ...own, skillName: 'draft a' })).rejects.toThrow('already called')
    // An empty name is asked for as no name, never matched to a version.
    for (const name of ['', '   '])
      await expect(generateRun({ ...own, skillName: name })).rejects.toThrow(
        'Name this version (v1) to run it.',
      )
    expect(engine.calls).toBe(1)
    expect(statSync(runs).mtimeMs).toBe(then.getTime())
    expect(readdirSync(runs)).toHaveLength(1)
    // A name of their own is taken.
    const fresh = await generateRun({ ...own, skillName: 'Draft A, shorter' })
    expect(fresh.meta).toMatchObject({ skillVersion: 'v1', skillName: 'Draft A, shorter' })
    // The same files as a kept version are that version: its own name, or another's, is no error.
    for (const name of ['Draft A, shorter', 'Draft A', null]) {
      const again = await generateRun({ ...own, skillName: name })
      expect(again.meta).toMatchObject({ skillVersion: 'v1', skillName: 'Draft A, shorter' })
    }
    // Without `ownName`, as the app runs, a name may be shared.
    const shared = await generateRun({ ...options(engine, 1), from: draft, skillName: 'Draft A' })
    expect(shared.meta).toMatchObject({ skillVersion: 'v2', skillName: 'Draft A' })
  })

  it('reads names that look alike as one, and one with nothing to read as no name', async () => {
    const engine = engineThat(() => {})
    const own = { ...options(engine, 1), ownName: true }
    await generateRun({ ...own, skillName: 'Café Draft' })
    const draft = mkdtempSync(join(tmpdir(), 'st-draft-'))
    made.push(draft)
    writeFileSync(join(draft, 'SKILL.md'), '---\nname: Notes Skill\n---\n\n- Keep it long.\n')
    const alike = [
      '\uFF23\uFF41\uFF46é \uFF24\uFF52\uFF41\uFF46\uFF54', // full-width
      'Café\u200B Draft', // zero-width space
      'Ca\u200Cfé Dr\u200Daft', // zero-width non-joiner and joiner
      'Café\u2060 Draft\uFEFF', // word joiner, byte-order mark
      'Cafe\u0301 Draft', // é written as e and its accent
      'Café\u3000Draft', // ideographic space
      'Café\u0085Draft', // next line, white space JavaScript's \\s leaves out
      'Café \t\u00A0 Draft', // a run of white space
      'CAFÉ DRAFT',
    ]
    for (const name of alike)
      await expect(
        generateRun({ ...own, from: draft, skillName: name }),
        JSON.stringify(name),
      ).rejects.toThrow('v0 is already called "Café Draft"')
    for (const name of ['\u200B', '\u200C\u200D\u2060\uFEFF', '\u3000\u0085', ' \u200B '])
      await expect(
        generateRun({ ...own, from: draft, skillName: name }),
        JSON.stringify(name),
      ).rejects.toThrow('Name this version (v1) to run it.')
    // Folded as a person reads it: `ß` is `SS`.
    await generateRun({ ...own, from: draft, skillName: 'Straße' })
    writeFileSync(join(draft, 'SKILL.md'), '---\nname: Notes Skill\n---\n\n- Keep it longer.\n')
    await expect(generateRun({ ...own, from: draft, skillName: 'STRASSE' })).rejects.toThrow(
      'v1 is already called "Straße"',
    )
    expect(engine.calls).toBe(2)
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

describe('the folder an agent works in', () => {
  /** Every folder above `dir`, nearest first. */
  const above = (dir: string): string[] => {
    const out: string[] = []
    for (let at = dirname(dir); at !== dirname(at); at = dirname(at)) out.push(at)
    return out
  }

  it('has nothing of the skill or the run above it or beside it, and its work lands in the run', async () => {
    // What an agent CLI reads from the folders above it, marked, where a skill in a repository keeps it.
    writeFileSync(join(skill, 'CLAUDE.md'), 'MARKED: the repository’s instructions')
    mkdirSync(join(skill, '.claude/skills/marked'), { recursive: true })
    writeFileSync(join(skill, '.claude/skills/marked/SKILL.md'), '---\nname: marked\n---\n')
    mkdirSync(join(skill, '.git'))
    let seen: { cwd: string; parents: string[]; beside: string[]; reached: string[] } | null = null
    const engine = engineThat((cwd) => {
      seen = {
        cwd,
        parents: above(cwd),
        beside: readdirSync(join(cwd, '..')),
        reached: ['../_skill', '../_cases.json', '../_inputs', '../_checks', '../run.json']
          .flatMap((rel) => [rel, `../${rel}`, `../../${rel}`])
          .filter((rel) => existsSync(join(cwd, rel))),
      }
      writeFileSync(join(cwd, 'outputs/note.md'), 'A note.')
      writeFileSync(join(cwd, 'notes.md'), 'Chose short.')
    })
    const { dir } = await generateRun(options(engine, 1))
    if (!seen) throw new Error('the agent never ran')
    const { cwd, parents, beside, reached } = seen as NonNullable<typeof seen>
    for (const parent of [cwd, ...parents])
      for (const owner of [skill, realpathSync(skill)]) expect(isWithin(parent, owner)).toBe(false)
    expect(beside).toEqual(['note-s1'])
    expect(reached).toEqual([])
    // Its work is in the run, and the folder made for it is gone.
    expect(readFileSync(join(dir, 'note-s1/outputs/note.md'), 'utf8')).toBe('A note.')
    expect(readFileSync(join(dir, 'note-s1/notes.md'), 'utf8')).toBe('Chose short.')
    expect(existsSync(join(dir, 'note-s1/prompt.md'))).toBe(true)
    expect(existsSync(join(dir, 'note-s1/.agents/skills/notes-skill/SKILL.md'))).toBe(true)
    expect(existsSync(dirname(cwd))).toBe(false)
    const { name } = readJson<{ name: string }>(join(dir, 'run.json'), { name: '' })
    expect(readRun(skill, name).samples[0].artifacts).toEqual([
      { file: 'outputs/note.md', kind: 'markdown' },
    ])
  })

  it('names nothing of the run or of whether the skill is there', async () => {
    const cwds: string[] = []
    const engine = engineThat((cwd) => {
      cwds.push(cwd)
    })
    await generateRun({ ...options(engine, 1), configuration: 'without_skill' })
    await generateRun(options(engine, 1))
    for (const cwd of cwds) {
      expect(cwd).not.toMatch(/with_skill|without_skill|evals|runs/)
      expect(cwd.split(/[\\/]/).at(-1)).toBe('note-s1')
    }
  })

  it('shows what the agent writes while it works, from its own folder', async () => {
    let named = ''
    let live: { files: string[]; served: string } | null = null
    const engine = engineThat((cwd) => {
      writeFileSync(join(cwd, 'outputs/note.md'), 'Half a no')
      const run = join(skill, 'evals/runs', named)
      live = {
        files: runSamples(run)[0].artifacts.map((a) => a.file),
        served: readFileSync(sampleFile(skill, named, 'note-s1', 'outputs/note.md'), 'utf8'),
      }
      expect(() => sampleFile(skill, named, 'note-s1', '../../escape.md')).toThrow()
    })
    await generateRun({
      ...options(engine, 1),
      onNamed: (name) => {
        named = name
      },
    })
    expect(live).toEqual({ files: ['outputs/note.md'], served: 'Half a no' })
  })

  it('moves the work in and removes the folder when the run is stopped or the agent throws', async () => {
    const stop = new AbortController()
    const cwds: string[] = []
    const engine = engineThat((cwd, call) => {
      cwds.push(cwd)
      writeFileSync(join(cwd, 'outputs/note.md'), 'Half a no')
      if (call === 1) {
        stop.abort()
        return { ok: false, error: 'stopped' }
      }
      throw new Error('the CLI broke')
    })
    const first = await generateRun({ ...options(engine, 1), signal: stop.signal })
    const second = await generateRun(options(engine, 1))
    for (const { dir } of [first, second])
      expect(readFileSync(join(dir, 'note-s1/outputs/note.md'), 'utf8')).toBe('Half a no')
    for (const cwd of cwds) expect(existsSync(dirname(cwd))).toBe(false)
    expect(second.meta.samples[0]).toMatchObject({
      failed: 'could not start',
      outputs: ['outputs/note.md'],
    })
  })

  it('judges the paths the agent used in its own folder as inside the sample', async () => {
    const engine = engineThat((cwd, _call, request) => {
      request.transcript.toolStart('1', 'Bash', { command: `cat ${cwd}/files/input.txt` })
      request.transcript.toolEnd('1', 'first input')
      request.transcript.toolStart('2', 'Bash', { command: 'cat ../_cases.json' })
      request.transcript.toolEnd('2', '')
      writeFileSync(join(cwd, 'outputs/note.md'), 'A note.')
    })
    const { dir } = await generateRun(options(engine, 1))
    const sample = join(dir, 'note-s1')
    const transcript = readSampleTranscript(sample)
    expect(transcript?.find((e) => e.kind === 'tool')?.args).toBe(`cat ${sample}/files/input.txt`)
    const raw = await packById('workflow')?.judge(
      {
        text: '',
        units: [],
        case: null,
        images: [],
        rules: [],
        artifacts: [{ file: 'outputs/note.md', kind: 'markdown' }],
        primary: null,
        others: [],
        skill: null,
        notes: null,
        transcript,
        dir: sample,
        renders: [],
      },
      {
        jev: new Jev(undefined, 'grade'),
        useJev: false,
        config: mergeConfig({ packs: ['workflow'] }, [workflowScoring]),
        skillDir: skill,
        log: () => {},
      },
    )
    const outside = (raw as { metrics: { outside: string[] } }).metrics.outside
    expect(outside).toEqual(['../_cases.json'])
  })
})
