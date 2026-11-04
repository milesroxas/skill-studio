/** Run a check or lint command for a pack: shell, bounded time, output tail kept. */
import { spawnSync } from 'node:child_process'

export interface CommandResult {
  exit: number | null
  stdout: string
  /** The last part of stdout and stderr, for a flag. */
  tail: string
  timedOut: boolean
}

export function runCommand(
  command: string,
  options: { cwd: string; timeoutMs: number; input?: string },
): CommandResult {
  const result = spawnSync(command, {
    shell: true,
    cwd: options.cwd,
    input: options.input,
    timeout: options.timeoutMs,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, CLAUDECODE: undefined },
  })
  // Both are undefined, despite the types, when the shell cannot start (a missing cwd).
  const stdout = result.stdout ?? ''
  const combined = `${stdout}\n${result.stderr ?? ''}`.trim()
  return {
    exit: result.status,
    stdout,
    tail: combined.length > 600 ? `…${combined.slice(-600)}` : combined,
    timedOut: result.error?.message.includes('ETIMEDOUT') ?? false,
  }
}
