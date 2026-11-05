/**
 * What the assistant keeps on disk, beside the preferences: the side panel's
 * conversation, so it is still there after a restart, and a log of what each
 * finished request spent.
 */
import { join } from 'node:path'
import type { ChatMessage, UsageEntry } from '@domain/ai.ts'
import { readJson, writeJson } from '../fs.ts'
import { STUDIO_DIR } from '../library.ts'

const CHAT = join(STUDIO_DIR, 'chat.json')
const USAGE = join(STUDIO_DIR, 'ai-usage.json')

/** The log keeps this many of the latest requests: months of use, and a file that stays small. */
const USAGE_KEPT = 5000

/** A stored list; a missing or damaged file reads as empty. */
function readList<T>(path: string): T[] {
  try {
    const value = readJson<unknown>(path, [])
    return Array.isArray(value) ? (value as T[]) : []
  } catch {
    return []
  }
}

export const readChat = (): ChatMessage[] => readList<ChatMessage>(CHAT)
export const writeChat = (messages: ChatMessage[]): void => writeJson(CHAT, messages)

export const readUsage = (): UsageEntry[] => readList<UsageEntry>(USAGE)
export const recordUsage = (entry: UsageEntry): void =>
  writeJson(USAGE, [...readUsage(), entry].slice(-USAGE_KEPT))
