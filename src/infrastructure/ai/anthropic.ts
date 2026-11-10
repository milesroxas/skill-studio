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
import { imageBase64 } from '../images.ts'
import { explain as explainFor } from './explain.ts'
import { keyed } from './keyed.ts'
import { type AiMessage, type AiProvider, type AiRequest, ProviderError } from './types.ts'

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

const explain = (error: unknown): Error =>
  explainFor('Anthropic', Anthropic, error, '. Wait a moment and try again.')

/**
 * The most each model may write in one reply, as the Models API lists it. A
 * request that asks for more is refused, and older models allow less than
 * `MAX_TOKENS`.
 */
const outputLimits = new Map<string, number>()

/** What to ask for: `MAX_TOKENS`, or the model's own limit when it is known and lower. */
export const maxTokensWithin = (limit: number | null | undefined): number =>
  Math.min(MAX_TOKENS, limit || MAX_TOKENS)

async function listModels(): Promise<AiModel[]> {
  const models: AiModel[] = []
  for await (const model of client().models.list()) {
    const capabilities = model.capabilities
    // The assistant fills fields through structured outputs; a model without them cannot.
    if (capabilities && !capabilities.structured_outputs.supported) continue
    const effort = capabilities?.effort
    if (model.max_tokens) outputLimits.set(model.id, model.max_tokens)
    models.push({
      id: model.id,
      label: model.display_name,
      efforts: effort?.supported ? EFFORTS.filter((level: Effort) => effort[level]?.supported) : [],
    })
  }
  return defaultFirst(models, ANTHROPIC_DEFAULT_MODEL)
}

const models = keyed(key, () => listModels())

type ImageType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

/** A message as the API takes it: plain text, or its pictures and then its text. */
const contentOf = (message: AiMessage) =>
  message.images?.length
    ? [
        ...message.images.map((image) => ({
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: image.type as ImageType,
            data: imageBase64(image),
          },
        })),
        // The API refuses an empty text block, so a message of pictures alone has none.
        ...(message.text ? [{ type: 'text' as const, text: message.text }] : []),
      ]
    : message.text

async function run(request: AiRequest) {
  const fallback = declines(request.model)
  const stream = client().beta.messages.stream(
    {
      model: request.model,
      max_tokens: maxTokensWithin(outputLimits.get(request.model)),
      // The system prompt carries the whole skill and is the same from one turn
      // to the next, so it is cached: a turn reads it at the cached rate.
      ...(request.system
        ? {
            system: [
              {
                type: 'text' as const,
                text: request.system,
                cache_control: { type: 'ephemeral' as const },
              },
            ],
          }
        : {}),
      messages: request.messages.map((m) => ({ role: m.role, content: contentOf(m) })),
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
  const usage = {
    input:
      message.usage.input_tokens +
      (message.usage.cache_read_input_tokens ?? 0) +
      (message.usage.cache_creation_input_tokens ?? 0),
    output: message.usage.output_tokens,
  }
  // Billed either way: the error carries the usage so it is still recorded.
  if (message.stop_reason === 'refusal')
    throw new ProviderError(
      `The model declined this request${
        message.stop_details?.explanation ? `: ${message.stop_details.explanation}` : '.'
      }`,
      usage,
      message.model,
    )
  if (message.stop_reason === 'max_tokens')
    throw new ProviderError(
      'The reply ran past the length limit. Ask for something shorter.',
      usage,
      message.model,
    )
  return { text, model: message.model, usage }
}

export const anthropicProvider: AiProvider = {
  id: 'anthropic',
  connected: () => Boolean(key()),
  models: () => models().catch((error) => Promise.reject(explain(error))),
  run: (request) => run(request).catch((error) => Promise.reject(explain(error))),
}
