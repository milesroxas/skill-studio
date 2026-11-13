/**
 * The assistant's vocabulary: the ways to reach a model (a provider), the
 * models each one offers with the effort levels each model takes, one reply in
 * progress (a run), the conversation in the side panel, and what was spent.
 * Pure types and functions, so the backend and the page agree by construction.
 */
import type { ImageRef } from './image.ts'
import type { SecretId } from './secrets.ts'

/**
 * Every way to reach a model, each vendor's CLI ahead of its API key. The CLI
 * is the main way in: it runs on the person's own account with no key. The
 * order is the order of every model list, and of the default when nothing is
 * chosen yet, so someone with both set up starts on the CLI, not on a key that
 * bills each request.
 */
export const AI_PROVIDER_IDS = ['claude-code', 'anthropic', 'codex', 'openai'] as const
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
  vendor: AiVendor
  /** One line in Settings on what connecting this way means. */
  about: string
  /** Where the provider shows what the account has spent, when it has such a page. */
  usageUrl: string | null
}

/**
 * A provider is reached with a key the app keeps, or through a CLI its maker
 * publishes, on the account the person signed that CLI in to. The app runs the
 * CLI and reads how it stands. Installing it and signing it in are the
 * person's to do, in their own terminal, with the maker's own commands: the
 * app shows those commands and never runs them, so it offers no login of its
 * own and never holds one.
 */
export type AiProviderDef = ProviderBase &
  (
    | { via: 'key'; secret: SecretId }
    | {
        via: 'cli'
        command: string
        /** The maker's install guide. */
        install: string
        /** The one-line install command that guide gives for macOS and Linux, when it has one. */
        installCommand?: string
        /** The CLI's own sign-in command. */
        signInCommand: string
      }
  )

/** Who makes the models: each is reached by a CLI on a plan, or by an API key. */
export const AI_VENDORS = ['Anthropic', 'OpenAI'] as const
export type AiVendor = (typeof AI_VENDORS)[number]

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
    installCommand: 'curl -fsSL https://claude.ai/install.sh | bash',
    signInCommand: 'claude auth login',
    about: 'Runs Claude Code installed on this computer, on the account it is signed in to.',
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
    signInCommand: 'codex login',
    about: 'Runs Codex installed on this computer, on the account it is signed in to.',
    usageUrl: 'https://chatgpt.com/codex/settings/usage',
  },
}

/** A vendor's ways in, the CLI first: it is the main one. */
export const providersOf = (vendor: AiVendor): AiProviderId[] =>
  AI_PROVIDER_IDS.filter((id) => AI_PROVIDERS[id].vendor === vendor)

/** A vendor's CLI: the main way to its models. */
export const mainProviderOf = (vendor: AiVendor): AiProviderId => providersOf(vendor)[0]

/** The providers a request can go to now: connected, and with nothing wrong. */
export const readyProviders = (providers: readonly AiProviderInfo[]): AiProviderInfo[] =>
  providers.filter((p) => p.connected && !p.problem)

export interface AiModel {
  id: string
  label: string
  /** The effort levels this model accepts, weakest first; empty when it takes none. */
  efforts: Effort[]
}

/** Who a CLI is signed in as, and what pays for what it writes. */
export interface CliAccount {
  signedIn: boolean
  /** The account's email, when the CLI says. */
  email: string | null
  /**
   * What its requests bill to: the account's plan, or an API key the CLI found
   * in its environment, which it uses ahead of any plan. Null when it does not say.
   */
  billing: 'plan' | 'key' | null
  /** The plan as the CLI names it, such as `max`; null without one. */
  plan: string | null
}

const capital = (text: string): string => text.replace(/^./, (first) => first.toUpperCase())

/**
 * One line on an installed CLI: who it is signed in as and what pays for its
 * requests, so a key in the environment is never taken for a plan. The
 * provider's own line when the CLI cannot say.
 */
export function accountLine(id: AiProviderId, account: CliAccount | null): string {
  const def = AI_PROVIDERS[id]
  if (!account?.signedIn || def.via !== 'cli') return def.about
  if (account.billing === 'key')
    return 'It found an API key in the environment, so each request bills to that API account, not to a plan.'
  if (account.billing !== 'plan')
    return `Uses the account the ${def.command} command is set up with.`
  const plan = account.plan
    ? `on the ${capital(account.plan.replace(/_/g, ' '))} plan`
    : 'on your plan'
  return `${capital(account.email ? `as ${account.email}, ${plan}` : plan)}. No key needed.`
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
  /**
   * For an installed CLI that can say who it is signed in as. Null for a key,
   * a CLI that is not installed, or one that cannot say.
   */
  account: CliAccount | null
  /** Not installed, and its maker's one-line install command works on this host. */
  installable: boolean
}

/** An installed CLI that says it is signed out. */
export const needsSignIn = (info: AiProviderInfo): boolean => {
  const def = AI_PROVIDERS[info.id]
  return def.via === 'cli' && info.account?.signedIn === false
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

/**
 * `assist` fills one field, `chat` adds to the side panel's conversation, `refine`
 * writes Auto refine's one revision, `rewrites` writes Suggest changes' three
 * (its text is the JSON of a `RewritesResult`), and `improve` adds to a Help me
 * improve conversation.
 */
export type AiRunKind = 'assist' | 'chat' | 'refine' | 'rewrites' | 'improve'
export type AiRunStatus = 'running' | 'done' | 'failed' | 'stopped'

/** One reply, while it is written and after. The backend holds it; the page mirrors it. */
export interface AiRun {
  /** Unique for good, so a run started after the backend restarts is never taken for an older one. */
  id: string
  kind: AiRunKind
  status: AiRunStatus
  /** The reply so far: a field's text for `assist` and `refine`, Markdown for `chat` and `improve`, JSON for `rewrites`. */
  text: string
  error: string | null
  provider: AiProviderId
  model: string
  usage: AiUsage | null
}

export const isSettled = (run: AiRun): boolean => run.status !== 'running'

/**
 * Whether `next` is news about a run last seen as `known`. A run that has
 * ended never runs again, so a late report of it still running is not.
 */
export const isNewsOf = (known: AiRun | undefined, next: AiRun): boolean =>
  !known || !isSettled(known) || isSettled(next)

/**
 * How many runs stay readable: in the backend for a page that asks late, and
 * in the page's own mirror of them.
 */
export const RUNS_KEPT = 30

/**
 * The runs to forget so that `RUNS_KEPT` are left, given every run held,
 * oldest first: the oldest that have ended. One still being written is never
 * forgotten.
 */
export const runsToForget = (held: readonly AiRun[]): string[] =>
  held
    .filter(isSettled)
    .slice(0, Math.max(0, held.length - RUNS_KEPT))
    .map((run) => run.id)

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  text: string
  /** Pictures sent with a user's message. */
  images?: ImageRef[]
  /** The skill a reply was written about, by path: the only one its changes apply to. */
  skill?: string
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

/** And only this much of their text, in characters, about 6,000 tokens: a few long replies would otherwise fill the window. */
export const CHAT_WINDOW_CHARS = 24_000

/**
 * The messages the model reads: the newest that fit both caps, starting at
 * one from the user so the model never opens on its own words. The newest
 * message always goes, however long.
 */
export function chatWindowOf<T extends { role: 'user' | 'assistant'; text: string }>(
  messages: readonly T[],
): T[] {
  const latest = messages.slice(-CHAT_WINDOW)
  let kept = latest.length
  let chars = 0
  for (let i = latest.length - 1; i >= 0; i -= 1) {
    chars += latest[i].text.length
    if (chars > CHAT_WINDOW_CHARS && i < latest.length - 1) break
    kept = i
  }
  const window = latest.slice(kept)
  const start = window.findIndex((m) => m.role === 'user')
  return window.slice(Math.max(0, start))
}

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
  const short = (scaled: number): string =>
    scaled < 99.95 ? scaled.toFixed(1).replace(/\.0$/, '') : String(Math.round(scaled))
  // The unit is picked after rounding: 999,950 is 1M, never 1000k.
  const thousands = short(value / 1000)
  return Number(thousands) < 1000 ? `${thousands}k` : `${short(value / 1_000_000)}M`
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
  { id: 'claude-opus-5-5', label: 'Opus 5.5', efforts: [...EFFORTS] },
  { id: 'claude-fable-5-1', label: 'Fable 5.1', efforts: [...EFFORTS] },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', efforts: [...EFFORTS] },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5', efforts: [...EFFORTS] },
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
  { id: CODEX_DEFAULT_MODEL, label: 'Default model', efforts: ['low', 'medium', 'high'] },
]

/** `models` with `first` moved to the front, when it is among them. */
export const defaultFirst = (models: AiModel[], first: string): AiModel[] => [
  ...models.filter((m) => m.id === first),
  ...models.filter((m) => m.id !== first),
]
