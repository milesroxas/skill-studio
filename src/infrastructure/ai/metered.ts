/**
 * A provider as the application reaches it: each reply counted to the meter
 * and written to the usage log, and a one-message reply saved or answered
 * from a saved one as `replies.ts` says. A session that reads a folder
 * (`readFolder`) is counted and logged, never saved, so a replay stops it.
 */
import type { AiUsage, UsageEntry } from '@domain/ai.ts'
import type { CallRecord } from '@domain/cost.ts'
import { countCall } from '@judges/meter.ts'
import {
  hashOf,
  MissingReply,
  neverReplayed,
  readSaved,
  savedReplies,
  sha,
  unanswered,
  writeSaved,
} from '@judges/replies.ts'
import { readImage } from '../images.ts'
import { type AiProvider, type AiReply, type AiRequest, ProviderError } from './types.ts'

/** A reply as it is saved: the reply, or the refusal of one that was billed. */
type SavedReply =
  | { operation: string; reply: AiReply }
  | { operation: string; error: { message: string; usage: AiUsage; model: string } }

/**
 * The key of a request's saved reply: everything sent, written the same way
 * every time, and a picture by its bytes, never by where it is on this machine.
 */
export const replyKey = (provider: string, request: AiRequest): string =>
  hashOf([
    provider,
    request.model,
    request.effort,
    request.system,
    request.turn ?? '',
    request.messages.map((m) => ({
      role: m.role,
      text: m.text,
      images: (m.images ?? []).map((image) => sha(readImage(image))),
    })),
    request.schema,
  ])

const seconds = (since: number): number => Math.round(performance.now() - since) / 1000

/** `provider`, counted and logged with `log`, and saved or replayed as the environment says. */
export function metered(provider: AiProvider, log: (entry: UsageEntry) => void): AiProvider {
  const count = (
    operation: CallRecord['operation'],
    reply: { model: string; usage: AiUsage },
    begun: number,
    source: CallRecord['source'],
  ) => {
    countCall({
      operation,
      provider: provider.id,
      model: reply.model,
      input: reply.usage.input,
      output: reply.usage.output,
      // A replayed reply took no time a gate could compare.
      seconds: source === 'replayed' ? 0 : seconds(begun),
      source,
    })
    if (source === 'replayed') return
    try {
      log({
        at: new Date().toISOString(),
        provider: provider.id,
        model: reply.model,
        ...reply.usage,
      })
    } catch (error) {
      // The log is a record beside the reply, never part of it.
      console.warn(`The usage log could not be written: ${(error as Error).message}`)
    }
  }

  /** Ask `ask`, count what it spent, refused or not, and hand back what it gave. */
  async function asked<R extends { operation: CallRecord['operation'] }>(
    request: R,
    ask: (request: R) => Promise<AiReply>,
    save: ((saved: SavedReply) => void) | null,
  ): Promise<AiReply> {
    const begun = performance.now()
    try {
      const reply = await ask(request)
      count(request.operation, reply, begun, 'asked')
      save?.({ operation: request.operation, reply })
      return reply
    } catch (error) {
      if (error instanceof ProviderError) {
        count(request.operation, error, begun, 'asked')
        save?.({
          operation: request.operation,
          error: { message: error.message, usage: error.usage, model: error.model },
        })
      }
      throw error
    }
  }

  async function run(request: AiRequest): Promise<AiReply> {
    const saved = savedReplies()
    if (!saved) return asked(request, provider.run, null)
    const key = replyKey(provider.id, request)
    if (saved.mode === 'record')
      return asked(request, provider.run, (reply) => writeSaved(saved.dir, provider.id, key, reply))
    const begun = performance.now()
    const held = readSaved<SavedReply>(saved.dir, provider.id, key)
    if (!held)
      throw unanswered(new MissingReply(request.operation, saved.dir, `${provider.id}/${key}.json`))
    if ('error' in held) {
      const { message, usage, model } = held.error
      count(request.operation, { model, usage }, begun, 'replayed')
      throw new ProviderError(message, usage, model)
    }
    count(request.operation, held.reply, begun, 'replayed')
    request.onText(held.reply.text)
    return held.reply
  }

  const readFolder = provider.readFolder
  return {
    ...provider,
    run,
    ...(readFolder
      ? {
          readFolder: async (request) => {
            neverReplayed('A --deep session')
            return asked(request, readFolder, null)
          },
        }
      : {}),
  }
}
