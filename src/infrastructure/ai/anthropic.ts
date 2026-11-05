/**
 * Claude through the Anthropic API, with the writer's own key. Replies stream;
 * a field's shape is enforced by structured outputs; the models and the effort
 * levels each takes come from the Models API, so a new model shows up without
 * a release of this app.
 */
import Anthropic from '@anthropic-ai/sdk'
import {
  type AiModel,
  ANTHROPIC_DEFAULT_MODEL,
  defaultFirst,
  EFFORTS,
  type Effort,
} from '@domain/ai.ts'
import { secretOf } from '@domain/secrets.ts'
import { keyed } from './keyed.ts'
import type { AiProvider, AiRequest } from './types.ts'

/** Room for a whole SKILL.md and the thinking before it; streamed, so no request times out. */
const MAX_TOKENS = 64_000

const key = (): string | undefined => secretOf('anthropic', process.env)
const client = keyed(key, (apiKey) => new Anthropic({ apiKey }))

/**
 * These models can decline a request their safety classifiers flag. The
 * server-side fallback retries such a request on the model Anthropic
 * recommends, inside the same call, so a false positive does not end the reply.
 */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01'
const declines = (model: string): boolean => /^claude-(fable-5|opus-5|sonnet-5-5)/.test(model)

/** An SDK error as a line the writer can act on. */
function explain(error: unknown): Error {
  if (error instanceof Anthropic.AuthenticationError)
    return new Error('Anthropic refused the API key. Check it in Settings.')
  if (error instanceof Anthropic.PermissionDeniedError)
    return new Error('This Anthropic key may not use that model.')
  if (error instanceof Anthropic.NotFoundError)
    return new Error('Anthropic does not know that model. Pick another.')
  if (error instanceof Anthropic.RateLimitError)
    return new Error('Anthropic is rate limiting this key. Wait a moment and try again.')
  if (error instanceof Anthropic.APIConnectionError)
    return new Error('Could not reach Anthropic. Check the connection and try again.')
  if (error instanceof Anthropic.APIError) return new Error(`Anthropic: ${error.message}`)
  return error instanceof Error ? error : new Error(String(error))
}

async function listModels(): Promise<AiModel[]> {
  const models: AiModel[] = []
  for await (const model of client().models.list()) {
    const capabilities = model.capabilities
    // The assistant fills fields through structured outputs; a model without them cannot.
    if (capabilities && !capabilities.structured_outputs.supported) continue
    const effort = capabilities?.effort
    models.push({
      id: model.id,
      label: model.display_name,
      efforts: effort?.supported ? EFFORTS.filter((level: Effort) => effort[level]?.supported) : [],
    })
  }
  return defaultFirst(models, ANTHROPIC_DEFAULT_MODEL)
}

const models = keyed(key, () => listModels())

async function run(request: AiRequest) {
  const fallback = declines(request.model)
  const stream = client().beta.messages.stream(
    {
      model: request.model,
      max_tokens: MAX_TOKENS,
      system: request.system,
      messages: request.messages.map((m) => ({ role: m.role, content: m.text })),
      output_config: {
        ...(request.effort ? { effort: request.effort as Effort } : {}),
        ...(request.schema ? { format: { type: 'json_schema', schema: request.schema } } : {}),
      },
      ...(fallback ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
    },
    { signal: request.signal },
  )
  let text = ''
  for await (const event of stream) {
    // A fallback model starts the reply again: what the first model wrote is dropped.
    if (event.type === 'content_block_start' && event.content_block.type === 'fallback') text = ''
    else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      text += event.delta.text
      request.onText(text)
    }
  }
  const message = await stream.finalMessage()
  if (message.stop_reason === 'refusal')
    throw new Error(
      `The model declined this request${
        message.stop_details?.explanation ? `: ${message.stop_details.explanation}` : '.'
      }`,
    )
  if (message.stop_reason === 'max_tokens')
    throw new Error('The reply ran past the length limit. Ask for something shorter.')
  return {
    text,
    model: message.model,
    usage: {
      input:
        message.usage.input_tokens +
        (message.usage.cache_read_input_tokens ?? 0) +
        (message.usage.cache_creation_input_tokens ?? 0),
      output: message.usage.output_tokens,
    },
  }
}

export const anthropicProvider: AiProvider = {
  id: 'anthropic',
  connected: () => Boolean(key()),
  models: () => models().catch((error) => Promise.reject(explain(error))),
  run: (request) => run(request).catch((error) => Promise.reject(explain(error))),
}
