import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExecOptions, ExecResult } from '../exec.ts'
import { TranscriptWriter } from '../transcript.ts'
import type { Engine, EngineRequest } from './types.ts'

// The CLI is a child process: answer for it, at once or when `held` is let go.
const cli = vi.hoisted(() => ({
  calls: [] as Array<{ args: string[]; options: ExecOptions }>,
  answer: { code: 0, stdout: '' } as Partial<ExecResult>,
  held: null as Promise<void> | null,
}))

vi.mock('../exec.ts', () => ({
  hasCommand: () => true,
  exec: async (_command: string, args: string[], options: ExecOptions) => {
    cli.calls.push({ args, options })
    if (cli.held) await cli.held
    return { signal: null, timedOut: false, spawnError: null, stderr: '', ...cli.answer }
  },
}))

/** Let a read started in the background come back. */
const settled = () => new Promise((done) => setImmediate(done))

/** Ask for the models, and again once the read that started has come back. */
async function listed(engine: Engine): Promise<string[]> {
  await engine.models()
  await settled()
  return engine.models()
}

let dir: string
let request: EngineRequest
let cursorEngine: Engine

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'st-cursor-'))
  cli.calls = []
  cli.answer = { code: 0, stdout: '' }
  cli.held = null
  request = {
    cwd: dir,
    prompt: 'Write a note.',
    model: null,
    effort: null,
    allowedTools: null,
    timeoutMs: 60_000,
    transcript: new TranscriptWriter(join(dir, 'transcript.jsonl')),
  }
  // The list is kept by the module: each test starts with none.
  vi.resetModules()
  ;({ cursorEngine } = await import('./cursor.ts'))
  vi.useFakeTimers({ toFake: ['Date'] })
})

afterEach(() => {
  vi.useRealTimers()
  rmSync(dir, { recursive: true, force: true })
})

const LIST = 'Available models\n\nauto - Auto\ngpt-5 - GPT-5\nsonnet-4.5 - Sonnet (current)\n'

describe('cursor models', () => {
  it("asks the CLI without the app's keys", async () => {
    process.env.TYPESAFE_API_KEY = 'secret'
    process.env.SKILL_STUDIO_OPENAI_API_KEY = 'secret'
    try {
      cli.answer = { code: 0, stdout: LIST }
      expect(await listed(cursorEngine)).toEqual(['auto', 'gpt-5', 'sonnet-4.5'])
      const env = cli.calls[0].options.env ?? {}
      expect(cli.calls[0].args).toEqual(['--list-models'])
      expect(Object.keys(env).filter((k) => /TYPESAFE|SKILL_STUDIO/.test(k))).toEqual([])
    } finally {
      delete process.env.TYPESAFE_API_KEY
      delete process.env.SKILL_STUDIO_OPENAI_API_KEY
    }
  })

  it('keeps a list once it has one', async () => {
    cli.answer = { code: 0, stdout: LIST }
    await listed(cursorEngine)
    await cursorEngine.models()
    expect(cli.calls).toHaveLength(1)
  })

  it('does not keep an empty list: it asks again after a while, and has the models once signed in', async () => {
    cli.answer = { code: 1, stdout: 'Error: not logged in\n' }
    expect(await listed(cursorEngine)).toEqual([])
    // Asked again at once, the CLI is not run again.
    expect(await cursorEngine.models()).toEqual([])
    expect(cli.calls).toHaveLength(1)

    cli.answer = { code: 0, stdout: LIST }
    vi.setSystemTime(Date.now() + 31_000)
    expect(await listed(cursorEngine)).toEqual(['auto', 'gpt-5', 'sonnet-4.5'])
    expect(cli.calls).toHaveLength(2)
  })

  it('answers at once while the CLI is slow to list, and runs one read at a time', async () => {
    let answer = () => {}
    cli.held = new Promise<void>((done) => {
      answer = done
    })
    cli.answer = { code: 1, stdout: 'Error: not logged in\n' }
    // Every ask while the read is out answers with what there is, and starts no second read.
    expect(await cursorEngine.models()).toEqual([])
    vi.setSystemTime(Date.now() + 31_000)
    expect(await Promise.all([cursorEngine.models(), cursorEngine.models()])).toEqual([[], []])
    expect(cli.calls).toHaveLength(1)
    cli.answer = { code: 0, stdout: LIST }
    answer()
    await settled()
    expect(await cursorEngine.models()).toEqual(['auto', 'gpt-5', 'sonnet-4.5'])
    expect(cli.calls).toHaveLength(1)
  })
})

describe('cursor run', () => {
  it('puts the effort on the model it knows', async () => {
    cli.answer = { code: 0, stdout: LIST }
    await listed(cursorEngine)
    await cursorEngine.run({ ...request, model: 'gpt-5', effort: 'high' })
    expect(cli.calls.at(-1)?.args).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--force',
      '--trust',
      '--model',
      'gpt-5[effort=high]',
      'Write a note.',
    ])
  })

  it('starts nothing for a model the CLI did not list, or an effort it does not have', async () => {
    cli.answer = { code: 0, stdout: LIST }
    await listed(cursorEngine)
    const calls = cli.calls.length
    for (const bad of [{ model: 'gpt-9' }, { model: 'gpt-5" & calc & "' }, { effort: 'max' }]) {
      const result = await cursorEngine.run({ ...request, model: 'gpt-5', ...bad })
      expect(result.ok).toBe(false)
      expect(result.error).toMatch(/^Cursor agent has no (model|effort) named /)
    }
    expect(cli.calls).toHaveLength(calls)
  })

  it('goes by the shape of a model id when the CLI has listed none', async () => {
    expect((await cursorEngine.run({ ...request, model: 'gpt-5' })).ok).toBe(true)
    const calls = cli.calls.length
    for (const model of ['--force', 'a b', 'x;y', '$(id)'])
      expect((await cursorEngine.run({ ...request, model })).ok).toBe(false)
    expect(cli.calls).toHaveLength(calls)
  })
})
