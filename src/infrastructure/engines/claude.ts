/**
 * Claude Code, headless: `claude -p` in the sample directory with the prompt
 * on stdin and `stream-json` on stdout. Only project settings load, so the
 * machine's own skills, CLAUDE.md and MCP servers stay out of the benchmark.
 */
import { type ClaudeUsage, claudePrintArgs, claudeTokens } from '../claude-cli.ts'
import { agentEnv } from '../env.ts'
import { hasCommand } from '../exec.ts'
import { chosen, type ResultEvent, readInit, readResult, runStreamJson } from './stream.ts'
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
  usage?: ClaudeUsage
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
    if (event.usage) result.tokens = claudeTokens(event.usage)
    readResult(event, request, result)
  }
}

const MODELS = ['sonnet', 'opus', 'haiku', 'fable', 'default']

/**
 * A model the CLI can be handed. It takes its own names (`sonnet`,
 * `opusplan`), full ids (`claude-opus-5-5[1m]`) and the ids of Bedrock and
 * Vertex (`us.anthropic.claude-…`, `claude-…@20250101`), and says itself when
 * it knows no such model. The check is that the name goes in as one argument
 * and nothing else: letters, digits and `. _ - : @ [ ] /`, 120 at most,
 * starting with a letter or a digit so it never reads as a flag. On Windows
 * the cmd.exe escaping in `exec` still applies on top.
 */
const isModel = (model: string): boolean => /^[A-Za-z0-9][\w.:@[\]/-]{0,119}$/.test(model)

export const claudeEngine: Engine = {
  id: 'claude',
  label: 'Claude Code',
  harness: 'agent',
  efforts: ['default', 'low', 'medium', 'high', 'xhigh', 'max'],
  defaultModel: 'sonnet',
  hint: 'Install Claude Code and log in: the tool runs `claude -p` in each sample directory.',
  available: () => hasCommand('claude'),
  models: async () => MODELS,
  async run(request) {
    const choice = chosen(claudeEngine, request, isModel)
    if ('refusal' in choice) return choice.refusal
    const args = claudePrintArgs(
      '--setting-sources',
      'project',
      '--permission-mode',
      'acceptEdits',
      '--allowedTools',
      (request.allowedTools ?? DEFAULT_TOOLS).join(','),
      ...(choice.model ? ['--model', choice.model] : []),
      ...(choice.effort ? ['--effort', choice.effort] : []),
    )
    return runStreamJson<StreamEvent>(
      'claude',
      args,
      request,
      (event, result) => handle(event, request, result),
      { env: agentEnv(), input: request.prompt },
    )
  },
}
