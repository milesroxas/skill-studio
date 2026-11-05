import {
  AI_PROVIDER_IDS,
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
      if (!provider.connected()) return { id, connected: false, problem: null, models: [] }
      try {
        return { id, connected: true, problem: null, models: await provider.models() }
      } catch (error) {
        return {
          id,
          connected: true,
          problem: (error as Error).message,
          models: [...(KNOWN_MODELS[id] ?? [])],
        }
      }
    }),
  )
}

export type { AiMessage } from './types.ts'
