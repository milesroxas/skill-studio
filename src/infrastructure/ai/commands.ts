/**
 * The skills the `claude` command invokes by name, for the menu that opens on
 * a slash. Only the CLI knows the whole list: its own folders, every installed
 * plugin, and what its settings disable. It prints the list in the first event
 * of a run, before the model is asked, so the list is read from a run that is
 * ended the moment that event arrives. Descriptions come from each skill's own
 * file on disk, where one can be found.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SlashCommand } from '@domain/commands.ts'
import { metaText, readFrontMatter } from '@domain/text.ts'
import { agentEnv } from '../env.ts'
import { exec } from '../exec.ts'

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

/** Where the CLI keeps the user's own skills and commands. */
const configDir = (): string => process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')

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

/** Read the list from the CLI. Throws when the CLI cannot start or does not report one. */
async function readCommands(): Promise<SlashCommand[]> {
  const controller = new AbortController()
  let init: InitEvent | null = null
  const result = await exec(
    'claude',
    [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--no-session-persistence',
      '--strict-mcp-config',
      '--setting-sources',
      'user',
      '--tools',
      '',
    ],
    {
      cwd: tmpdir(),
      env: agentEnv(),
      input: 'Say hello.',
      timeoutMs: 30_000,
      signal: controller.signal,
      onLine: (line) => {
        if (init) return
        let event: InitEvent
        try {
          event = JSON.parse(line)
        } catch {
          return
        }
        if (event.type !== 'system' || event.subtype !== 'init') return
        init = event
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
  return (found.skills ?? []).map((name) => ({
    name,
    description: descriptionIn(filesOf(name, plugins)),
  }))
}

/** The skills the CLI can invoke now, read again after a while. */
export function listClaudeCommands(): Promise<SlashCommand[]> {
  if (cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.commands)
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
