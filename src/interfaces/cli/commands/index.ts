/**
 * Every `st` command, in the order `st --help` prints them, and the help put
 * together from them. Importing this runs nothing.
 */
import { caseAdd } from './case-add.ts'
import { caseCheck } from './case-check.ts'
import { cases } from './cases.ts'
import type { Command, Flag } from './command.ts'
import { compare } from './compare.ts'
import { grade } from './grade.ts'
import { newCommand } from './new.ts'
import { open } from './open.ts'
import { propose } from './propose.ts'
import { read } from './read.ts'
import { report } from './report.ts'
import { run } from './run.ts'
import { selfTestCommand } from './self-test.ts'
import { serve } from './serve.ts'
import { sort } from './sort.ts'
import { versions } from './versions.ts'

const commands: readonly Command[] = [
  cases,
  caseAdd,
  caseCheck,
  run,
  grade,
  report,
  compare,
  read,
  sort,
  propose,
  selfTestCommand,
  versions,
  newCommand,
  serve,
  open,
]

/** Every command's flags, and `--help`: what `parseArgs` reads. */
export const OPTIONS: Readonly<Record<string, Flag>> = Object.assign(
  {},
  ...commands.map((c) => c.flags),
  { help: { type: 'boolean', short: 'h' } },
)

export const HELP = [
  'Usage: st <command> [skill-dir] [options]',
  '',
  'Commands',
  ...commands.flatMap((c) => c.help),
  '',
  'Common',
  '  --no-jev                    Grade without TypeSafe calls (code checks only).',
  '  --no-draw                   Grade without drawing each page first (run and grade draw them).',
  "  --packs <a,b>               Judge packs to run, instead of bench.json's list.",
  "  --bench <file>              A bench.json laid over the skill's for this grading.",
  '  --jev-model <id>            Jev version to judge with.',
  '  --json                      Print JSON instead of a table.',
  '  -h, --help                  This help.',
].join('\n')

/**
 * The command the positionals name, and what followed its name: the longest
 * name they start with, so `case add` is found before `case`. Null for none.
 */
export function commandOf(
  positionals: readonly string[],
): { command: Command; args: string[] } | null {
  let found: { command: Command; words: number } | null = null
  for (const command of commands) {
    const words = command.name.split(' ')
    if (words.every((word, i) => positionals[i] === word) && words.length > (found?.words ?? 0))
      found = { command, words: words.length }
  }
  return found && { command: found.command, args: positionals.slice(found.words) }
}
