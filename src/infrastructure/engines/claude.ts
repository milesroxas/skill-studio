/**
 * Claude Code, headless: `claude -p` in the sample directory with the prompt
 * on stdin and `stream-json` on stdout. Only project settings load, so the
 * machine's own skills, CLAUDE.md and MCP servers stay out of the benchmark.
 */
import { agentEnv } from '../env.ts'
import { hasCommand } from '../exec.ts'
import { type ResultEvent, readInit, readResult, runStreamJson } from './stream.ts'
import type { Engine, EngineRequest, EngineResult } from './types.ts'

const DEFAULT_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash']

interface ContentBlock {
  type: string
  text?: string
  thinking?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: unknown
  is_error?: boolean
}

interface StreamEvent extends ResultEvent {
  model?: string
  message?: { content?: ContentBlock[] | string }
  total_cost_usd?: number
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
}

function handle(event: StreamEvent, request: EngineRequest, result: EngineResult): void {
  const { transcript } = request
  if (readInit(event, 'claude', request, result)) return
  const blocks = Array.isArray(event.message?.content) ? event.message.content : []
  if (event.type === 'assistant') {
    for (const block of blocks) {
      if (block.type === 'text' && block.text) {
        transcript.text('text', block.text)
        result.finalText = block.text
      } else if (block.type === 'thinking' && block.thinking)
        transcript.text('thinking', block.thinking)
      else if (block.type === 'tool_use' && block.id)
        transcript.toolStart(block.id, block.name ?? 'tool', block.input)
    }
    return
  }
  if (event.type === 'user') {
    for (const block of blocks)
      if (block.type === 'tool_result' && block.tool_use_id)
        transcript.toolEnd(block.tool_use_id, block.content, Boolean(block.is_error))
    return
  }
  if (event.type === 'result') {
    result.costUsd = event.total_cost_usd ?? null
    if (event.usage)
      result.tokens = {
        input:
          (event.usage.input_tokens ?? 0) +
          (event.usage.cache_read_input_tokens ?? 0) +
          (event.usage.cache_creation_input_tokens ?? 0),
        output: event.usage.output_tokens ?? 0,
      }
    readResult(event, request, result)
  }
}

export const claudeEngine: Engine = {
  id: 'claude',
  label: 'Claude Code',
  harness: 'agent',
  efforts: ['default', 'low', 'medium', 'high', 'xhigh', 'max'],
  defaultModel: 'sonnet',
  hint: 'Install Claude Code and log in: the tool runs `claude -p` in each sample directory.',
  available: () => hasCommand('claude'),
  models: async () => ['sonnet', 'opus', 'haiku', 'fable', 'default'],
  run(request) {
    const args = [
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
      (request.allowedTools ?? DEFAULT_TOOLS).join(','),
      ...(request.model && request.model !== 'default' ? ['--model', request.model] : []),
      ...(request.effort && request.effort !== 'default' ? ['--effort', request.effort] : []),
    ]
    return runStreamJson<StreamEvent>(
      'claude',
      args,
      request,
      (event, result) => handle(event, request, result),
      { env: agentEnv(), input: request.prompt },
    )
  },
}
