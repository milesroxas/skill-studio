/**
 * Cursor's agent CLI, headless: `cursor-agent -p --output-format stream-json`
 * in the sample directory. Tool calls arrive as `tool_call` events whose one
 * key names the tool (`readToolCall`, `shellToolCall`...), so the parser reads
 * the key rather than a fixed list.
 */
import { hasCommand, tryCommand } from '../exec.ts'
import { type ResultEvent, readResult, runStreamJson } from './stream.ts'
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
  if (event.type === 'system' && event.subtype === 'init') {
    result.model = event.model ?? null
    transcript.push({ kind: 'system', text: `cursor-agent ${event.model ?? ''}`.trim() })
    return
  }
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

let models: string[] | null = null

export const cursorEngine: Engine = {
  id: 'cursor',
  label: 'Cursor agent',
  harness: 'agent',
  efforts: ['default', 'low', 'medium', 'high'],
  defaultModel: 'auto',
  hint: 'Install the Cursor CLI (cursor-agent) and run `cursor-agent login`, or set CURSOR_API_KEY in .env.',
  available: () => hasCommand('cursor-agent'),
  async models() {
    if (models) return models
    const out = tryCommand('cursor-agent', ['--list-models'])
    models = (out ?? '')
      .split('\n')
      .map((line) => line.trim().split(/\s+/)[0])
      .filter((id) => /^[\w.[\]=,-]+$/.test(id) && !/^(?:usage|error|models?)$/i.test(id))
    return models
  },
  run(request) {
    const model =
      request.model && request.model !== 'default'
        ? request.effort && request.effort !== 'default'
          ? `${request.model}[effort=${request.effort}]`
          : request.model
        : null
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
    return runStreamJson<StreamEvent>('cursor-agent', args, request, (event, result) =>
      handle(event, request, result, thinking),
    )
  },
}
