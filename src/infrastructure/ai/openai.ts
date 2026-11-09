/**
 * OpenAI's models through the Responses API, with the writer's own key.
 * Replies stream and a field's shape is enforced by a strict JSON schema. The
 * key's own model list says what can be called; OpenAI does not say what each
 * model is for, so the domain's rules pick the ones that hold a conversation.
 */
import { type AiModel, type Effort, isOpenAiChatModel, openAiEfforts } from '@domain/ai.ts'
import { secretOf } from '@domain/secrets.ts'
import OpenAI from 'openai'
import { imageBase64 } from '../images.ts'
import { keyed } from './keyed.ts'
import { type AiMessage, type AiProvider, type AiRequest, ProviderError } from './types.ts'

const key = (): string | undefined => secretOf('openai', process.env)
const client = keyed(key, (apiKey) => new OpenAI({ apiKey }))

function explain(error: unknown): Error {
  if (error instanceof OpenAI.AuthenticationError)
    return new Error('OpenAI refused the API key. Check it in Settings.')
  if (error instanceof OpenAI.PermissionDeniedError)
    return new Error('This OpenAI key may not use that model.')
  if (error instanceof OpenAI.NotFoundError)
    return new Error('OpenAI does not know that model. Pick another.')
  if (error instanceof OpenAI.RateLimitError)
    return new Error('OpenAI is rate limiting this key, or it is out of credit. Try again later.')
  if (error instanceof OpenAI.APIConnectionError)
    return new Error('Could not reach OpenAI. Check the connection and try again.')
  if (error instanceof OpenAI.APIError) return new Error(`OpenAI: ${error.message}`)
  return error instanceof Error ? error : new Error(String(error))
}

/** A plain `gpt-5.5` before its `-mini` and dated forms: the flagship reads first. */
const isBase = (id: string): boolean => /^gpt-[\d.]+$/.test(id)

async function listModels(): Promise<AiModel[]> {
  const found: Array<{ id: string; created: number }> = []
  for await (const model of client().models.list())
    if (isOpenAiChatModel(model.id)) found.push({ id: model.id, created: model.created })
  return found
    .sort((a, b) => Number(isBase(b.id)) - Number(isBase(a.id)) || b.created - a.created)
    .map(({ id }) => ({ id, label: id, efforts: openAiEfforts(id) }))
}

const models = keyed(key, () => listModels())

/** A message as the Responses API takes it: plain text, or its text and its pictures as data URLs. */
const inputOf = (message: AiMessage) =>
  message.role === 'user' && message.images?.length
    ? {
        role: message.role,
        content: [
          ...(message.text ? [{ type: 'input_text' as const, text: message.text }] : []),
          ...message.images.map((image) => ({
            type: 'input_image' as const,
            image_url: `data:${image.type};base64,${imageBase64(image)}`,
            detail: 'auto' as const,
          })),
        ],
      }
    : { role: message.role, content: message.text }

async function run(request: AiRequest) {
  const stream = client().responses.stream(
    {
      model: request.model,
      instructions: request.system,
      input: request.messages.map(inputOf),
      store: false,
      ...(request.effort ? { reasoning: { effort: request.effort as Effort } } : {}),
      ...(request.schema
        ? {
            text: {
              format: { type: 'json_schema', name: 'field', schema: request.schema, strict: true },
            },
          }
        : {}),
    },
    { signal: request.signal },
  )
  let text = ''
  let refusal = ''
  for await (const event of stream) {
    if (event.type === 'response.output_text.delta') {
      text += event.delta
      request.onText(text)
    } else if (event.type === 'response.refusal.delta') refusal += event.delta
  }
  const response = await stream.finalResponse()
  const usage = {
    input: response.usage?.input_tokens ?? 0,
    output: response.usage?.output_tokens ?? 0,
  }
  // Billed either way: the error carries the usage so it is still recorded.
  if (refusal)
    throw new ProviderError(`The model declined this request: ${refusal}`, usage, response.model)
  if (response.status === 'incomplete')
    throw new ProviderError(
      response.incomplete_details?.reason === 'max_output_tokens'
        ? 'The reply ran past the length limit. Ask for something shorter.'
        : 'The reply stopped before it was complete. Try again.',
      usage,
      response.model,
    )
  return { text: response.output_text || text, model: response.model, usage }
}

export const openaiProvider: AiProvider = {
  id: 'openai',
  connected: () => Boolean(key()),
  models: () => models().catch((error) => Promise.reject(explain(error))),
  run: (request) => run(request).catch((error) => Promise.reject(explain(error))),
}
