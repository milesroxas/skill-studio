/**
 * Run a check or lint command for a pack: shell, bounded time, output tail
 * kept. It runs in the background, so a check that takes two minutes never
 * holds the backend's event loop, and a job's log keeps moving while it runs.
 * Judges may import nothing but the domain, so this does not share
 * `infrastructure/exec.ts`; it ends a slow process the same way.
 */

import { spawn } from 'node:child_process'
import { agentEnv } from '@domain/env.ts'

export interface CommandResult {
  exit: number | null
  stdout: string
  /** The last part of stdout and stderr, for a flag. */
  tail: string
  timedOut: boolean
}

/** Output beyond this is dropped, so a command that prints without end cannot fill memory. */
const MAX_OUTPUT = 16 * 1024 * 1024
/** How long a process gets after SIGTERM before SIGKILL. */
const GRACE_MS = 5000

export function runCommand(
  command: string,
  options: { cwd: string; timeoutMs: number; input?: string },
): Promise<CommandResult> {
  return new Promise((done) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let spawnError: string | null = null
    const child = spawn(command, {
      shell: true,
      cwd: options.cwd,
      // The app's own keys stay out: a check command runs what the skill's author wrote.
      env: agentEnv(process.env),
    })
    const timer = setTimeout(() => {
      timedOut = true
      const kill = setTimeout(() => child.kill('SIGKILL'), GRACE_MS)
      kill.unref()
      child.once('exit', () => clearTimeout(kill))
      child.kill('SIGTERM')
    }, options.timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_OUTPUT) stderr += chunk.toString()
    })
    child.on('error', (error) => {
      // The shell could not start (a missing cwd): there is no exit to wait for.
      spawnError = error.message
      if (child.pid === undefined) finish(null)
    })
    child.on('close', (code) => finish(code))
    // EPIPE when the child exits before reading stdin; its exit code reports the failure.
    child.stdin.on('error', () => {})
    child.stdin.end(options.input)

    let finished = false
    function finish(code: number | null): void {
      if (finished) return
      finished = true
      clearTimeout(timer)
      const combined = `${stdout}\n${stderr}${spawnError ? `\n${spawnError}` : ''}`.trim()
      done({
        exit: code,
        stdout,
        tail: combined.length > 600 ? `…${combined.slice(-600)}` : combined,
        timedOut,
      })
    }
  })
}
