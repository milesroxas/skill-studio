/**
 * One `transcript.jsonl` per sample, the same event shape for every engine
 * (`TranscriptEvent` in core). Engines push events as their stream arrives;
 * the file is appended line by line so a killed run still leaves a record.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { TranscriptEvent, TranscriptKind } from '@domain/schemas.ts'

const MAX_LINE = 200
const MAX_TEXT = 4000

/** A value as one short line: whitespace collapsed, cut at `max` characters. */
function oneLine(value: unknown, max = MAX_LINE): string {
  const text =
    typeof value === 'string'
      ? value
      : value === undefined || value === null
        ? ''
        : JSON.stringify(value)
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

const ARG_KEYS = [
  'file_path',
  'path',
  'command',
  'pattern',
  'query',
  'url',
  'skill',
  'notebook_path',
  'description',
  'prompt',
]

/** A tool's arguments as one line: the path or command when there is one, else the JSON. */
function summarizeArgs(input: unknown): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return oneLine(input)
  const record = input as Record<string, unknown>
  const key = ARG_KEYS.find((k) => typeof record[k] === 'string' && record[k])
  if (!key) return oneLine(record)
  const extra =
    typeof record.content === 'string'
      ? ` (${record.content.length} chars)`
      : typeof record.new_string === 'string'
        ? ' (edit)'
        : ''
  return `${oneLine(record[key])}${extra}`
}

/** A tool's result as one line. Content blocks are flattened to their text. */
function summarizeResult(result: unknown): string {
  if (Array.isArray(result))
    return oneLine(
      result
        .map((part) =>
          part && typeof part === 'object' && 'text' in part ? String(part.text) : part,
        )
        .join(' '),
    )
  return oneLine(result)
}

export class TranscriptWriter {
  readonly path: string
  readonly startedAt = Date.now()
  readonly events: TranscriptEvent[] = []
  /**
   * Why the file stopped being written, once it has: the sample folder is
   * gone, or the disk is full. Events are still kept in `events`.
   */
  failure: string | null = null
  private open = new Map<string, { step: number; at: number; tool: string }>()

  constructor(path: string) {
    this.path = path
    writeFileSync(path, '')
  }

  push(event: Omit<TranscriptEvent, 'step' | 'at'>): TranscriptEvent {
    const full: TranscriptEvent = {
      step: this.events.length + 1,
      at: Date.now() - this.startedAt,
      ...event,
    }
    if (full.text && full.text.length > MAX_TEXT)
      full.text = `${full.text.slice(0, MAX_TEXT)}… [${full.text.length} chars]`
    this.events.push(full)
    // Called as a child's output arrives: a throw here would be the backend's, not the run's.
    if (this.failure === null)
      try {
        appendFileSync(this.path, `${JSON.stringify(full)}\n`)
      } catch (error) {
        this.failure = (error as Error).message
      }
    return full
  }

  text(kind: TranscriptKind, text: string): void {
    if (text.trim()) this.push({ kind, text })
  }

  /** A tool call starts; `id` ties its result back to it. */
  toolStart(id: string, tool: string, args: unknown): void {
    const event = this.push({ kind: 'tool', tool, args: summarizeArgs(args) })
    this.open.set(id, { step: event.step, at: Date.now(), tool })
  }

  toolEnd(id: string, result: unknown, error = false): void {
    const started = this.open.get(id)
    this.open.delete(id)
    this.push({
      kind: 'result',
      tool: started?.tool,
      result: summarizeResult(result),
      durationMs: started ? Date.now() - started.at : undefined,
      error: error || undefined,
    })
  }

  counts(): { steps: number; toolCalls: number; errors: number } {
    return {
      steps: this.events.filter((e) => e.kind === 'text' || e.kind === 'tool').length,
      toolCalls: this.events.filter((e) => e.kind === 'tool').length,
      errors: this.events.filter((e) => e.error || e.kind === 'error').length,
    }
  }
}

/** The events of a `transcript.jsonl`; null when there is none. */
export function readTranscript(path: string): TranscriptEvent[] | null {
  if (!existsSync(path)) return null
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as TranscriptEvent]
      } catch {
        // A killed run can leave a torn last line.
        return []
      }
    })
}
