/**
 * Claude through Claude Code, headless: `claude -p` with no tools, no settings
 * and no skills, so it answers as a plain model on the plan the CLI is signed
 * in to. A field's shape goes in as `--json-schema`; the reply then arrives as
 * the input of its StructuredOutput tool, streamed the same as prose. Pictures
 * cannot ride in a plain prompt, so a request with any goes in as one
 * `stream-json` user message: the pictures, then the prompt.
 */
import { CLAUDE_CODE_MODELS } from '@domain/ai.ts'
import { hasCommand } from '../exec.ts'
import { imageBase64 } from '../images.ts'
import { picturesOf, runJsonLines, transcriptPrompt } from './cli.ts'
import type { AiProvider, AiReply, AiRequest } from './types.ts'

interface StreamEvent {
  type: string
  subtype?: string
  model?: string
  event?: {
    type: string
    delta?: { type: string; text?: string; partial_json?: string }
  }
  is_error?: boolean
  result?: string
  structured_output?: unknown
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
}

/** The prompt and its pictures as the one line of JSON `--input-format stream-json` reads. */
const pictureMessage = (prompt: string, pictures: ReturnType<typeof picturesOf>): string =>
  `${JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: [
        ...pictures.map((image) => ({
          type: 'image',
          source: { type: 'base64', media_type: image.type, data: imageBase64(image) },
        })),
        { type: 'text', text: prompt },
      ],
    },
  })}\n`

async function run(request: AiRequest): Promise<AiReply> {
  const pictures = picturesOf(request.messages)
  const prompt = transcriptPrompt(request.messages)
  const args = [
    '-p',
    ...(pictures.length ? ['--input-format', 'stream-json'] : []),
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--no-session-persistence',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--setting-sources',
    '',
    '--tools',
    '',
    '--system-prompt',
    request.system,
    '--model',
    request.model,
    ...(request.effort ? ['--effort', request.effort] : []),
    ...(request.schema ? ['--json-schema', JSON.stringify(request.schema)] : []),
  ]
  // With a schema the reply is the tool's JSON input; without one it is the text.
  const wanted = request.schema ? 'input_json_delta' : 'text_delta'
  let text = ''
  const reply: AiReply = { text: '', model: request.model, usage: { input: 0, output: 0 } }
  let failure: string | null = null
  let finished = false
  await runJsonLines<StreamEvent>(
    'claude',
    args,
    pictures.length ? pictureMessage(prompt || 'See the attached pictures.', pictures) : prompt,
    request,
    (event) => {
      if (event.type === 'system' && event.subtype === 'init' && event.model)
        reply.model = event.model
      else if (event.type === 'stream_event') {
        const delta = event.event?.delta
        if (event.event?.type !== 'content_block_delta' || delta?.type !== wanted) return
        text += delta.text ?? delta.partial_json ?? ''
        request.onText(text)
      } else if (event.type === 'result') {
        finished = true
        if (event.is_error || event.subtype !== 'success')
          failure = event.result || 'Claude Code could not finish the reply.'
        reply.text = request.schema
          ? JSON.stringify(event.structured_output ?? null)
          : (event.result ?? text)
        reply.usage = {
          input:
            (event.usage?.input_tokens ?? 0) +
            (event.usage?.cache_read_input_tokens ?? 0) +
            (event.usage?.cache_creation_input_tokens ?? 0),
          output: event.usage?.output_tokens ?? 0,
        }
      }
    },
  )
  if (failure) throw new Error(failure)
  if (!finished && !request.signal.aborted)
    throw new Error(
      'Claude Code ended without a reply. Run `claude` once to check it is signed in.',
    )
  return reply
}

export const claudeCodeProvider: AiProvider = {
  id: 'claude-code',
  connected: () => hasCommand('claude'),
  models: async () => [...CLAUDE_CODE_MODELS],
  run,
}
