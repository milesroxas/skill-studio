import {
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  type AiModel,
  type AiProviderId,
  type AiProviderInfo,
  ANTHROPIC_MODELS,
} from '@domain/ai.ts'
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

/** Every provider as it stands now: connected or not, and the models it offers. */
export function aiProviderInfo(): Promise<AiProviderInfo[]> {
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
      // A CLI that cannot say who it is stays usable, as it was before it could.
      const account = (await provider.account?.().catch(() => null)) ?? null
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

export type { AiMessage } from './types.ts'
