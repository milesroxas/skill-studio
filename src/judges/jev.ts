/**
 * The Jev client: one TypeSafe client per grading run, counting input tokens
 * and recording the model that answered so every report carries both.
 */
import {
  AuthenticationError,
  PermissionDeniedError,
  type Questions,
  type SystemOneResult,
  TypeSafeClient,
} from '@typesafe-ai/sdk'
import { holdsImage } from './images.ts'

const DEFAULT_MODEL = 'jev-1.14.0'
const CONCURRENCY = 6

/**
 * Pictures are a preview feature of the API: a request that holds one is
 * refused with a 400 unless it says so with this header. Sent only with such
 * a request, so a text question never opts in to a preview.
 */
const IMAGES_HEADER = { 'TypeSafe-Danger-Zone-Images': 'true' }

export type JevState = NonNullable<Parameters<TypeSafeClient['systemOne']>[0]['state']>

/** TypeSafe refused the key: it is missing, wrong, or may not do this. */
export const isAuthError = (error: unknown): boolean =>
  error instanceof AuthenticationError || error instanceof PermissionDeniedError

export class Jev {
  readonly model: string
  private client: TypeSafeClient | null = null
  /** The key the client was built with. A key changed in Settings builds a new one. */
  private key: string | undefined
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
    state: JevState,
    questions: Q,
  ): Promise<SystemOneResult<Q>['answers']> {
    const key = process.env.TYPESAFE_API_KEY
    if (!key) throw new Error('No TypeSafe key is set, so Jev cannot judge.')
    if (!this.client || this.key !== key) {
      this.client = new TypeSafeClient({
        apiKey: key,
        defaultModel: this.model,
        timeout: 60_000,
        logLevel: 'error',
      })
      this.key = key
    }
    const result = await this.client.systemOne(
      { state, questions },
      holdsImage(state) || holdsImage(questions) ? { headers: IMAGES_HEADER } : undefined,
    )
    this.inputTokens += result.usage.input_tokens ?? 0
    this.calls += 1
    this.modelSeen = result.model
    return result.answers
  }

  /**
   * Run `work` over `items` with a bounded number in flight, keeping order.
   * When one fails, no further item is started, so a pack that has already
   * failed asks Jev nothing more.
   */
  async pool<T, R>(items: T[], work: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length)
    let next = 0
    // One failure fails the whole reading: the others finish the call they are in and start no more.
    let failed = false
    const worker = async () => {
      while (next < items.length && !failed) {
        const i = next++
        try {
          results[i] = await work(items[i], i)
        } catch (error) {
          failed = true
          throw error
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker))
    return results
  }
}
