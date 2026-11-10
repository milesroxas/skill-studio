/**
 * The skills the `claude` command invokes by name, for the menu that opens on
 * a slash. Only the CLI knows the whole list: its own folders, every installed
 * plugin, and what its settings disable. It prints the list in the first event
 * of a run, before the model is asked, so the list is read from a run that is
 * ended the moment that event arrives. Descriptions come from each skill's own
 * file on disk, where one can be found.
 *
 * The list is kept in memory for a while and on disk for as long as the
 * folders it was read from are unchanged, so a backend that starts again does
 * not run the CLI again.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SlashCommand } from '@domain/commands.ts'
import { metaText, readFrontMatter } from '@domain/text.ts'
import { claudePrintArgs } from '../claude-cli.ts'
import { agentEnv } from '../env.ts'
import { exec } from '../exec.ts'
import { readJson, writeJson } from '../fs.ts'
import { jsonLine } from '../json-lines.ts'
import { STUDIO_DIR } from '../library.ts'

interface InitEvent {
  type: string
  subtype?: string
  /** Every skill the run can invoke, as typed after the slash. */
  skills?: string[]
  plugins?: Array<{ name: string; path: string }>
}

/** The list changes when a skill is installed, which is seldom; this long, the menu opens from memory. */
const CACHE_MS = 5 * 60_000
let cached: { at: number; commands: SlashCommand[] } | null = null
/** A read under way, so two askers share one run. */
let reading: Promise<SlashCommand[]> | null = null

/** The list on disk, with what it was read from, so a later backend can tell whether it still holds. */
const STORED = join(STUDIO_DIR, 'claude-commands.json')

interface StoredCommands {
  /** The modification times of every folder and file the list depends on. */
  fingerprint: string
  /** The plugin folders the CLI reported, which the fingerprint covers too. */
  plugins: string[]
  commands: SlashCommand[]
}

/** Where the CLI keeps the user's own skills and commands. */
const configDir = (): string => process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')

/**
 * The folders and files whose change can change the list: the user's own, the
 * plugins', and the settings that enable them. A folder's time moves only when
 * something is added to or removed from it directly, so each plugin's `skills`
 * and `commands` folders are watched beside the plugin's own.
 */
export const watched = (plugins: string[]): string[] => {
  const home = configDir()
  return [
    join(home, 'skills'),
    join(home, 'commands'),
    join(home, 'plugins'),
    join(home, 'settings.json'),
    ...plugins.flatMap((plugin) => [plugin, join(plugin, 'skills'), join(plugin, 'commands')]),
  ]
}

export const fingerprint = (paths: string[]): string =>
  paths
    .map((path) => {
      try {
        return `${path}:${statSync(path).mtimeMs}`
      } catch {
        return `${path}:-`
      }
    })
    .join('\n')

/** The list stored by an earlier read, when nothing it was read from has changed since. */
function storedCommands(): SlashCommand[] | null {
  try {
    const stored = readJson<Partial<StoredCommands> | null>(STORED, null)
    if (!stored || !Array.isArray(stored.commands)) return null
    const plugins = Array.isArray(stored.plugins) ? stored.plugins : []
    return fingerprint(watched(plugins)) === stored.fingerprint ? stored.commands : null
  } catch {
    return null
  }
}

/** The files a skill's description may be in: a plugin's folders for `plugin:skill`, else the user's own. */
function filesOf(name: string, plugins: Map<string, string>): string[] {
  const at = name.indexOf(':')
  if (at > 0) {
    const root = plugins.get(name.slice(0, at))
    const skill = name.slice(at + 1)
    return root
      ? [join(root, 'skills', skill, 'SKILL.md'), join(root, 'commands', `${skill}.md`)]
      : []
  }
  const home = configDir()
  return [join(home, 'skills', name, 'SKILL.md'), join(home, 'commands', `${name}.md`)]
}

function descriptionIn(files: string[]): string {
  for (const file of files) {
    if (!existsSync(file)) continue
    try {
      return metaText(readFrontMatter(readFileSync(file, 'utf8')).meta, 'description') ?? ''
    } catch {
      return ''
    }
  }
  return ''
}

/**
 * Read the list from the CLI. Throws when the CLI cannot start or does not
 * report one. The run is ended at its first event, before the model is asked;
 * should that ever slip, the smallest model takes one turn at most.
 */
async function readCommands(): Promise<SlashCommand[]> {
  const controller = new AbortController()
  let init: InitEvent | null = null
  const result = await exec(
    'claude',
    claudePrintArgs(
      '--setting-sources',
      'user',
      '--tools',
      '',
      '--model',
      'haiku',
      '--max-turns',
      '1',
    ),
    {
      cwd: tmpdir(),
      env: agentEnv(),
      input: 'Say hello.',
      timeoutMs: 30_000,
      signal: controller.signal,
      onLine: (line) => {
        if (init) return
        const event = jsonLine(line)
        if (event?.type !== 'system' || event.subtype !== 'init') return
        init = event as unknown as InitEvent
        // The list is in hand: the model is never asked.
        controller.abort()
      },
    },
  )
  // Assigned inside the callback, which the type checker cannot follow.
  const found = init as InitEvent | null
  if (!found) {
    if (result.spawnError) throw new Error(`Could not start claude: ${result.spawnError}`)
    throw new Error(
      'Claude Code did not list its skills. Run `claude` once to check it is signed in.',
    )
  }
  const plugins = new Map((found.plugins ?? []).map((plugin) => [plugin.name, plugin.path]))
  const commands = (found.skills ?? []).map((name) => ({
    name,
    description: descriptionIn(filesOf(name, plugins)),
  }))
  const pluginDirs = [...plugins.values()]
  writeJson(STORED, {
    fingerprint: fingerprint(watched(pluginDirs)),
    plugins: pluginDirs,
    commands,
  } satisfies StoredCommands)
  return commands
}

/** The skills the CLI can invoke now: from memory, from the stored list while it holds, else from the CLI. */
export function listClaudeCommands(): Promise<SlashCommand[]> {
  if (cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.commands)
  const stored = storedCommands()
  if (stored) {
    cached = { at: Date.now(), commands: stored }
    return Promise.resolve(stored)
  }
  reading ??= readCommands()
    .then((commands) => {
      cached = { at: Date.now(), commands }
      return commands
    })
    .finally(() => {
      reading = null
    })
  return reading
}
