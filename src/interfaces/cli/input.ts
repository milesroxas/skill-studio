/**
 * What `st` reads from its flags, checked before anything runs, and what it
 * adds to a failure so the line names the flag that fixes it. Kept apart from
 * `st.ts`, which runs a command the moment it is loaded, so these are tested.
 */
import type { GenerateInput } from '@application/api/contract.ts'
import { parsers } from '@application/api/operations.ts'
import { CONFIGURATIONS } from '@domain/schemas.ts'
import { assertSafe } from '@infrastructure/fs.ts'

/** A whole number of one or more from a flag, or undefined when the flag was not given. */
export function countOf(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined
  const count = Number(value)
  if (!Number.isInteger(count) || count < 1)
    throw new Error(`${flag} takes a whole number, 1 or more, not "${value}".`)
  return count
}

/** A port flag's value, or undefined when it was not given. */
export function portOf(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`${flag} takes a port from 1 to 65535, not "${value}".`)
  return port
}

/** A run named on the command line: the name of its folder, never a path out of `evals/runs`. */
export function runNameOf(value: string, what: string): string {
  try {
    return assertSafe(value, 'run')
  } catch {
    throw new Error(
      `${what} takes the name of a run, as \`st report\` and the app list it, not "${value}".`,
    )
  }
}

/** The flags of `st run` that say what to generate. */
export interface RunFlags {
  engine?: string
  model?: string
  effort?: string
  cases?: string
  samples?: string
  configuration?: string
  baseline?: string
  name?: string
  note?: string
}

/**
 * The run `st run` asks for, in the shape the app's Run button sends and
 * through the same check (`skill.generate`), so the two cannot drift apart.
 */
export function generateInputOf(skill: string, flags: RunFlags): GenerateInput {
  const samples = countOf(flags.samples, '--samples') ?? 1
  if (flags.configuration !== undefined && !CONFIGURATIONS.includes(flags.configuration as never))
    throw new Error(
      `--configuration takes ${CONFIGURATIONS.join(', ')}, not "${flags.configuration}".`,
    )
  const input = parsers['skill.generate']({
    skill,
    cases: (flags.cases ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
    configs: [
      { engine: flags.engine ?? 'claude', model: flags.model ?? '', effort: flags.effort ?? '' },
    ],
    samples,
    configuration: flags.configuration ?? 'with_skill',
    baselineRun: flags.baseline === undefined ? null : runNameOf(flags.baseline, '--baseline'),
    skillName: flags.name ?? null,
    note: flags.note ?? '',
    grade: true,
  })
  // The check holds a run to the most outputs per case the app offers.
  if (input.samples !== samples) throw new Error(`--samples takes ${input.samples} at most.`)
  return input
}

/** The command that opens an address in the default browser, as `spawn` takes it. */
export function openCommand(
  platform: NodeJS.Platform,
  url: string,
): { command: string; args: string[]; verbatim: boolean } {
  if (platform === 'darwin') return { command: 'open', args: [url], verbatim: false }
  // `start` is cmd.exe's own, and takes its first quoted word as a window title.
  if (platform === 'win32')
    return { command: 'cmd', args: ['/c', 'start', '""', `"${url}"`], verbatim: true }
  return { command: 'xdg-open', args: [url], verbatim: false }
}

/** A failure a flag would fix, and the words that name the flag. */
const HINTS: ReadonlyArray<{ when: RegExp; flag: string; hint: string; drop?: RegExp }> = [
  {
    when: /TYPESAFE_API_KEY|TypeSafe key/i,
    flag: '--no-jev',
    // The app's way to add the key, which the command line has no use for.
    drop: /\s*Add the key in Settings\./,
    hint: 'Add TYPESAFE_API_KEY to .env, or pass --no-jev to grade with code checks only.',
  },
  {
    when: /changed since the last run|name (?:the |this )?version/i,
    flag: '--name',
    hint: 'Pass --name "<a name for this version>".',
  },
  { when: /old_skill needs/i, flag: '--baseline', hint: 'Pass --baseline <run>.' },
]

/**
 * A failure as the command line prints it. The functions the CLI shares with
 * the app say what went wrong in words that fit both; the flag that fixes it
 * is the CLI's to add, once.
 */
export function withHint(message: string): string {
  const hints = HINTS.filter(({ when, flag }) => when.test(message) && !message.includes(flag))
  const said = hints.reduce((text, { drop }) => (drop ? text.replace(drop, '') : text), message)
  return [said, ...hints.map(({ hint }) => hint)].join(' ')
}
