/**
 * Cursor's agent CLI, headless: `cursor-agent -p --output-format stream-json`
 * in the sample directory. Tool calls arrive as `tool_call` events whose one
 * key names the tool (`readToolCall`, `shellToolCall`...), so the parser reads
 * the key rather than a fixed list.
 */

import { tmpdir } from 'node:os'
import { agentEnv } from '../env.ts'
import { exec, hasCommand } from '../exec.ts'
import { chosen, type ResultEvent, readInit, readResult, runStreamJson } from './stream.ts'
import type { Engine, EngineRequest, EngineResult } from './types.ts'

interface ToolCallBody {
  args?: unknown
  result?: unknown
}

interface StreamEvent extends ResultEvent {
  model?: string
  text?: string
  message?: { content?: Array<{ type: string; text?: string }> }
  call_id?: string
  tool_call?: Record<string, ToolCallBody>
}

const toolName = (key: string): string => key.replace(/ToolCall$/, '').replace(/_/g, ' ')

function handle(
  event: StreamEvent,
  request: EngineRequest,
  result: EngineResult,
  thinking: { text: string },
): void {
  const { transcript } = request
  if (readInit(event, 'cursor-agent', request, result)) return
  if (event.type === 'thinking') {
    if (event.subtype === 'completed') {
      transcript.text('thinking', thinking.text || event.text || '')
      thinking.text = ''
    } else thinking.text += event.text ?? ''
    return
  }
  if (event.type === 'assistant') {
    for (const block of event.message?.content ?? [])
      if (block.type === 'text' && block.text) {
        transcript.text('text', block.text)
        result.finalText = block.text
      }
    return
  }
  if (event.type === 'tool_call' && event.tool_call && event.call_id) {
    const key = Object.keys(event.tool_call)[0]
    if (!key) return
    const body = event.tool_call[key] ?? {}
    if (event.subtype === 'started') transcript.toolStart(event.call_id, toolName(key), body.args)
    else if (event.subtype === 'completed') {
      const outcome =
        body.result && typeof body.result === 'object'
          ? (body.result as Record<string, unknown>)
          : null
      const failed = Boolean(outcome && ('error' in outcome || 'rejected' in outcome))
      transcript.toolEnd(event.call_id, outcome ? Object.values(outcome)[0] : body.result, failed)
    }
    return
  }
  if (event.type === 'result') readResult(event, request, result)
}

/** The shape of a model id as the CLI lists them, parameters in brackets included. */
const MODEL_ID = /^\w[\w.[\]=,-]*$/

/** The models the CLI listed, once it has listed any. */
let models: string[] | null = null
/** A read under way: at most one runs at a time. */
let reading: Promise<void> | null = null
/** When the CLI last listed none: signed out, or it failed. It is asked again after a while. */
let emptyAt = 0
const RETRY_MS = 30_000

/** Ask the CLI for its models: none when it fails, is signed out or does not answer in time. */
async function listModels(): Promise<string[]> {
  const run = await exec('cursor-agent', ['--list-models'], {
    cwd: tmpdir(),
    env: agentEnv(),
    timeoutMs: 8000,
  }).catch(() => null)
  if (run?.code !== 0) return []
  return run.stdout
    .split('\n')
    .map((line) => line.trim().split(/\s+/)[0])
    .filter((id) => MODEL_ID.test(id) && !/^(?:usage|error|available|models?)$/i.test(id))
}

export const cursorEngine: Engine = {
  id: 'cursor',
  label: 'Cursor agent',
  harness: 'agent',
  efforts: ['default', 'low', 'medium', 'high'],
  defaultModel: 'auto',
  hint: 'Install the Cursor CLI (cursor-agent) and run `cursor-agent login`, or set CURSOR_API_KEY in .env.',
  available: () => hasCommand('cursor-agent'),
  /**
   * What the CLI has listed, at once: asking it takes seconds, and every load
   * of a skill's state asks. Until it has listed some, the list is read again
   * in the background, one read at a time and at most every thirty seconds,
   * and the models show from the next ask after it.
   */
  models() {
    if (models) return Promise.resolve(models)
    if (!reading && Date.now() - emptyAt >= RETRY_MS)
      reading = listModels()
        .then((found) => {
          // Only a list with something in it is kept: an empty one may be a login away from full.
          if (found.length) models = found
          else emptyAt = Date.now()
        })
        .finally(() => {
          reading = null
        })
    return Promise.resolve([])
  },
  async run(request) {
    // The CLI's own list decides when there is one; without it, the shape of an id does.
    const listed = models
    const choice = chosen(
      cursorEngine,
      request,
      (model) =>
        model === cursorEngine.defaultModel ||
        (listed ? listed.includes(model) : MODEL_ID.test(model)),
    )
    if ('refusal' in choice) return choice.refusal
    const model =
      choice.model && choice.effort ? `${choice.model}[effort=${choice.effort}]` : choice.model
    const args = [
      '-p',
      '--output-format',
      'stream-json',
      '--force',
      '--trust',
      ...(model ? ['--model', model] : []),
      request.prompt,
    ]
    const thinking = { text: '' }
    return runStreamJson<StreamEvent>(
      'cursor-agent',
      args,
      request,
      (event, result) => handle(event, request, result, thinking),
      { env: agentEnv() },
    )
  },
}
