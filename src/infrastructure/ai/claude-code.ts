/**
 * Claude through Claude Code, headless: `claude -p` with no tools, no settings
 * and no skills, so it answers as a plain model on the plan the CLI is signed
 * in to. One exception: a message that starts with `/name` is a command, and
 * runs with the user's own settings loaded so the CLI expands the skill as it
 * would in a terminal. A field's shape goes in as `--json-schema`; the reply
 * then arrives as the input of its StructuredOutput tool, streamed the same as
 * prose. Pictures cannot ride in a plain prompt, so a request with any goes in
 * as one `stream-json` user message: the pictures, then the prompt.
 *
 * The adapter only runs the CLI as Anthropic publishes it, on whatever
 * account the person signed it in to. It reads how the CLI is signed in
 * (`claude auth status`) and nothing more: it never installs the CLI, never
 * starts its sign-in, and never reads a token. Those are the person's, in
 * their own terminal.
 */
import { CLAUDE_CODE_MODELS, type CliAccount } from '@domain/ai.ts'
import { isCommand } from '@domain/commands.ts'
import { hasCommand } from '../exec.ts'
import { imageBase64 } from '../images.ts'
import { cliStatus, commandPrompt, picturesOf, runJsonLines, transcriptPrompt } from './cli.ts'
import { listClaudeCommands } from './commands.ts'
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

/**
 * Above this many bytes the brief goes on stdin, not as an argument: Linux caps
 * one argument at 128 KiB and Windows a whole command line at 32 K characters,
 * and a brief with the whole skill in it can pass either.
 */
const ARGV_BRIEF_LIMIT = 24 * 1024

/** The one-line system prompt that stands in when the brief itself leads the prompt. */
const BRIEF_IN_PROMPT =
  'The first block of the prompt, between <system> and </system>, is your system prompt. Follow it as such; the request follows it.'

/**
 * Where the brief rides: as the `--system-prompt` argument when it is small,
 * else as the first block of the prompt. A command (`/name`) is expanded by the
 * CLI only when it is the whole prompt, so its brief stays an argument whatever
 * its size. On Windows a command line cannot carry a line break at all, so there
 * the brief always leads the prompt.
 */
export function placeBrief(
  brief: string,
  prompt: string,
  command: boolean,
  platform: NodeJS.Platform = process.platform,
): { systemPrompt: string; prompt: string } {
  const inline =
    !command && (platform === 'win32' || Buffer.byteLength(brief, 'utf8') > ARGV_BRIEF_LIMIT)
  if (!inline) return { systemPrompt: brief, prompt }
  return { systemPrompt: BRIEF_IN_PROMPT, prompt: `<system>\n${brief}\n</system>\n\n${prompt}` }
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
  const command = isCommand(request.messages.at(-1)?.text ?? '')
  const { prompt: typed, context } = command
    ? commandPrompt(request.messages)
    : { prompt: transcriptPrompt(request.messages), context: null }
  const { systemPrompt, prompt } = placeBrief(
    context ? `${request.system}\n\n${context}` : request.system,
    typed || (pictures.length ? 'See the attached pictures.' : ''),
    command,
  )
  const args = [
    '-p',
    ...(pictures.length ? ['--input-format', 'stream-json'] : []),
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--no-session-persistence',
    '--strict-mcp-config',
    // A command needs the user's skills; anything else runs as a plain model.
    ...(command
      ? ['--setting-sources', 'user']
      : ['--disable-slash-commands', '--setting-sources', '']),
    '--tools',
    '',
    '--system-prompt',
    systemPrompt,
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
    pictures.length ? pictureMessage(prompt, pictures) : prompt,
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

/**
 * The account in what `claude auth status --json` prints; null when it prints
 * something else. A login to claude.ai, or a token made from one, writes on
 * the plan; a key in the environment bills an API account instead.
 */
export function claudeAccountOf(stdout: string): CliAccount | null {
  let status: {
    loggedIn?: unknown
    email?: unknown
    authMethod?: unknown
    subscriptionType?: unknown
  }
  try {
    status = JSON.parse(stdout)
  } catch {
    return null
  }
  if (typeof status?.loggedIn !== 'boolean') return null
  const text = (value: unknown): string | null =>
    typeof value === 'string' && value ? value : null
  const method = text(status.authMethod)
  return {
    signedIn: status.loggedIn,
    email: text(status.email),
    billing:
      method === 'claude.ai' || method === 'oauth_token'
        ? 'plan'
        : method === 'api_key'
          ? 'key'
          : null,
    plan: text(status.subscriptionType),
  }
}

/** Who the CLI is signed in as. A CLI too old to say counts as unknown, not as signed out. */
const account = async (): Promise<CliAccount | null> =>
  // Signed out, it prints the same JSON and exits 1.
  claudeAccountOf((await cliStatus('claude', ['auth', 'status', '--json'])).stdout)

export const claudeCodeProvider: AiProvider = {
  id: 'claude-code',
  connected: () => hasCommand('claude'),
  models: async () => [...CLAUDE_CODE_MODELS],
  run,
  commands: listClaudeCommands,
  // The guide's one-line installer is a bash script, for macOS and Linux.
  installable: process.platform !== 'win32',
  account,
}
