import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readTranscript, TranscriptWriter } from './transcript.ts'

let dir: string
let path: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'st-transcript-'))
  path = join(dir, 'transcript.jsonl')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('TranscriptWriter', () => {
  it('numbers steps and appends one JSON line per event', () => {
    const t = new TranscriptWriter(path)
    t.text('text', 'hello')
    t.text('text', '   ')
    t.toolStart('a', 'Read', { file_path: '/x/SKILL.md' })
    t.toolEnd('a', [{ type: 'text', text: 'line one\n  line two' }])
    const lines = readFileSync(path, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
    expect(lines.map((l) => [l.step, l.kind])).toEqual([
      [1, 'text'],
      [2, 'tool'],
      [3, 'result'],
    ])
    expect(lines[1]).toMatchObject({ tool: 'Read', args: '/x/SKILL.md' })
    expect(lines[2]).toMatchObject({ tool: 'Read', result: 'line one line two' })
  })

  it('summarizes write arguments and flags errors', () => {
    const t = new TranscriptWriter(path)
    t.toolStart('w', 'Write', { file_path: 'out.md', content: 'abcd' })
    t.toolStart('e', 'Edit', { file_path: 'out.md', old_string: 'a', new_string: 'b' })
    t.toolStart('g', 'Other', { flag: true })
    t.toolEnd('e', 'boom', true)
    expect(t.events.map((e) => e.args).slice(0, 3)).toEqual([
      'out.md (4 chars)',
      'out.md (edit)',
      '{"flag":true}',
    ])
    expect(t.events[3]).toMatchObject({ kind: 'result', tool: 'Edit', error: true })
    expect(t.counts()).toEqual({ steps: 3, toolCalls: 3, errors: 1 })
  })

  it('cuts long arguments and text', () => {
    const t = new TranscriptWriter(path)
    t.toolStart('b', 'Bash', { command: 'x'.repeat(500) })
    t.text('text', 'y'.repeat(5000))
    expect(t.events[0].args).toHaveLength(200)
    expect(t.events[0].args?.endsWith('…')).toBe(true)
    expect(t.events[1].text).toMatch(/… \[5000 chars\]$/)
  })
})

describe('readTranscript', () => {
  it('returns null without a file', () => {
    expect(readTranscript(path)).toBeNull()
  })

  it('skips blank and torn lines', () => {
    const t = new TranscriptWriter(path)
    t.text('text', 'done')
    appendFileSync(path, '\n{"step":2,"kind":"to')
    const events = readTranscript(path)
    expect(events).toHaveLength(1)
    expect(events?.[0]).toMatchObject({ step: 1, kind: 'text', text: 'done' })
  })
})
