import { exec } from '../exec.ts'
import { jsonLine } from '../json-lines.ts'
import type { Engine, EngineRequest, EngineResult } from './types.ts'

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

/** A run that ended before it began, with the reason as its error and in the transcript. */
function refused(request: EngineRequest, error: string): EngineResult {
  request.transcript.push({ kind: 'error', text: error, error: true })
  return { ok: false, error, costUsd: null, tokens: null, model: null, finalText: null }
}

/**
 * The model and effort a request asks for, once the engine has said it takes
 * them; `default` and nothing both read as null. They become arguments of a
 * command, so a name the engine does not know never reaches one: `known` says
 * whether a model is one of the engine's, and the efforts are its own list.
 */
export function chosen(
  engine: Pick<Engine, 'label' | 'efforts'>,
  request: EngineRequest,
  known: (model: string) => boolean,
): { model: string | null; effort: string | null } | { refusal: EngineResult } {
  const model = request.model && request.model !== 'default' ? request.model : null
  const effort = request.effort && request.effort !== 'default' ? request.effort : null
  if (model && !known(model))
    return { refusal: refused(request, `${engine.label} has no model named "${model}".`) }
  if (effort && !engine.efforts.includes(effort))
    return { refusal: refused(request, `${engine.label} has no effort named "${effort}".`) }
  return { model, effort }
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
      const event = jsonLine(line)
      if (event) handle(event as E, result)
      else request.transcript.push({ kind: 'system', text: line.slice(0, 200) })
    },
  })
  if (request.transcript.failure)
    request.log?.(`the transcript could not be written: ${request.transcript.failure}`)
  if (run.spawnError) result.error = run.spawnError
  else if (request.signal?.aborted) result.error = 'stopped'
  else if (run.timedOut) result.error = `timed out after ${Math.round(request.timeoutMs / 1000)} s`
  else if (run.code !== 0)
    result.error ??= (run.stderr || run.stdout).trim().slice(-400) || `exit ${run.code}`
  result.ok = run.code === 0 && !run.timedOut
  return result
}
