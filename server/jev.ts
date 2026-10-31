/**
 * The Jev client: one TypeSafe client per grading run, counting input tokens
 * and recording the model that answered so every report carries both.
 */
import { type Questions, type SystemOneResult, TypeSafeClient } from '@typesafe-ai/sdk'

const DEFAULT_MODEL = 'jev-1.14.0'
const CONCURRENCY = 6

export type State = NonNullable<Parameters<TypeSafeClient['systemOne']>[0]['state']>

export class Jev {
  readonly model: string
  private client: TypeSafeClient | null = null
  inputTokens = 0
  calls = 0
  modelSeen: string | null = null

  constructor(model: string = DEFAULT_MODEL) {
    this.model = model
  }

  static available(): boolean {
    return Boolean(process.env.TYPESAFE_API_KEY)
  }

  async ask<const Q extends Questions>(
    state: State,
    questions: Q,
  ): Promise<SystemOneResult<Q>['answers']> {
    if (!Jev.available()) throw new Error('TYPESAFE_API_KEY is not set.')
    this.client ??= new TypeSafeClient({
      defaultModel: this.model,
      timeout: 60_000,
      logLevel: 'error',
    })
    const result = await this.client.systemOne({ state, questions })
    this.inputTokens += result.usage.input_tokens ?? 0
    this.calls += 1
    this.modelSeen = result.model
    return result.answers
  }

  /** Run `work` over `items` with a bounded number in flight, keeping order. */
  async pool<T, R>(items: T[], work: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length)
    let next = 0
    const worker = async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await work(items[i], i)
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker))
    return results
  }
}
