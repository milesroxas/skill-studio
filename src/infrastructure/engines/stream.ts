import { exec } from '../exec.ts'
import type { EngineRequest, EngineResult } from './types.ts'

/** The closing event both CLIs send. */
export interface ResultEvent {
  type: string
  subtype?: string
  result?: string
  is_error?: boolean
  error?: string
}

/**
 * Read the opening `init` event both CLIs send: the model the run uses, and a
 * first transcript line naming the CLI. False for any other event.
 */
export function readInit(
  event: ResultEvent & { model?: string },
  cli: string,
  request: EngineRequest,
  result: EngineResult,
): boolean {
  if (event.type !== 'system' || event.subtype !== 'init') return false
  result.model = event.model ?? null
  request.transcript.push({ kind: 'system', text: `${cli} ${event.model ?? ''}`.trim() })
  return true
}

/** Read the closing `result` event: the agent's last word, and whether the session failed. */
export function readResult(event: ResultEvent, request: EngineRequest, result: EngineResult): void {
  if (typeof event.result === 'string' && event.result.trim()) result.finalText = event.result
  if (event.is_error || (event.subtype && event.subtype !== 'success')) {
    result.error = event.error ?? event.subtype ?? 'error'
    request.transcript.push({ kind: 'error', text: result.error, error: true })
  }
}

/**
 * Run an agent CLI that prints one JSON event per stdout line, passing each
 * event to `handle`. A line that is not JSON goes to the transcript as is.
 */
export async function runStreamJson<E>(
  command: string,
  args: string[],
  request: EngineRequest,
  handle: (event: E, result: EngineResult) => void,
  options: { env?: NodeJS.ProcessEnv; input?: string } = {},
): Promise<EngineResult> {
  const result: EngineResult = {
    ok: false,
    error: null,
    costUsd: null,
    tokens: null,
    model: null,
    finalText: null,
  }
  const run = await exec(command, args, {
    ...options,
    cwd: request.cwd,
    timeoutMs: request.timeoutMs,
    signal: request.signal,
    onLine: (line) => {
      let event: E
      try {
        event = JSON.parse(line)
      } catch {
        request.transcript.push({ kind: 'system', text: line.slice(0, 200) })
        return
      }
      handle(event, result)
    },
  })
  if (run.spawnError) result.error = run.spawnError
  else if (request.signal?.aborted) result.error = 'stopped'
  else if (run.timedOut) result.error = `timed out after ${Math.round(request.timeoutMs / 1000)} s`
  else if (run.code !== 0)
    result.error ??= (run.stderr || run.stdout).trim().slice(-400) || `exit ${run.code}`
  result.ok = run.code === 0 && !run.timedOut
  return result
}
