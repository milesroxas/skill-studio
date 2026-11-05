/**
 * OpenAI's models through the Codex CLI, headless: `codex exec` in a read-only
 * sandbox, on the ChatGPT plan the CLI is signed in to. Codex takes no system
 * prompt, so the brief leads the prompt; a field's shape goes in as a schema
 * file, and pictures as `--image` files. It reports each message whole, so the
 * reply appears at once, not word by word.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CODEX_DEFAULT_MODEL, CODEX_MODELS } from '@domain/ai.ts'
import { hasCommand } from '../exec.ts'
import { picturesOf, runJsonLines, transcriptPrompt } from './cli.ts'
import type { AiProvider, AiReply, AiRequest } from './types.ts'

interface CodexEvent {
  type: string
  message?: string
  error?: { message?: string }
  item?: { type?: string; text?: string }
  usage?: { input_tokens?: number; output_tokens?: number }
}

async function run(request: AiRequest): Promise<AiReply> {
  const scratch = mkdtempSync(join(tmpdir(), 'skill-studio-codex-'))
  try {
    const schema = join(scratch, 'schema.json')
    if (request.schema) writeFileSync(schema, JSON.stringify(request.schema))
    const args = [
      'exec',
      // Each ahead of another flag: `--image` takes every bare word after it as one more file.
      ...picturesOf(request.messages).flatMap((image) => ['--image', image.path]),
      '--json',
      '--skip-git-repo-check',
      '--sandbox',
      'read-only',
      ...(request.model === CODEX_DEFAULT_MODEL ? [] : ['--model', request.model]),
      ...(request.effort ? ['--config', `model_reasoning_effort="${request.effort}"`] : []),
      ...(request.schema ? ['--output-schema', schema] : []),
      '-',
    ]
    const reply: AiReply = { text: '', model: request.model, usage: { input: 0, output: 0 } }
    let failure: string | null = null
    await runJsonLines<CodexEvent>(
      'codex',
      args,
      `${request.system}\n\n${transcriptPrompt(request.messages)}`,
      request,
      (event) => {
        if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
          reply.text = event.item.text ?? ''
          request.onText(reply.text)
        } else if (event.type === 'turn.completed')
          reply.usage = {
            input: event.usage?.input_tokens ?? 0,
            output: event.usage?.output_tokens ?? 0,
          }
        else if (event.type === 'turn.failed' || event.type === 'error')
          failure = event.error?.message ?? event.message ?? 'Codex could not finish the reply.'
      },
    )
    if (failure) throw new Error(failure)
    if (!reply.text && !request.signal.aborted)
      throw new Error('Codex ended without a reply. Run `codex` once to check it is signed in.')
    return reply
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

export const codexProvider: AiProvider = {
  id: 'codex',
  connected: () => hasCommand('codex'),
  models: async () => [...CODEX_MODELS],
  run,
}
