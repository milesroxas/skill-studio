/**
 * Run a case's check command for the code pack. Judges import nothing but the
 * domain, so they start no process themselves: whoever grades puts a runner on
 * the context (`JudgeContext.run`), which runs the line in a shell for a
 * bounded time, in the background, and ends it when the grading is stopped.
 */
import type { CommandResult, JudgeContext } from '../types.ts'

export function runCommand(
  ctx: Pick<JudgeContext, 'run'>,
  command: string,
  options: { cwd: string; timeoutMs: number; input?: string },
): Promise<CommandResult> {
  if (!ctx.run) return Promise.reject(new Error('This grading was given no way to run a command.'))
  return ctx.run(command, options)
}
