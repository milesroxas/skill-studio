/**
 * The assistant's vocabulary: the ways to reach a model (a provider), the
 * models each one offers with the effort levels each model takes, one reply in
 * progress (a run), the conversation in the side panel, and what was spent.
 * Pure types and functions, so the backend and the page agree by construction.
 */
import type { ImageRef } from './image.ts'
import type { SecretId } from './secrets.ts'

export const AI_PROVIDER_IDS = ['anthropic', 'claude-code', 'openai', 'codex'] as const
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number]

/** Every effort level a model may take, weakest first. A model lists the ones it accepts. */
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type Effort = (typeof EFFORTS)[number]

const EFFORT_LABELS: Record<Effort, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
}

/** The name of an effort level; the empty level is the model's own default. */
export const effortLabel = (effort: string): string => EFFORT_LABELS[effort as Effort] ?? 'Default'

interface ProviderBase {
  /** The name in a model list: who answers, and on whose account. */
  label: string
  vendor: 'Anthropic' | 'OpenAI'
  /** One line in Settings on what connecting this way means. */
  about: string
  /** Where the provider shows what the account has spent, when it has such a page. */
  usageUrl: string | null
}

/** A provider is reached with a key the app keeps, or through a CLI signed in to a plan. */
export type AiProviderDef = ProviderBase &
  ({ via: 'key'; secret: SecretId } | { via: 'cli'; command: string; install: string })

export const AI_PROVIDERS: Record<AiProviderId, AiProviderDef> = {
  anthropic: {
    label: 'Anthropic API',
    vendor: 'Anthropic',
    via: 'key',
    secret: 'anthropic',
    about: 'A key bills each request to your Anthropic API account.',
    usageUrl: 'https://platform.claude.com/usage',
  },
  'claude-code': {
    label: 'Claude Code',
    vendor: 'Anthropic',
    via: 'cli',
    command: 'claude',
    install: 'https://code.claude.com/docs/en/setup',
    about: 'Uses the Claude plan the claude command is signed in to. No key needed.',
    usageUrl: 'https://claude.ai/settings/usage',
  },
  openai: {
    label: 'OpenAI API',
    vendor: 'OpenAI',
    via: 'key',
    secret: 'openai',
    about: 'A key bills each request to your OpenAI API account.',
    usageUrl: 'https://platform.openai.com/usage',
  },
  codex: {
    label: 'Codex',
    vendor: 'OpenAI',
    via: 'cli',
    command: 'codex',
    install: 'https://developers.openai.com/codex/cli',
    about: 'Uses the ChatGPT plan the codex command is signed in to. No key needed.',
    usageUrl: 'https://chatgpt.com/codex/settings/usage',
  },
}

export interface AiModel {
  id: string
  label: string
  /** The effort levels this model accepts, weakest first; empty when it takes none. */
  efforts: Effort[]
}

/** A provider as a host sees it now. */
export interface AiProviderInfo {
  id: AiProviderId
  /** A key is set or the CLI is installed, so a request can be tried. */
  connected: boolean
  /** Why a connected provider could not list its models, such as a refused key. */
  problem: string | null
  /** The models to offer, the provider's default first. */
  models: AiModel[]
}

export interface AiStatus {
  providers: AiProviderInfo[]
}

/** The model in use and how hard it works. `effort` is empty for the model's default. */
export interface AiChoice {
  provider: AiProviderId
  model: string
  effort: string
}

/** The effort to use on `model`: the wanted one when the model accepts it, else its default. */
export const effortFor = (model: AiModel, wanted: string): string =>
  model.efforts.includes(wanted as Effort) ? wanted : ''

/**
 * The model a request runs on: the stored choice while its provider is
 * connected and still offers it, else the first connected provider's default.
 * Null when nothing is connected.
 */
export function resolveChoice(
  wanted: AiChoice | null,
  providers: AiProviderInfo[],
): AiChoice | null {
  const usable = providers.filter((p) => p.connected && p.models.length)
  const provider = usable.find((p) => p.id === wanted?.provider) ?? usable[0]
  if (!provider) return null
  const kept = provider.id === wanted?.provider
  const model = (kept && provider.models.find((m) => m.id === wanted?.model)) || provider.models[0]
  return {
    provider: provider.id,
    model: model.id,
    effort: effortFor(model, kept ? (wanted?.effort ?? '') : ''),
  }
}

export const modelOf = (choice: AiChoice, providers: AiProviderInfo[]): AiModel | undefined =>
  providers.find((p) => p.id === choice.provider)?.models.find((m) => m.id === choice.model)

/** Tokens one reply read and wrote. */
export interface AiUsage {
  input: number
  output: number
}

export type AiRunKind = 'assist' | 'chat'
export type AiRunStatus = 'running' | 'done' | 'failed' | 'stopped'

/** One reply, while it is written and after. The backend holds it; the page mirrors it. */
export interface AiRun {
  id: number
  kind: AiRunKind
  status: AiRunStatus
  /** The reply so far: a field's text for `assist`, Markdown for `chat`. */
  text: string
  error: string | null
  provider: AiProviderId
  model: string
  usage: AiUsage | null
}

export const isSettled = (run: AiRun): boolean => run.status !== 'running'

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  text: string
  /** Pictures sent with a user's message. */
  images?: ImageRef[]
  /** ISO time it was sent or finished. */
  at: string
}

/** The side panel's conversation, and the reply being written to it, if any. */
export interface ChatThread {
  messages: ChatMessage[]
  run: AiRun | null
}

/** Only this many of the latest messages go back to the model, so a long thread stays affordable. */
export const CHAT_WINDOW = 40

/** One finished request, as the usage log keeps it. */
export interface UsageEntry extends AiUsage {
  at: string
  provider: AiProviderId
  model: string
}

export interface UsageTotals extends AiUsage {
  requests: number
}

export interface UsageSummary {
  today: UsageTotals
  /** The last 30 days, today included. */
  month: UsageTotals
  /** The last 30 days by model, the most used first. */
  models: Array<UsageTotals & { provider: AiProviderId; model: string }>
}

const DAY_MS = 86_400_000
export const USAGE_DAYS = 30

const total = (entries: UsageEntry[]): UsageTotals => ({
  requests: entries.length,
  input: entries.reduce((sum, e) => sum + e.input, 0),
  output: entries.reduce((sum, e) => sum + e.output, 0),
})

/** What was spent today (since local midnight) and in the last 30 days, as of `now`. */
export function summarizeUsage(entries: UsageEntry[], now: Date): UsageSummary {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const since = now.getTime() - USAGE_DAYS * DAY_MS
  const month = entries.filter((e) => Date.parse(e.at) >= since)
  const byModel = new Map<string, UsageEntry[]>()
  for (const entry of month) {
    const key = `${entry.provider}\n${entry.model}`
    byModel.set(key, [...(byModel.get(key) ?? []), entry])
  }
  return {
    today: total(month.filter((e) => Date.parse(e.at) >= midnight)),
    month: total(month),
    models: [...byModel.values()]
      .map((list) => ({ provider: list[0].provider, model: list[0].model, ...total(list) }))
      .sort((a, b) => b.input + b.output - (a.input + a.output)),
  }
}

/** 1234 reads 1.2k and 1234567 reads 1.2M: a count of tokens at a glance. */
export function compactCount(value: number): string {
  if (value < 1000) return String(value)
  const [scaled, unit] = value < 1_000_000 ? [value / 1000, 'k'] : [value / 1_000_000, 'M']
  return `${scaled < 100 ? scaled.toFixed(1).replace(/\.0$/, '') : Math.round(scaled)}${unit}`
}

/**
 * OpenAI lists every model the key can call, speech and embeddings included,
 * and says nothing about what each one is for. These ids are the ones that
 * hold a conversation.
 */
export const isOpenAiChatModel = (id: string): boolean =>
  /^(gpt-|o\d|chatgpt-)/.test(id) &&
  !/audio|realtime|tts|transcribe|image|search|embedding|moderation|instruct|computer-use/.test(id)

/** OpenAI's reasoning models take an effort; its other models take none. */
export const openAiEfforts = (id: string): Effort[] =>
  /^(gpt-5|o\d)/.test(id) ? ['low', 'medium', 'high'] : []

/**
 * Anthropic's current models, for when the live list cannot be read. The live
 * list is the source of truth for anything newer.
 */
export const ANTHROPIC_MODELS: readonly AiModel[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', efforts: [...EFFORTS] },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', efforts: [...EFFORTS] },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', efforts: [...EFFORTS] },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', efforts: [...EFFORTS] },
]

/** The model a new connection starts on, when the provider offers it. */
export const ANTHROPIC_DEFAULT_MODEL = ANTHROPIC_MODELS[0].id

/** The names Claude Code gives its models; each follows the newest model of its line. */
export const CLAUDE_CODE_MODELS: readonly AiModel[] = [
  { id: 'opus', label: 'Opus', efforts: [...EFFORTS] },
  { id: 'fable', label: 'Fable', efforts: [...EFFORTS] },
  { id: 'sonnet', label: 'Sonnet', efforts: [...EFFORTS] },
  { id: 'haiku', label: 'Haiku', efforts: [...EFFORTS] },
]

/** Codex names no models to pick from: it runs the one its own settings choose. */
export const CODEX_DEFAULT_MODEL = 'default'
export const CODEX_MODELS: readonly AiModel[] = [
  { id: CODEX_DEFAULT_MODEL, label: 'Codex default', efforts: ['low', 'medium', 'high'] },
]

/** `models` with `first` moved to the front, when it is among them. */
export const defaultFirst = (models: AiModel[], first: string): AiModel[] => [
  ...models.filter((m) => m.id === first),
  ...models.filter((m) => m.id !== first),
]
