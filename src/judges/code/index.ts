/**
 * The code judge pack: the case's check command (`bench.check`), a shell
 * command run in the sample dir, where exit 0 passes. It is the one thing
 * about code that code can say for sure. Whether the code follows the skill's
 * rules and meets the case's checks is the generic pack's to mark, as for any
 * other kind of output.
 */
import { runCommand } from '../shared/exec.ts'
import type { JudgeContext, JudgePack } from '../types.ts'
import { type CheckRaw, type CodeConfig, type CodeRaw, codeScoring } from './score.ts'

async function runCheck(
  ctx: JudgeContext,
  command: string,
  dir: string,
  timeoutSeconds: number,
): Promise<CheckRaw> {
  const { exit, timedOut, tail } = await runCommand(ctx, command, {
    cwd: dir,
    timeoutMs: timeoutSeconds * 1000,
  })
  return { command, exit, timedOut, tail }
}

export const codePack: JudgePack<CodeRaw> = {
  ...codeScoring,
  version: 2,
  label: 'Code: the case’s check command',
  async judge(input, ctx) {
    const { codeCheck } = ctx.config as CodeConfig
    const command = input.case?.bench.check
    if (!command) return null
    return { check: await runCheck(ctx, command, input.dir, codeCheck.timeoutSeconds) }
  },
}
