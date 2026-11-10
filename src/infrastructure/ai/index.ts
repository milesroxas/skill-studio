import {
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  type AiModel,
  type AiProviderId,
  type AiProviderInfo,
  ANTHROPIC_MODELS,
} from '@domain/ai.ts'
import { keptAccount } from './account.ts'
import { anthropicProvider } from './anthropic.ts'
import { claudeCodeProvider } from './claude-code.ts'
import { codexProvider } from './codex.ts'
import { openaiProvider } from './openai.ts'
import type { AiProvider } from './types.ts'

const providers: Record<AiProviderId, AiProvider> = {
  anthropic: anthropicProvider,
  'claude-code': claudeCodeProvider,
  openai: openaiProvider,
  codex: codexProvider,
}

export const aiProvider = (id: AiProviderId): AiProvider => providers[id]

/** What to offer when a connected provider cannot list its models right now. */
const KNOWN_MODELS: Partial<Record<AiProviderId, readonly AiModel[]>> = {
  anthropic: ANTHROPIC_MODELS,
}

/** Each CLI provider's account, asked for at most every half minute unless a fresh answer is wanted. */
const accounts = new Map(
  AI_PROVIDER_IDS.flatMap((id) => {
    const provider = providers[id]
    return provider.account
      ? [[id, keptAccount(() => provider.account?.() ?? Promise.resolve(null))] as const]
      : []
  }),
)

/**
 * Every provider as it stands now: connected or not, and the models it offers.
 * With `fresh`, each CLI is asked again how it is signed in; without it, an
 * answer from the last half minute stands, so a request does not wait on two
 * CLI runs before it starts.
 */
export function aiProviderInfo(options: { fresh?: boolean } = {}): Promise<AiProviderInfo[]> {
  return Promise.all(
    AI_PROVIDER_IDS.map(async (id): Promise<AiProviderInfo> => {
      const provider = providers[id]
      if (!provider.connected())
        return {
          id,
          connected: false,
          problem: null,
          models: [],
          account: null,
          installable: Boolean(provider.installable),
        }
      const account = (await accounts.get(id)?.(options.fresh)) ?? null
      // Signed out, every request would fail: offer no model until it signs in.
      if (account && !account.signedIn)
        return {
          id,
          connected: true,
          problem: `${AI_PROVIDERS[id].label} is not signed in.`,
          models: [],
          account,
          installable: false,
        }
      try {
        return {
          id,
          connected: true,
          problem: null,
          models: await provider.models(),
          account,
          installable: false,
        }
      } catch (error) {
        return {
          id,
          connected: true,
          problem: (error as Error).message,
          models: [...(KNOWN_MODELS[id] ?? [])],
          account,
          installable: false,
        }
      }
    }),
  )
}

export { type AiMessage, isProviderError } from './types.ts'
