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
  exec: async (_command: string, _args: string[], options: ExecOptions) => {
    for (const line of replay.lines) options.onLine?.(line)
    return { signal: null, ...replay.run }
  },
}))

let dir: string
let request: EngineRequest

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'st-stream-'))
  replay.lines = []
  replay.run = { code: 0, timedOut: false, spawnError: null, stdout: '', stderr: '' }
  request = {
    cwd: dir,
    prompt: 'Write a note.',
    model: null,
    effort: null,
    allowedTools: null,
    timeoutMs: 60_000,
    transcript: new TranscriptWriter(join(dir, 'transcript.jsonl')),
    log: () => {},
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

  it('records a failed session as an error event', async () => {
    replay.lines = [json({ type: 'result', subtype: 'error_max_turns', is_error: true })]
    const result = await claudeEngine.run(request)
    expect(result.error).toBe('error_max_turns')
    expect(request.transcript.events).toMatchObject([{ kind: 'error', error: true }])
  })
})
