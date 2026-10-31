/**
 * The workflow judge pack: the transcript, not the output. Code counts steps,
 * tool calls, errors, repeats, time, cost, paths outside the sample and whether
 * SKILL.md was read before the first write; Jev reads a compact summary for
 * whether the task was done and whether errors changed the approach. A sample with no
 * transcript (a legacy run, an anchor) gets null.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Timing, TranscriptEvent } from '@core/schemas.ts'
import { noul } from '@typesafe-ai/sdk'
import { round } from '../shared/questions.ts'
import type { JudgeContext, JudgeInput, JudgePack } from '../types.ts'
import {
  type WorkflowConfig,
  type WorkflowJev,
  type WorkflowMetrics,
  type WorkflowRaw,
  workflowScoring,
} from './score.ts'

const WRITE_TOOLS = /^(?:write|edit|multiedit|notebookedit|create_file|str_replace|apply_patch)/i

const isWrite = (e: TranscriptEvent): boolean =>
  e.kind === 'tool' &&
  (WRITE_TOOLS.test(e.tool ?? '') ||
    (/^(?:bash|shell|run|exec)/i.test(e.tool ?? '') &&
      /(?:>|>>|\btee\b|\bcp\b|\bmv\b|\bmkdir\b|\btouch\b|cat\s*<<)/.test(e.args ?? '')))

function metricsOf(events: TranscriptEvent[], input: JudgeInput): WorkflowMetrics {
  const tools = events.filter((e) => e.kind === 'tool')
  const seen = new Set<string>()
  let retries = 0
  for (const e of tools) {
    const key = `${e.tool}\u0000${e.args ?? ''}`
    if (seen.has(key)) retries += 1
    seen.add(key)
  }
  const outside = new Set<string>()
  for (const { args = '' } of tools)
    for (const match of args.matchAll(/(?:^|[\s"'=(])(\/[\w@./-]+)/g)) {
      const path = match[1]
      // Arguments are cut at one line, so a path that stops where the line stops is unknown.
      const cut = args.endsWith('…') && match.index + match[0].length >= args.length - 1
      if (cut && input.dir.startsWith(path)) continue
      if (path.startsWith(input.dir) || /^\/(?:dev|tmp|private\/tmp|usr|bin|opt|etc)\b/.test(path))
        continue
      outside.add(path)
    }
  const timingPath = join(input.dir, 'timing.json')
  // Missing when the engine threw before the run finished.
  const timing: Timing | null = existsSync(timingPath)
    ? JSON.parse(readFileSync(timingPath, 'utf8'))
    : null
  const last = events.at(-1)?.at ?? null
  const skillRead = tools.find(
    (e) => /^skill$/i.test(e.tool ?? '') || /SKILL\.md/.test(e.args ?? ''),
  )
  const firstWrite = tools.find(isWrite)
  return {
    steps: events.filter((e) => e.kind === 'text' || e.kind === 'tool').length,
    toolCalls: tools.length,
    errors: events.filter((e) => e.error || e.kind === 'error').length,
    retries,
    seconds: timing
      ? Math.round(timing.durationMs / 1000)
      : last !== null
        ? Math.round(last / 1000)
        : null,
    costUsd: timing?.costUsd ?? null,
    outside: [...outside].slice(0, 20),
    skillReadAt: skillRead?.step ?? null,
    firstWriteAt: firstWrite?.step ?? null,
    skillPresent: existsSync(join(input.dir, '.agents/skills')),
    wroteOutput: input.artifacts.length > 0,
    maxTurns: input.case?.settings.maxTurns ?? null,
    timeoutSeconds: input.case?.settings.timeoutSeconds ?? null,
  }
}

/** One line per step, long values cut, so Jev reads the shape of the work and not its bulk. */
function summarize(events: TranscriptEvent[], maxLines: number): string {
  const lines = events
    .filter((e) => e.kind !== 'system')
    .map((e) => {
      const body =
        e.kind === 'tool'
          ? `${e.tool}: ${e.args ?? ''}`
          : e.kind === 'result'
            ? `${e.error ? 'ERROR ' : ''}result: ${e.result ?? ''}`
            : (e.text ?? '')
      return `${e.step}. ${e.kind} ${body.replace(/\s+/g, ' ').slice(0, 160)}`
    })
  if (lines.length <= maxLines) return lines.join('\n')
  const head = lines.slice(0, Math.floor(maxLines / 2))
  const tail = lines.slice(-Math.ceil(maxLines / 2))
  return [...head, `… ${lines.length - maxLines} steps left out …`, ...tail].join('\n')
}

async function judgeJev(
  summary: string,
  task: string,
  hadErrors: boolean,
  ctx: JudgeContext,
): Promise<WorkflowJev> {
  const questions = {
    followed_task: noul('Does `transcript` show the agent doing what `task` asks?', {
      true: 'The steps read the inputs the task names, produce what it asks for, and end with it done.',
      false:
        'The steps work on something else, stop before the output is produced, or produce something the task did not ask for.',
    }),
    ...(hadErrors
      ? {
          recovered: noul(
            'After a step marked ERROR in `transcript`, does the agent change what it does next?',
            {
              true: 'The step after an error uses a different tool, different arguments, or a fix for the error.',
              false: 'The step after an error repeats the same call, or the agent stops.',
            },
          ),
        }
      : {}),
  }
  const answers = await ctx.jev.ask({ task, transcript: summary }, questions)
  return {
    followedTask: round(answers.followed_task.noul),
    recovered: answers.recovered ? round(answers.recovered.noul) : null,
  }
}

export const workflowPack: JudgePack<WorkflowRaw> = {
  ...workflowScoring,
  label: 'Workflow: how the agent worked, from its transcript',
  artifacts: [],
  async judge(input, ctx) {
    const events = input.transcript
    if (!events?.length) return null
    const metrics = metricsOf(events, input)
    const { summaryLines } = (ctx.config as WorkflowConfig).workflow
    const jev = ctx.useJev
      ? await judgeJev(
          summarize(events, summaryLines),
          (input.case?.prompt ?? '').slice(0, 1500),
          metrics.errors > 0,
          ctx,
        )
      : null
    return { metrics, jev }
  },
}
