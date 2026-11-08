/**
 * The side panel's own commands: what a message may start with that the
 * panel does itself, in place of a reply. They sit first in the slash menu,
 * before the skills the model's CLI can run, and work on every provider.
 */
import type { SlashCommand } from '@domain/commands.ts'
import { commandName } from '@domain/commands.ts'
import { navigate } from './history.ts'

/** What a command may do to the panel. */
export interface PanelActions {
  /** Start a new conversation, asking first. */
  startOver: () => void
}

export interface AppCommand extends SlashCommand {
  run: (panel: PanelActions) => void
}

export const APP_COMMANDS: readonly AppCommand[] = [
  { name: 'clear', description: 'New conversation', run: (panel) => panel.startOver() },
  { name: 'settings', description: 'Model, effort and keys', run: () => navigate('settings') },
  { name: 'guide', description: 'How to use Skill Studio', run: () => navigate('docs') },
]

/** The panel's command `text` invokes, or null when the message is for the model. */
export const appCommandOf = (text: string): AppCommand | undefined => {
  const name = commandName(text)
  return name === null ? undefined : APP_COMMANDS.find((command) => command.name === name)
}
