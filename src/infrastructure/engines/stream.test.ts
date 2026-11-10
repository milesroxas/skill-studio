import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExecOptions, ExecResult } from '../exec.ts'
import { TranscriptWriter } from '../transcript.ts'
import { claudeEngine } from './claude.ts'
import { runStreamJson } from './stream.ts'
import type { EngineRequest } from './types.ts'

// The agent CLI is a child process: replay its stdout lines instead.
const replay = vi.hoisted(() => ({
  lines: [] as string[],
  calls: [] as Array<{ command: string; args: string[] }>,
  run: {
    code: 0,
    timedOut: false,
    spawnError: null,
    stdout: '',
    stderr: '',
  } as Partial<ExecResult>,
}))

vi.mock('../exec.ts', () => ({
  hasCommand: () => true,
  exec: async (command: string, args: string[], options: ExecOptions) => {
    replay.calls.push({ command, args })
    for (const line of replay.lines) options.onLine?.(line)
    return { signal: null, ...replay.run }
  },
}))

let dir: string
let request: EngineRequest

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'st-stream-'))
  replay.lines = []
  replay.calls = []
  replay.run = { code: 0, timedOut: false, spawnError: null, stdout: '', stderr: '' }
  request = {
    cwd: dir,
    prompt: 'Write a note.',
    model: null,
    effort: null,
    allowedTools: null,
    timeoutMs: 60_000,
    transcript: new TranscriptWriter(join(dir, 'transcript.jsonl')),
  }
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

const json = (value: unknown) => JSON.stringify(value)

describe('runStreamJson', () => {
  it('passes JSON events to the handler and logs other lines as system text', async () => {
    replay.lines = [json({ type: 'a' }), 'not json', json({ type: 'b' })]
    const seen: string[] = []
    const result = await runStreamJson<{ type: string }>('x', [], request, (e) => seen.push(e.type))
    expect(seen).toEqual(['a', 'b'])
    expect(request.transcript.events).toMatchObject([{ kind: 'system', text: 'not json' }])
    expect(result.ok).toBe(true)
  })

  it('takes a line of JSON that is not an object as text, not as an event', async () => {
    replay.lines = ['null', '42', '"word"', '[1]', json({ type: 'a' })]
    const seen: unknown[] = []
    await runStreamJson<{ type: string }>('x', [], request, (e) => seen.push(e.type))
    expect(seen).toEqual(['a'])
    expect(request.transcript.events.map((e) => e.text)).toEqual(['null', '42', '"word"', '[1]'])
  })

  it('says once, in the log, when the transcript could not be written', async () => {
    replay.lines = ['one', 'two']
    const logged: string[] = []
    request.log = (line) => logged.push(line)
    rmSync(dir, { recursive: true, force: true })
    const result = await runStreamJson('x', [], request, () => {})
    expect(result.ok).toBe(true)
    expect(logged).toHaveLength(1)
    expect(logged[0]).toMatch(/transcript could not be written: ENOENT/)
  })

  it('reports a nonzero exit with the stderr tail', async () => {
    replay.run = { ...replay.run, code: 2, stderr: 'auth failed\n' }
    const result = await runStreamJson('x', [], request, () => {})
    expect(result).toMatchObject({ ok: false, error: 'auth failed' })
  })

  it('reports a timeout', async () => {
    replay.run = { ...replay.run, code: null, timedOut: true }
    const result = await runStreamJson('x', [], request, () => {})
    expect(result).toMatchObject({ ok: false, error: 'timed out after 60 s' })
  })
})

describe('claude stream-json', () => {
  it('turns a session into transcript events and a result', async () => {
    replay.lines = [
      json({ type: 'system', subtype: 'init', model: 'claude-haiku' }),
      json({
        type: 'assistant',
        message: {
          content: [
            { type: 'thinking', thinking: 'plan' },
            { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'SKILL.md' } },
          ],
        },
      }),
      json({
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'rules' }] },
      }),
      json({ type: 'assistant', message: { content: [{ type: 'text', text: 'Done.' }] } }),
      json({
        type: 'result',
        subtype: 'success',
        result: 'Wrote outputs/note.md',
        total_cost_usd: 0.01,
        usage: { input_tokens: 10, cache_read_input_tokens: 5, output_tokens: 3 },
      }),
    ]
    const result = await claudeEngine.run(request)
    expect(result).toMatchObject({
      ok: true,
      error: null,
      model: 'claude-haiku',
      costUsd: 0.01,
      tokens: { input: 15, output: 3 },
      finalText: 'Wrote outputs/note.md',
    })
    expect(request.transcript.events.map((e) => e.kind)).toEqual([
      'system',
      'thinking',
      'tool',
      'result',
      'text',
    ])
    expect(request.transcript.events[3]).toMatchObject({ tool: 'Read', result: 'rules' })
  })

  it('passes the model and effort it knows, and its shared flags', async () => {
    await claudeEngine.run({ ...request, model: 'opus', effort: 'high', allowedTools: ['Read'] })
    expect(replay.calls.at(-1)?.args).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--no-session-persistence',
      '--strict-mcp-config',
      '--setting-sources',
      'project',
      '--permission-mode',
      'acceptEdits',
      '--allowedTools',
      'Read',
      '--model',
      'opus',
      '--effort',
      'high',
    ])
    await claudeEngine.run({ ...request, model: 'claude-opus-5-5[1m]', effort: 'default' })
    expect(replay.calls.at(-1)?.args.slice(-2)).toEqual(['--model', 'claude-opus-5-5[1m]'])
  })

  it('hands on any id the CLI may know, Bedrock, Vertex and its own aliases included', async () => {
    for (const model of [
      'opusplan',
      'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      'claude-opus-4-1@20250805',
      'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/abc123',
      'sonnet[1m]',
    ]) {
      await claudeEngine.run({ ...request, model })
      expect(replay.calls.at(-1)?.args.slice(-2)).toEqual(['--model', model])
    }
  })

  it('starts nothing for a model or an effort it does not have', async () => {
    for (const bad of [
      { model: '--dangerously-skip-permissions' },
      { model: 'sonnet" & calc & "' },
      { model: 'sonnet --add-dir /' },
      { model: "son'net" },
      { model: '$(id)' },
      { model: `claude-${'x'.repeat(120)}` },
      { effort: 'extreme' },
      { effort: 'high --add-dir /' },
    ]) {
      const result = await claudeEngine.run({ ...request, ...bad })
      expect(result.ok).toBe(false)
      expect(result.error).toMatch(/^Claude Code has no (model|effort) named /)
    }
    expect(replay.calls).toEqual([])
    expect(request.transcript.events.every((e) => e.kind === 'error')).toBe(true)
  })

  it('records a failed session as an error event', async () => {
    replay.lines = [json({ type: 'result', subtype: 'error_max_turns', is_error: true })]
    const result = await claudeEngine.run(request)
    expect(result.error).toBe('error_max_turns')
    expect(request.transcript.events).toMatchObject([{ kind: 'error', error: true }])
  })
})
