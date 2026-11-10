/**
 * The workflow judge pack: the transcript, not the output. Code counts steps,
 * tool calls, errors, repeats, time, cost, paths outside the sample and whether
 * SKILL.md was read before the first write; Jev reads a compact summary for
 * whether the task was done and whether errors changed the approach. A sample with no
 * transcript (a legacy run, an anchor) gets null.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { isWithin } from '@domain/paths.ts'
import type { Timing, TranscriptEvent } from '@domain/schemas.ts'
import { noul } from '@typesafe-ai/sdk'
import { asksJev, noulOf, optionalAnswer } from '../shared/questions.ts'
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

/** Shared system locations an agent touches without reaching into anyone's files. */
const SYSTEM_DIRS = ['/dev', '/tmp', '/private/tmp', '/usr', '/bin', '/opt', '/etc']

const SHELL_TOOLS = /^(?:bash|shell|run|exec)/i
/** Tools that reach the web: a query or an address is no place on disk. */
const WEB_TOOLS = /^web/i
/**
 * Tools that look for text. The transcript keeps the folder such a call names
 * when it names one, else its pattern, so a word that could be either is read
 * as a place only when it names something on disk, which a pattern seldom does.
 */
const GREP_TOOLS = /^(?:grep|search|find|rg)/i
/** Programs whose first argument is a pattern or a script: `"/api/users"` after `grep` is text to find. */
const PATTERN_PROGRAMS = new Set('grep egrep fgrep rg ag ack sed awk gawk perl jq'.split(' '))
/** Options of those programs that give the pattern or the script, so every other word is a file. */
const PATTERN_OPTIONS = new Set(['-e', '--regexp', '--expression', '--source'])
/** Options of those programs that give a file of patterns or a script file, so every word is a file. */
const PATTERN_FILE_OPTIONS = new Set(['-f', '--file', '--from-file'])
/** Programs that read stdin only: every word they are given is text, and a redirection names their file. */
const STDIN_PROGRAMS = new Set(['tr'])
/** Words a command may open with before its program, as `if cd outputs; then …` does. */
const COMMAND_PREFIXES = new Set(
  '{ ! if then else elif do while until time command builtin'.split(' '),
)

/** A path as a tool's arguments name it, the place it resolves to, and whether the line was cut inside it. */
interface NamedPath {
  path: string
  /** Null when code cannot tell: a relative path after a `cd` to a folder it could not follow. */
  place: string | null
  cut: boolean
}

type Found = Omit<NamedPath, 'cut'>

/** A word that names a place: absolute, under the home folder, or reaching up with `..`. */
const isPathLike = (word: string): boolean =>
  /^(?:\/[\w@.~-]|~(?:\/|$)|\.\.(?:\/|$))/.test(word) || word.includes('/../')

/** A path as a place on disk: `~` is the home folder, and a relative path starts at `from`; null when that is not known. */
const placed = (path: string, from: string | null): string | null =>
  path === '~' || path.startsWith('~/')
    ? join(homedir(), path.slice(1))
    : isAbsolute(path)
      ? path
      : from === null
        ? null
        : resolve(from, path)

/**
 * Where the agent's shell is as its commands run, from one tool call to the
 * next. `cwd` is null once a `cd` went where code cannot follow (`cd "$DIR"`);
 * `previous` is what `cd -` goes back to, undefined before any `cd`.
 */
interface ShellPlace {
  cwd: string | null
  previous: string | null | undefined
  /** The folders `pushd` left, the newest last. */
  stack: Array<string | null>
}

interface ShellWord {
  text: string
  quoted: boolean
  /** The word follows `<` or `>`: a redirection's file. */
  redirect: boolean
}

/** What divides one simple command from the next: `|`, `;` and `&` as `;`, and a bracket, which opens or closes a subshell. */
type ShellMark = ';' | '(' | ')'

/** The mark a dividing character stands for: a bracket is itself, and `|`, `;` and `&` all end a command. */
const markOf = (char: string): ShellMark => (char === '(' || char === ')' ? char : ';')

/** A command line as words and the marks between commands, quotes kept together. */
function shellTokens(line: string): Array<ShellWord | ShellMark> {
  const tokens: Array<ShellWord | ShellMark> = []
  let word = ''
  let quoted = false
  let quote: string | null = null
  let redirect = false
  const end = () => {
    if (word || quoted) {
      tokens.push({ text: word, quoted, redirect })
      redirect = false
    }
    word = ''
    quoted = false
  }
  for (const char of line) {
    if (quote) {
      if (char === quote) quote = null
      else word += char
    } else if ('"\''.includes(char)) {
      quote = char
      quoted = true
    } else if ('<>'.includes(char)) {
      end()
      redirect = true
    } else if (/\s/.test(char)) end()
    else if ('|;&()'.includes(char)) {
      end()
      redirect = false
      tokens.push(markOf(char))
    } else word += char
  }
  end()
  return tokens
}

/** A `cd` target code can follow: no variable, command or glob in it, and no other user's home. */
const followable = (target: string): boolean => !/[$`*?[]|^~[^/]/.test(target)

/** A `cd` or `pushd`: where it leaves the shell, and the path its target names. */
function moved(program: string, args: ShellWord[], shell: ShellPlace): Found[] {
  const target = args.find((w) => !w.redirect && (w.text === '-' || !w.text.startsWith('-')))
  if (program === 'pushd' && !target) return []
  const from = shell.cwd
  let to: string | null
  const found: Found[] = []
  if (!target) to = homedir()
  else if (target.text === '-') {
    // `cd -` before any `cd` has nowhere to go back to, and leaves the shell where it is.
    if (shell.previous === undefined) return []
    to = shell.previous
  } else if (!followable(target.text)) to = null
  else {
    to = placed(target.text, from)
    if (isPathLike(target.text)) found.push({ path: target.text, place: to })
  }
  if (program === 'pushd') shell.stack.push(from)
  shell.previous = from
  shell.cwd = to
  return found
}

/**
 * The paths one simple command names, read from where the shell is. What a
 * pattern program is given to look for is not one, nor is a word given to a
 * program that reads stdin only; a redirection's file always is.
 */
function commandPaths(command: ShellWord[], shell: ShellPlace): Found[] {
  // `VAR=value program …`: the program is the first word that is neither an assignment nor a keyword.
  const at = command.findIndex((w) => !/^\w+=/.test(w.text) && !COMMAND_PREFIXES.has(w.text))
  const program = (command[at]?.text ?? '').split('/').at(-1) ?? ''
  if (program === 'cd' || program === 'pushd') return moved(program, command.slice(at + 1), shell)
  if (program === 'popd') {
    if (shell.stack.length) shell.cwd = shell.stack.pop() ?? null
    return []
  }
  const isText = textArguments(program)
  const found: Found[] = []
  command.forEach((word, i) => {
    // A redirection's file is a place whatever the program reads.
    if (i > at && !word.redirect && isText(word.text)) return
    // `--out=/x`, and `VAR=/x` before the program, name a place after the `=`.
    const text = word.text.replace(/^[\w-]+=/, '')
    if (isPathLike(text)) found.push({ path: text, place: placed(text, shell.cwd) })
  })
  return found
}

/**
 * Which of a program's arguments are text rather than files, asked of each in
 * order. Every word given to a program that reads stdin only is text. For a
 * pattern program the pattern or script is: the first word that is no option,
 * quoted or not, or the word an option such as `-e` gives. A file of patterns
 * given with `-f` is a file, and so is every word after the pattern.
 */
function textArguments(program: string): (word: string) => boolean {
  if (STDIN_PROGRAMS.has(program)) return () => true
  if (!PATTERN_PROGRAMS.has(program)) return () => false
  let patternSeen = false
  // What the word after an option is: the pattern itself, or a file of patterns.
  let given: 'pattern' | 'file' | null = null
  return (word) => {
    const after = given
    given = null
    if (after !== null) return after === 'pattern'
    const [option, value] = word.split(/=(.*)/s)
    if (PATTERN_OPTIONS.has(option)) {
      patternSeen = true
      if (value === undefined) given = 'pattern'
      return true
    }
    if (PATTERN_FILE_OPTIONS.has(option)) {
      patternSeen = true
      if (value === undefined) given = 'file'
      // `-f=/x` names its file after the `=`.
      return value === undefined
    }
    if (patternSeen || word.startsWith('-')) return false
    patternSeen = true
    return true
  }
}

/**
 * The paths a shell command line names, each read from the folder the shell
 * is in when it runs: a `cd` moves it for the commands after, and a subshell's
 * `cd` ends with the subshell.
 */
function shellPaths(line: string, shell: ShellPlace): Found[] {
  const found: Found[] = []
  const outer: ShellPlace[] = []
  let command: ShellWord[] = []
  const run = () => {
    if (command.length) found.push(...commandPaths(command, shell))
    command = []
  }
  for (const token of shellTokens(line)) {
    if (typeof token !== 'string') {
      command.push(token)
      continue
    }
    run()
    if (token === '(') outer.push({ ...shell, stack: [...shell.stack] })
    else if (token === ')') {
      const back = outer.pop()
      if (back) Object.assign(shell, back)
    }
  }
  run()
  return found
}

/**
 * The paths one tool call names. A shell command is read word by word, from
 * where the shell is. A web tool's argument is no place. A search tool's
 * argument is its folder when the call named one and its pattern when not,
 * so it counts only when it names something on disk. Any other tool's
 * argument is one path, as the transcript keeps it, or JSON in which every
 * quoted path counts.
 */
function pathsIn(tool: string, args: string, dir: string, shell: ShellPlace): NamedPath[] {
  const cutLine = args.endsWith('…')
  const whole = cutLine ? args.slice(0, -1) : args
  let found: Found[]
  if (WEB_TOOLS.test(tool)) found = []
  else if (SHELL_TOOLS.test(tool)) found = shellPaths(whole, shell)
  else if (/^\s*[[{]/.test(whole))
    found = [...whole.matchAll(/"((?:\/|~\/|\.\.\/)[^"]*)"/g)].map((match) => ({
      path: match[1],
      place: placed(match[1], dir),
    }))
  else {
    // "path (120 chars)" and "path (edit)" are how a write and an edit are kept.
    const path = whole.replace(/ \((?:\d+ chars|edit)\)$/, '').trim()
    const place = isPathLike(path) ? placed(path, dir) : null
    found = place !== null && (!GREP_TOOLS.test(tool) || existsSync(place)) ? [{ path, place }] : []
  }
  return found.map((f) => ({ ...f, cut: cutLine && whole.trimEnd().endsWith(f.path) }))
}

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
  // One shell runs the transcript's commands in order, from the sample directory.
  const shell: ShellPlace = { cwd: input.dir, previous: undefined, stack: [] }
  for (const { tool = '', args = '' } of tools)
    for (const { path, place, cut } of pathsIn(tool, args, input.dir, shell)) {
      if (place === null) continue
      // A cut path is a prefix of what the agent typed, so a plain string prefix is the right test.
      if (cut && input.dir.startsWith(place)) continue
      if (isWithin(place, input.dir)) continue
      // A system folder named outright (`/tmp/scratch`, `/usr/share/dict`) is no reach. A
      // path that climbs out of the sample with `..` is, wherever it lands, even in /tmp.
      if (isAbsolute(path) && SYSTEM_DIRS.some((root) => isWithin(place, root))) continue
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
export function summarize(events: TranscriptEvent[], maxLines: number): string {
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
  // At least a first and a last line: `slice(-0)` would be every line, the whole transcript.
  const kept = Math.max(2, Number.isFinite(maxLines) ? Math.floor(maxLines) : 2)
  if (lines.length <= kept) return lines.join('\n')
  const head = lines.slice(0, Math.floor(kept / 2))
  const tail = lines.slice(-Math.ceil(kept / 2))
  return [...head, `… ${lines.length - kept} steps left out …`, ...tail].join('\n')
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
    followedTask: noulOf(answers, 'followed_task'),
    // Asked only after an error; one Jev left out is null, and the counts stand.
    recovered: hadErrors ? optionalAnswer(() => noulOf(answers, 'recovered')) : null,
  }
}

export const workflowPack: JudgePack<WorkflowRaw> = {
  ...workflowScoring,
  version: 1,
  label: 'Workflow: how the agent worked, from its transcript',
  artifacts: [],
  async judge(input, ctx) {
    const events = input.transcript
    if (!events?.length) return null
    const metrics = metricsOf(events, input)
    const { summaryLines } = (ctx.config as WorkflowConfig).workflow
    const jev = asksJev(input, ctx)
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
