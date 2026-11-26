/**
 * The loop skill (`.claude/skills/skill-studio-loop/SKILL.md`) names `st`
 * commands for an agent to type. Each one must be a command that reads every
 * flag it is given, and every flag the skill names must be in `st --help`, so
 * the skill cannot drift from the CLI.
 *
 * A command is read from code, a fenced block or an inline code span: the word
 * `st`, with `pnpm` before it or not, standing at the start or after a space,
 * and followed by more words. It runs to the end of its line or span, or to a
 * `#`, `|`, `;` or `&&`. A bare `st` with nothing after it is the command's
 * name, not a command. Its words are split on spaces, a quoted word kept whole.
 * The words that do not start with `-` name the command as `st` finds it
 * (`commandOf`). Each `--flag` must be one the command's module declares in its
 * `flags`, which is what its `run` reads, and must be in the command's help
 * lines or under "Common".
 *
 * Every `--flag` anywhere in the file, prose included, must be one `st` reads
 * and its help lists.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { commandOf, HELP, OPTIONS } from './index.ts'

const SKILL = new URL('../../../../.claude/skills/skill-studio-loop/SKILL.md', import.meta.url)

/** The text of every fenced block and inline code span. */
function codeOf(markdown: string): string[] {
  const code: string[] = []
  const prose = markdown.replace(/^```[^\n]*\n([\s\S]*?)^```/gm, (_, body: string) => {
    code.push(...body.split('\n'))
    return ''
  })
  for (const span of prose.matchAll(/`([^`\n]+)`/g)) code.push(span[1]!)
  return code
}

/** Each `st ...` or `pnpm st ...` in the code, as its words after `st`. */
function stCommandsOf(markdown: string): string[][] {
  return codeOf(markdown).flatMap((code) =>
    [...code.matchAll(/(?:^|\s)(?:pnpm\s+)?st\s+([^#|;\s][^#|;]*?)(?=\s*(?:#|\||;|&&|$))/g)].map(
      (found) => found[1]!.match(/"[^"]*"|'[^']*'|\S+/g) ?? [],
    ),
  )
}

const helpLines = HELP.split('\n')
const common = helpLines.slice(helpLines.indexOf('Common'))

/** Whether `--flag` stands as a word in these help lines. */
function lists(lines: readonly string[], flag: string): boolean {
  const word = new RegExp(`(?<![\\w-])${flag}(?![\\w-])`)
  return lines.some((line) => word.test(line))
}

/** What is wrong with one command as the skill writes it; empty when nothing is. */
function faultsOf(words: readonly string[]): string[] {
  const typed = `st ${words.join(' ')}`
  const found = commandOf(words.filter((word) => !word.startsWith('-')))
  if (!found) return [`${typed}: no such command`]
  const { command } = found
  return words
    .filter((word) => word.startsWith('--'))
    .flatMap((flag) => {
      if (!(flag.slice(2) in command.flags))
        return [`${typed}: st ${command.name} reads no ${flag}`]
      if (!lists(command.help, flag) && !lists(common, flag))
        return [`${typed}: the help of st ${command.name} lists no ${flag}`]
      return []
    })
}

/** Each `--flag` anywhere in the file that `st` does not read or its help does not list. */
function unknownFlagsOf(markdown: string): string[] {
  return (markdown.match(/(?<![\w-])--[a-z][\w-]*/g) ?? []).filter(
    (flag) => !(flag.slice(2) in OPTIONS) || !lists(helpLines, flag),
  )
}

describe('the loop skill', () => {
  const markdown = readFileSync(SKILL, 'utf8')
  const commands = stCommandsOf(markdown)

  it('names st commands, so an empty read cannot pass', () => {
    expect(commands.length).toBeGreaterThan(0)
  })

  it('names only commands, each with flags it reads and its help lists', () => {
    expect(commands.flatMap(faultsOf)).toEqual([])
  })

  it('names no flag, in code or in prose, that st --help does not list', () => {
    expect(unknownFlagsOf(markdown)).toEqual([])
  })
})

describe('reading st commands out of Markdown', () => {
  it('reads them from code spans and fences, with pnpm or without, and not from prose', () => {
    const markdown = [
      'Prose: pnpm st nope is not code, and `st` alone is no command.',
      'Run `pnpm st run <skill> --name "draft a"`, then `st compare <skill> a b`.',
      '```',
      'pnpm st open --stop   # stop it',
      'st sheet <skill> --run a | head',
      '```',
    ].join('\n')
    expect(stCommandsOf(markdown)).toEqual([
      ['open', '--stop'],
      ['sheet', '<skill>', '--run', 'a'],
      ['run', '<skill>', '--name', '"draft a"'],
      ['compare', '<skill>', 'a', 'b'],
    ])
  })

  it('finds a made-up command, with pnpm or without', () => {
    const commands = stCommandsOf('`pnpm st launch <skill>` and `st launch <skill>`')
    expect(commands.flatMap(faultsOf)).toEqual([
      'st launch <skill>: no such command',
      'st launch <skill>: no such command',
    ])
  })

  it('finds a made-up flag, and a flag that only another command reads', () => {
    expect(faultsOf(['run', '<skill>', '--fast'])).toEqual([
      'st run <skill> --fast: st run reads no --fast',
    ])
    expect(faultsOf(['compare', '<skill>', 'a', 'b', '--samples', '3'])).toEqual([
      'st compare <skill> a b --samples 3: st compare reads no --samples',
    ])
  })

  it('finds a shared flag on a command that does not read it, though the help lists it', () => {
    expect(faultsOf(['sheet', '<skill>', '--run', 'a', '--no-draw', '--no-jev'])).toEqual([
      'st sheet <skill> --run a --no-draw --no-jev: st sheet reads no --no-draw',
      'st sheet <skill> --run a --no-draw --no-jev: st sheet reads no --no-jev',
    ])
    expect(faultsOf(['run', '<skill>', '--no-draw', '--no-jev'])).toEqual([])
  })

  it('finds a made-up flag in prose and in code outside a command', () => {
    expect(unknownFlagsOf('Pass --fast to go faster, or `--artifact-kind html`.')).toEqual([
      '--fast',
      '--artifact-kind',
    ])
    expect(unknownFlagsOf('Pass --brief, or `--artifact html`.\n---')).toEqual([])
  })
})
