/**
 * What the two CLI providers share. A signed-in CLI takes one prompt per run,
 * so a conversation goes in as a transcript, and its output is one JSON event
 * per line.
 */
import { tmpdir } from 'node:os'
import { agentEnv } from '../env.ts'
import { type ExecResult, exec } from '../exec.ts'
import type { StoredImage } from '../images.ts'
import type { AiMessage, AiRequest } from './types.ts'

const TIMEOUT_MS = 5 * 60_000
/**
 * Ask a CLI how it is signed in. The answer is in what it prints and how it
 * exits. This only reads: signing in and installing are the person's to do, in
 * their own terminal, with the CLI's own command. The app runs neither.
 */
export const cliStatus = (command: string, args: string[]): Promise<ExecResult> =>
  exec(command, args, { cwd: tmpdir(), env: agentEnv(), timeoutMs: 10_000 })

/** Every picture in the conversation, oldest first: a CLI takes them beside its one prompt. */
export const picturesOf = (messages: AiMessage[]): StoredImage[] =>
  messages.flatMap((m) => m.images ?? [])

/**
 * A message's text as the transcript holds it. Its pictures travel beside the
 * prompt, so the text says which ones came with it, counted across the
 * conversation in the order they are attached.
 */
function turnText(message: AiMessage, firstPicture: number): string {
  const count = message.images?.length ?? 0
  if (!count) return message.text
  const numbers = Array.from({ length: count }, (_, i) => firstPicture + i + 1)
  const note =
    count === 1
      ? `[Attached picture ${numbers[0]}]`
      : `[Attached pictures ${numbers[0]} to ${numbers.at(-1)}]`
  return message.text ? `${note}\n${message.text}` : note
}

/** Each message's text as the transcript holds it, in order. */
function turnTexts(messages: AiMessage[]): string[] {
  let pictures = 0
  return messages.map((m) => {
    const text = turnText(m, pictures)
    pictures += m.images?.length ?? 0
    return text
  })
}

/** Every turn but the last, tagged by role, as the context a prompt or a system prompt carries. */
const conversationSoFar = (messages: AiMessage[], texts: string[]): string =>
  `The conversation so far:\n<conversation>\n${messages
    .slice(0, -1)
    .map((m, i) => `<${m.role}>\n${texts[i]}\n</${m.role}>`)
    .join('\n')}\n</conversation>`

/** The conversation as one prompt: a lone message as it is, a longer one as a transcript. */
export function transcriptPrompt(messages: AiMessage[]): string {
  if (messages.length === 1) return messages[0].text
  const texts = turnTexts(messages)
  return `${conversationSoFar(messages, texts)}\n\nReply to this next message from the user:\n${texts.at(-1) ?? ''}`
}

/**
 * A command's run. The CLI expands `/name` only when it is the whole prompt,
 * so the last message goes in as it was typed and the earlier turns, if any,
 * become context for the system prompt.
 */
export function commandPrompt(messages: AiMessage[]): { prompt: string; context: string | null } {
  const prompt = messages.at(-1)?.text ?? ''
  if (messages.length <= 1) return { prompt, context: null }
  return { prompt, context: conversationSoFar(messages, turnTexts(messages)) }
}

/**
 * Run a CLI with the prompt on stdin, handing each JSON line it prints to
 * `onEvent`. It runs in the temp folder, so no project's settings, skills or
 * instructions load. Throws when it cannot start or exits with an error.
 */
export async function runJsonLines<E>(
  command: string,
  args: string[],
  input: string,
  request: Pick<AiRequest, 'signal'>,
  onEvent: (event: E) => void,
): Promise<void> {
  const result = await exec(command, args, {
    cwd: tmpdir(),
    env: agentEnv(),
    input,
    timeoutMs: TIMEOUT_MS,
    signal: request.signal,
    onLine: (line) => {
      let event: E
      try {
        event = JSON.parse(line)
      } catch {
        return
      }
      onEvent(event)
    },
  })
  if (request.signal.aborted) return
  if (result.spawnError) throw new Error(`Could not start ${command}: ${result.spawnError}`)
  if (result.timedOut) throw new Error(`${command} took longer than five minutes and was stopped.`)
  if (result.code !== 0) {
    const detail = result.stderr.trim().split('\n').at(-1)
    throw new Error(`${command} stopped with an error${detail ? `: ${detail}` : '.'}`)
  }
}
