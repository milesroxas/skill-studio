/**
 * The port every way of reaching a model implements: say whether it is
 * connected, list its models, and write one reply. The application talks to
 * this and never to an SDK or a CLI.
 */
import type { AiModel, AiProviderId, AiUsage, CliAccount } from '@domain/ai.ts'
import type { SlashCommand } from '@domain/commands.ts'
import type { StoredImage } from '../images.ts'

export interface AiMessage {
  role: 'user' | 'assistant'
  text: string
  /** Pictures sent with a user's message, read before its text. */
  images?: StoredImage[]
}

export interface AiRequest {
  model: string
  /** Empty for the model's own default. */
  effort: string
  system: string
  /** The conversation, oldest first, ending with the user's message. */
  messages: AiMessage[]
  /** A JSON Schema the whole reply must match; null for prose. */
  schema: Readonly<Record<string, unknown>> | null
  signal: AbortSignal
  /** Called with the reply so far each time it grows, or starts over on another model. */
  onText: (text: string) => void
}

export interface AiReply {
  text: string
  usage: AiUsage
  /** The model that answered, as the provider names it. */
  model: string
}

export interface AiProvider {
  id: AiProviderId
  connected(): boolean
  /** The models to offer, the default first. Throws when the provider cannot say. */
  models(): Promise<AiModel[]>
  /** Write one reply. Throws an `Error` whose message can be shown as it is. */
  run(request: AiRequest): Promise<AiReply>
  /** The commands a chat message may start with, for a provider that expands them. Throws when it cannot say. */
  commands?(): Promise<SlashCommand[]>
  /** The one-line install command its maker's guide gives works on this host. */
  installable?: boolean
  /** Who an installed CLI is signed in as; null when it cannot say. */
  account?(): Promise<CliAccount | null>
}
