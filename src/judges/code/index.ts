/**
 * The code judge pack. `bench.check` is a shell command run in the sample
 * dir; exit 0 passes. The review layer asks each grader statement over the
 * primary code file. It does not read the diff against the case's input
 * files, build the project or judge files beyond the primary one.
 */
import { runCommand } from '../shared/exec.ts'
import { askStatements, withRequest } from '../shared/questions.ts'
import type { JudgePack } from '../types.ts'
import { type CheckRaw, type CodeConfig, type CodeRaw, codeScoring } from './score.ts'

async function runCheck(command: string, dir: string, timeoutSeconds: number): Promise<CheckRaw> {
  const { exit, timedOut, tail } = await runCommand(command, {
    cwd: dir,
    timeoutMs: timeoutSeconds * 1000,
  })
  return { command, exit, timedOut, tail }
}

export const codePack: JudgePack<CodeRaw> = {
  ...codeScoring,
  label: 'Code: check command and review statements',
  artifacts: ['code'],
  async judge(input, ctx) {
    const { codeCheck } = ctx.config as CodeConfig
    const command = input.case?.bench.check
    const check = command ? await runCheck(command, input.dir, codeCheck.timeoutSeconds) : null
    const graders = input.case?.graders ?? []
    const code = input.text.slice(0, codeCheck.maxChars)
    const review =
      ctx.useJev && graders.length && code.trim()
        ? { statements: await askStatements(graders, withRequest(input, { code }), 'code', ctx) }
        : null
    if (!check && !review) return null
    return { check, review }
  },
}
