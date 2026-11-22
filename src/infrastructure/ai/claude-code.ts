/**
 * Claude through Claude Code, headless: `claude -p` with no tools, no settings
 * and no skills, so it answers as a plain model on the plan the CLI is signed
 * in to. One exception: a message that starts with `/name` is a command, and
 * runs with the user's own settings loaded so the CLI expands the skill as it
 * would in a terminal. A field's shape goes in as `--json-schema`; the reply
 * then arrives as the input of its StructuredOutput tool, streamed the same as
 * prose, and the model's thinking as a summary beside it. Pictures cannot ride in a plain prompt, so a request with any goes in
 * as one `stream-json` user message: the pictures, then the prompt.
 *
 * A second kind of run reads one folder (`readFolder`): it is started there
 * with the tools that read and no other, and is refused every path outside it.
 *
 * The adapter only runs the CLI as Anthropic publishes it, on whatever
 * account the person signed it in to. It reads how the CLI is signed in
 * (`claude auth status`) and nothing more: it never installs the CLI, never
 * starts its sign-in, and never reads a token. Those are the person's, in
 * their own terminal.
 */
import { AI_PROVIDERS, CLAUDE_CODE_MODELS, type CliAccount } from '@domain/ai.ts'
import { isCommand } from '@domain/commands.ts'
import { type ClaudeUsage, claudePrintArgs, claudeTokens } from '../claude-cli.ts'
import { hasCommand, resolveCommand } from '../exec.ts'
import { imageBase64 } from '../images.ts'
import { cliStatus, commandPrompt, picturesOf, runJsonLines, transcriptPrompt } from './cli.ts'
import { listClaudeCommands } from './commands.ts'
import {
  type AiFolderRequest,
  type AiProvider,
  type AiReply,
  type AiRequest,
  systemText,
} from './types.ts'

interface StreamEvent {
  type: string
  subtype?: string
  model?: string
  event?: {
    type: string
    delta?: { type: string; text?: string; partial_json?: string; thinking?: string }
  }
  is_error?: boolean
  result?: string
  structured_output?: unknown
  usage?: ClaudeUsage | null
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

const provider = AI_PROVIDERS['claude-code']
/** Claude Code's install guide, as Settings links it on Windows, where its one-line installer does not run. */
const SETUP_GUIDE =
  provider.via === 'cli' ? provider.install : 'https://code.claude.com/docs/en/setup'

/**
 * Why a `/name` command cannot run here, or null when it can. Its brief rides
 * as an argument, and has line breaks; an npm install of the CLI on Windows is
 * a `.cmd` script, which cmd.exe starts, and a cmd.exe command line ends at the
 * first line break. The native install is a program and takes the argument whole.
 */
export function commandProblem(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (platform !== 'win32') return null
  const found = resolveCommand('claude', env, platform)
  if (!found || !/\.(cmd|bat)$/i.test(found)) return null
  return `On Windows, /name commands need the native Claude Code install: the npm one cannot take a command's instructions. Install it from ${SETUP_GUIDE}, then try again. Messages without a command work as they are.`
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
  const problem = command ? commandProblem() : null
  if (problem) throw new Error(problem)
  const { prompt: typed, context } = command
    ? commandPrompt(request.messages)
    : { prompt: transcriptPrompt(request.messages), context: null }
  const { systemPrompt, prompt } = placeBrief(
    context ? `${systemText(request)}\n\n${context}` : systemText(request),
    typed || (pictures.length ? 'See the attached pictures.' : ''),
    command,
  )
  const args = claudePrintArgs(
    ...(pictures.length ? ['--input-format', 'stream-json'] : []),
    '--include-partial-messages',
    // Without it the CLI streams the model's thinking as empty blocks.
    '--thinking-display',
    'summarized',
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
  )
  // With a schema the reply is the tool's JSON input; without one it is the text.
  const wanted = request.schema ? 'input_json_delta' : 'text_delta'
  let text = ''
  let thinking = ''
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
        if (event.event?.type !== 'content_block_delta') return
        if (delta?.type === 'thinking_delta' && delta.thinking) {
          thinking += delta.thinking
          request.onThinking?.(thinking)
        }
        if (delta?.type !== wanted) return
        text += delta.text ?? delta.partial_json ?? ''
        request.onText(text)
      } else if (event.type === 'result') {
        finished = true
        failure = closeReply(reply, event, Boolean(request.schema), text)
      }
    },
  )
  return ended(reply, failure, finished, request.signal)
}

/**
 * Take a run's closing event into `reply`: its text, or its structured
 * output as JSON, and what it spent. Returns why the run failed, or null.
 */
function closeReply(
  reply: AiReply,
  event: StreamEvent,
  structured: boolean,
  streamed: string,
): string | null {
  reply.text = structured
    ? JSON.stringify(event.structured_output ?? null)
    : (event.result ?? streamed)
  // A result can carry `usage: null`: no tokens counted, not a failed reply.
  reply.usage = claudeTokens(event.usage ?? undefined)
  return event.is_error || event.subtype !== 'success'
    ? event.result || 'Claude Code could not finish the reply.'
    : null
}

/** The reply of a run that has ended, or the error it ended with. */
function ended(
  reply: AiReply,
  failure: string | null,
  finished: boolean,
  signal: AbortSignal,
): AiReply {
  if (failure) throw new Error(failure)
  if (!finished && !signal.aborted)
    throw new Error(
      'Claude Code ended without a reply. Run `claude` once to check it is signed in.',
    )
  return reply
}

/** A session that reads a folder opens many files, so it gets longer than a reply does. */
const FOLDER_TIMEOUT_MS = 20 * 60_000

/** The tools a session that reads a folder gets. None writes, runs a command or reaches the network. */
const READ_TOOLS = 'Read,Glob,Grep'

/**
 * The arguments of a session that reads `dir` and nothing else. It has only
 * the tools that read, no settings and no skills, and asks nobody for
 * anything (`dontAsk`): a read the one rule here does not allow is refused.
 * That rule allows the folder it is started in, so a path that leads out of
 * it, by `..` or by its full name, is refused too. Checked live on 2026-11-20:
 * a file beside the folder and `/etc/hosts` were both refused to Read and Grep.
 */
export function folderArgs(
  request: Pick<AiFolderRequest, 'dir' | 'model' | 'effort' | 'schema'>,
  systemPrompt: string,
): string[] {
  const dir = request.dir.replace(/\\/g, '/').replace(/^\/+/, '')
  return claudePrintArgs(
    '--disable-slash-commands',
    '--setting-sources',
    '',
    '--tools',
    READ_TOOLS,
    '--permission-mode',
    'dontAsk',
    '--allowedTools',
    `Read(//${dir}/**)`,
    '--system-prompt',
    systemPrompt,
    '--model',
    request.model,
    ...(request.effort ? ['--effort', request.effort] : []),
    '--json-schema',
    JSON.stringify(request.schema),
  )
}

async function readFolder(request: AiFolderRequest): Promise<AiReply> {
  const { systemPrompt, prompt } = placeBrief(request.system, request.prompt, false)
  const reply: AiReply = { text: '', model: request.model, usage: { input: 0, output: 0 } }
  let failure: string | null = null
  let finished = false
  await runJsonLines<StreamEvent>(
    'claude',
    folderArgs(request, systemPrompt),
    prompt,
    request,
    (event) => {
      if (event.type === 'system' && event.subtype === 'init' && event.model)
        reply.model = event.model
      else if (event.type === 'result') {
        finished = true
        failure = closeReply(reply, event, true, '')
      }
    },
    { cwd: request.dir, timeoutMs: FOLDER_TIMEOUT_MS },
  )
  return ended(reply, failure, finished, request.signal)
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
  readFolder,
  commands: listClaudeCommands,
  // The guide's one-line installer is a bash script, for macOS and Linux.
  installable: process.platform !== 'win32',
  account,
}
