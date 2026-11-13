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
import { folderEnding, isWithin, segments } from '@domain/paths.ts'
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
const SHELL_TOOLS = /^(?:bash|shell|run|exec)/i
/** Programs that make or change a file, whatever else they are given. */
const WRITE_PROGRAMS = new Set(['tee', 'cp', 'mv', 'mkdir', 'touch'])
/** Programs that run another they are given among their words: `find . -exec cp {} out \;`. */
const RUNNER_PROGRAMS = new Set(['find', 'xargs'])

/** Shared system locations an agent touches without reaching into anyone's files. */
const SYSTEM_DIRS = ['/dev', '/tmp', '/private/tmp', '/usr', '/bin', '/opt', '/etc']

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
/** Programs that open no file they are given: every word is text, and a redirection names their file. */
const TEXT_PROGRAMS = new Set(['tr', 'echo', 'printf'])
/** Search programs' options that take a count, so the word after one is no pattern: `grep -m 5 "/api" notes.md`. */
const COUNT_PROGRAMS = new Set('grep egrep fgrep rg ag ack'.split(' '))
const COUNT_OPTIONS = new Set(
  '-m -A -B -C --max-count --after-context --before-context --context'.split(' '),
)
/** Programs that take a message for a person, and the options that give it: `git commit -m "/fix typo"`. */
const MESSAGE_PROGRAMS = new Set(['git', 'gh', 'hg', 'svn', 'jj'])
const MESSAGE_OPTIONS = new Set(['-m', '-am', '--message'])
/** Words a command may open with before its program, as `if cd outputs; then …` and `sudo cp a b` do. */
const COMMAND_PREFIXES = new Set(
  '{ ! if then else elif do while until time command builtin exec sudo env nohup'.split(' '),
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
  /** The word is a redirection's file: read `from` after `<`, written `to` after `>`. */
  redirect: 'from' | 'to' | null
}

/** One simple command's words, or a bracket that opens or closes a subshell. */
type ShellPart = ShellWord[] | '(' | ')'

/** Where a heredoc's text ends in `line`, read from `from`: past its closing word, or the line's end when the line was cut before it. */
function heredocEnd(line: string, from: number, closing: string): number {
  let at = from
  for (const piece of line.slice(from).split(/(\s+)/)) {
    at += piece.length
    if (piece === closing) return at
  }
  return line.length
}

/**
 * A command line as its simple commands, each a list of words with quotes kept
 * together, and the brackets between them. `|`, `;` and `&` end a command.
 *
 * A redirection is read for what it is: `> file` and `< file` name a file, and
 * `2>&1` and `>&2` send one stream to another and name none. A heredoc's text
 * is no command: it is left out as far as its closing word. The transcript
 * keeps a command on one line, so where that text begins is read from the
 * line's shape: after the heredoc's own word, past any `> file` that follows it.
 * A command piped on from there (`<<EOF | tee x`) cannot be told from the text
 * and is left out with it. The word a here-string (`<<<`) gives is text too.
 * A pair of backticks holds a command of its own, as `$( )` does.
 */
function shellCommands(line: string): ShellPart[] {
  const parts: ShellPart[] = []
  let command: ShellWord[] = []
  let word = ''
  let quoted = false
  let quote: string | null = null
  /** What the next word is, when it is not a plain one: a redirection's file, a heredoc's closing word, or text. */
  let next: ShellWord['redirect'] | 'closing' | 'text' = null
  /** The closing word of a heredoc whose text has not begun yet. */
  let closing: string | null = null
  /** Inside a pair of backticks, which run a command of their own as `$( )` does. */
  let ticked = false
  const endWord = () => {
    if (word || quoted) {
      if (next === 'closing') closing = word
      else if (next !== 'text') command.push({ text: word, quoted, redirect: next })
      next = null
    }
    word = ''
    quoted = false
  }
  const endCommand = () => {
    endWord()
    next = null
    if (command.length) parts.push(command)
    command = []
  }
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const after = line[i + 1] ?? ''
    if (quote) {
      if (char === quote) quote = null
      // Inside double quotes a backslash escapes only what would end or open something.
      else if (char === '\\' && quote === '"' && '"\\$`'.includes(after) && after) word += line[++i]
      else word += char
      continue
    }
    const opensWord = !word && !quoted && next === null && !/\s/.test(char)
    // A heredoc's text begins at the first word that is not a redirection of its command.
    if (closing !== null && opensWord && !/^(?:\d*|&)>/.test(line.slice(i))) {
      i = heredocEnd(line, i, closing) - 1
      closing = null
      // The text ended a line, so what follows is another command.
      endCommand()
    } else if (char === '\\') {
      // Before a space it joined two lines of the command; before anything else it makes that character plain.
      if (after && !/\s/.test(after)) word += line[++i]
    } else if (char === '"' || char === "'") {
      quote = char
      quoted = true
    } else if (char === '`') {
      endCommand()
      parts.push(ticked ? ')' : '(')
      ticked = !ticked
    } else if (char === '<' || char === '>') {
      // A number right before the sign names a stream, not a word of the command.
      if (!quoted && /^\d+$/.test(word)) word = ''
      endWord()
      const stream = /^&(?:\d+|-)(?![\w./~-])/.exec(line.slice(i + 1))
      if (char === '<' && after === '<') {
        const hereString = line[i + 2] === '<'
        // `<<-` strips tabs from the text; the word after is the closing word all the same.
        i += hereString || line[i + 2] === '-' ? 2 : 1
        next = hereString ? 'text' : 'closing'
      } else if (stream) i += stream[0].length
      else {
        // `>&file` and `>|file` write to the file as `>file` does.
        if (after === '&' || (char === '>' && after === '|')) i += 1
        next = char === '<' ? 'from' : 'to'
      }
    } else if (/\s/.test(char)) endWord()
    // `&>file`: the `>` that follows reads the file.
    else if (char === '&' && after === '>') endWord()
    else if ('|;&()'.includes(char)) {
      endCommand()
      if (char === '(' || char === ')') parts.push(char)
    } else word += char
  }
  endCommand()
  return parts
}

/** Where a simple command's program stands among its words, and its name without its folder. */
function programOf(command: ShellWord[]): { at: number; name: string } {
  // `VAR=value program …`: the program is the first word that is neither an assignment nor a keyword.
  const at = command.findIndex(
    (w) => !w.redirect && !/^\w+=/.test(w.text) && !COMMAND_PREFIXES.has(w.text),
  )
  return { at, name: (command[at]?.text ?? '').split('/').at(-1) ?? '' }
}

/**
 * Whether a tool call writes: a tool that writes or edits, or a shell command
 * with a program that makes a file or with output sent to one. A stream sent to
 * another (`2>&1`) or to a device (`> /dev/null`) writes nothing, and neither
 * does a `>` inside quotes.
 */
const isWrite = ({ tool = '', args = '' }: TranscriptEvent): boolean =>
  WRITE_TOOLS.test(tool) ||
  (SHELL_TOOLS.test(tool) &&
    shellCommands(args).some((part) => {
      if (typeof part === 'string') return false
      const { name } = programOf(part)
      return (
        WRITE_PROGRAMS.has(name) ||
        (RUNNER_PROGRAMS.has(name) && part.some((w) => !w.quoted && WRITE_PROGRAMS.has(w.text))) ||
        part.some((w) => w.redirect === 'to' && !w.text.startsWith('/dev/'))
      )
    }))

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
 * pattern program is given to look for is not one, nor is a message, nor a
 * word given to a program that opens no file; a redirection's file always is.
 */
function commandPaths(command: ShellWord[], shell: ShellPlace): Found[] {
  const { at, name: program } = programOf(command)
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
 * order. Every word given to a program that opens no file is text, and so is
 * the word a message option gives a program that takes a message. For a pattern
 * program the pattern or script is too: the first word that is no option,
 * quoted or not, or the word an option such as `-e` gives. A file of patterns
 * given with `-f` is a file, and so is every word after the pattern.
 */
function textArguments(program: string): (word: string) => boolean {
  if (TEXT_PROGRAMS.has(program)) return () => true
  const takesPattern = PATTERN_PROGRAMS.has(program)
  const takesMessage = MESSAGE_PROGRAMS.has(program)
  const takesCount = COUNT_PROGRAMS.has(program)
  let patternSeen = false
  // What the word after an option is: text (a message, a count or the pattern itself), or a file of patterns.
  let given: 'text' | 'file' | null = null
  return (word) => {
    const after = given
    given = null
    if (after !== null) return after === 'text'
    const [option, value] = word.split(/=(.*)/s)
    if (takesMessage && MESSAGE_OPTIONS.has(option)) {
      if (value === undefined) given = 'text'
      return true
    }
    if (!takesPattern) return false
    if (takesCount && COUNT_OPTIONS.has(option)) {
      if (value === undefined) given = 'text'
      return true
    }
    if (PATTERN_OPTIONS.has(option)) {
      patternSeen = true
      if (value === undefined) given = 'text'
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
  for (const part of shellCommands(line)) {
    if (typeof part !== 'string') found.push(...commandPaths(part, shell))
    else if (part === '(') outer.push({ ...shell, stack: [...shell.stack] })
    else {
      const back = outer.pop()
      if (back) Object.assign(shell, back)
    }
  }
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

/**
 * What tells one call from another: the hash of its whole input, which the
 * transcript keeps. A transcript written before it did has the one-line
 * summary alone, which is the whole call only for a shell command that was not
 * cut: an edit's text and a read's offset are not in it. Null for a call that
 * cannot be told from another, which never counts as a repeat.
 */
function identityOf({ tool = '', args, call }: TranscriptEvent): string | null {
  const what = call ?? (SHELL_TOOLS.test(tool) && !args?.endsWith('…') ? args : undefined)
  return what === undefined ? null : `${tool}\u0000${what}`
}

/**
 * Every folder the sample is named by: where it is, and each place the
 * transcript names that runs through its run's folder and its own, one inside
 * the other. A skill moved, copied or reached through a link since the run
 * keeps both names, so what the agent did at the other address was still done
 * in its own folder.
 */
function sampleHomes(dir: string, places: string[]): string[] {
  const own = segments(dir).slice(-2)
  const homes = new Set([dir])
  // A folder with no run above it has no pair to be known by.
  if (own.length < 2) return [dir]
  for (const place of places) {
    const home = folderEnding(place, own)
    if (home !== null) homes.add(home)
  }
  return [...homes]
}

function metricsOf(events: TranscriptEvent[], input: JudgeInput): WorkflowMetrics {
  const tools = events.filter((e) => e.kind === 'tool')
  const writes = new Set(tools.filter(isWrite))
  const seen = new Set<string>()
  let retries = 0
  for (const e of tools) {
    const identity = identityOf(e)
    if (identity !== null && seen.has(identity)) retries += 1
    // A write may change what the same call answers: a test run again after an edit is no repeat.
    if (writes.has(e)) seen.clear()
    if (identity !== null) seen.add(identity)
  }
  // One shell runs the transcript's commands in order, from the sample directory.
  const shell: ShellPlace = { cwd: input.dir, previous: undefined, stack: [] }
  const named = tools.flatMap(({ tool = '', args = '' }) => pathsIn(tool, args, input.dir, shell))
  const homes = sampleHomes(
    input.dir,
    named.flatMap(({ place }) => (place === null ? [] : [place])),
  )
  const outside = new Set<string>()
  for (const { path, place, cut } of named) {
    if (place === null) continue
    // A cut path is a prefix of what the agent typed, so a plain string prefix is the right test.
    if (cut && homes.some((home) => home.startsWith(place))) continue
    if (homes.some((home) => isWithin(place, home))) continue
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
  const firstWrite = tools.find((e) => writes.has(e))
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

/**
 * What Jev says of the summary. Each question is asked only where it has
 * something to be about: whether the task was done needs the case's task, and
 * what came after an error needs an error.
 */
async function judgeJev(
  summary: string,
  task: string | null,
  hadErrors: boolean,
  ctx: JudgeContext,
): Promise<WorkflowJev> {
  const questions = {
    ...(task !== null
      ? {
          followed_task: noul('Does `transcript` show the agent doing what `task` asks?', {
            true: 'The steps read the inputs the task names, produce what it asks for, and end with it done.',
            false:
              'The steps work on something else, stop before the output is produced, or produce something the task did not ask for.',
          }),
        }
      : {}),
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
  const answers = await ctx.jev.ask(
    { ...(task !== null ? { task } : {}), transcript: summary },
    questions,
  )
  return {
    followedTask: task !== null ? noulOf(answers, 'followed_task') : null,
    // Asked only after an error; one Jev left out is null, and the counts stand.
    recovered: hadErrors ? optionalAnswer(() => noulOf(answers, 'recovered')) : null,
  }
}

export const workflowPack: JudgePack<WorkflowRaw> = {
  ...workflowScoring,
  version: 2,
  label: 'Workflow: how the agent worked, from its transcript',
  async judge(input, ctx) {
    const events = input.transcript
    if (!events?.length) return null
    const metrics = metricsOf(events, input)
    const { summaryLines } = (ctx.config as WorkflowConfig).workflow
    // An output whose case is gone has no task to hold the transcript to.
    const task = input.case?.prompt.trim().slice(0, 1500) || null
    const hadErrors = metrics.errors > 0
    const jev =
      asksJev(input, ctx) && (task !== null || hadErrors)
        ? await judgeJev(summarize(events, summaryLines), task, hadErrors, ctx)
        : null
    return { metrics, jev }
  },
}
