/**
 * Slash commands in the assistant's conversation. A message that starts with
 * `/name` invokes a skill of the CLI the reply runs on, the way it would in a
 * terminal. Pure: what a message invokes, what the menu filters by while the
 * name is typed, which commands match, and the message once one is picked.
 */

export interface SlashCommand {
  /** As typed after the slash: `animate`, or `plugin:skill` for a plugin's. */
  name: string
  description: string
}

/** The name `text` invokes, after its leading slash; null for a plain message. */
export const commandName = (text: string): string | null =>
  /^\/([^\s/]+)(?:\s|$)/.exec(text.trim())?.[1] ?? null

/** True when `text` invokes a command: a slash and a name, then anything or nothing. */
export const isCommand = (text: string): boolean => commandName(text) !== null

/**
 * The name being typed: the text between a leading slash and the caret, while
 * the caret is still in that first word. Null once a space follows the name,
 * or the message does not start with a slash. The menu is closed then.
 */
export function commandQuery(text: string, caret: number): string | null {
  if (!text.startsWith('/')) return null
  const typed = text.slice(1, Math.max(1, caret))
  return /\s/.test(typed) ? null : typed
}

/** How many commands the menu shows at most. */
const COMMANDS_SHOWN = 30

/** How well a command answers a query: by its name, by the part after a plugin's prefix, anywhere in the name, or only in its description. */
function rank(command: SlashCommand, query: string): number {
  const name = command.name.toLowerCase()
  if (name.startsWith(query)) return 0
  const own = name.slice(name.indexOf(':') + 1)
  if (own.startsWith(query)) return 1
  if (name.includes(query)) return 2
  if (command.description.toLowerCase().includes(query)) return 3
  return 4
}

/** The commands that answer `query`, the best first and alphabetical within a rank. An empty query keeps them all. */
export function matchCommands(
  commands: readonly SlashCommand[],
  query: string,
  limit = COMMANDS_SHOWN,
): SlashCommand[] {
  const q = query.trim().toLowerCase()
  return commands
    .map((command) => ({ command, rank: rank(command, q) }))
    .filter((entry) => entry.rank < 4)
    .sort((a, b) => a.rank - b.rank || a.command.name.localeCompare(b.command.name, 'en'))
    .slice(0, limit)
    .map((entry) => entry.command)
}

/** `text` with its first word replaced by `/name`, the rest kept, and where the caret goes: after the name and its space. */
export function withCommand(text: string, name: string): { text: string; caret: number } {
  const rest = text.replace(/^\/\S*\s*/, '')
  const head = `/${name} `
  return { text: head + rest, caret: head.length }
}
