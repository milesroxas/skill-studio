/**
 * What the two CLI providers share. A signed-in CLI takes one prompt per run,
 * so a conversation goes in as a transcript, and its output is one JSON event
 * per line.
 */
import { tmpdir } from 'node:os'
import { agentEnv } from '../env.ts'
import { exec } from '../exec.ts'
import type { AiMessage, AiRequest } from './types.ts'

const TIMEOUT_MS = 5 * 60_000

/** The conversation as one prompt: a lone message as it is, a longer one as a transcript. */
export function transcriptPrompt(messages: AiMessage[]): string {
  if (messages.length === 1) return messages[0].text
  const turns = messages
    .slice(0, -1)
    .map((m) => `<${m.role}>\n${m.text}\n</${m.role}>`)
    .join('\n')
  return `The conversation so far:\n<conversation>\n${turns}\n</conversation>\n\nReply to this next message from the user:\n${messages.at(-1)?.text ?? ''}`
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
