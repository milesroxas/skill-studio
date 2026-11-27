/**
 * Saved replies. With `ST_AI_RECORD=<dir>`, each one-message reply and each
 * Jev answer is written to a file named by the key of what was sent. With
 * `ST_AI_REPLAY=<dir>`, the call is answered from that file and asks nobody,
 * and a call with no file stops with its operation and key. Nothing in a key
 * names a folder on this machine, so a reply saved from one copy of a skill
 * answers another.
 */
import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { Operation } from '@domain/cost.ts'
import { countMissing } from './meter.ts'

export const sha = (text: string | Uint8Array): string =>
  createHash('sha256').update(text).digest('hex')

/** Marks the SDK puts on its pictures and on text that holds them, across copies of it. */
const IMAGE = Symbol.for('@typesafe-ai/sdk/image')
const TEXT_WITH_ASSETS = Symbol.for('@typesafe-ai/sdk/text-with-assets')
/** How the SDK refers to a picture inside text. */
const REFERENCE = /<image:[0-9a-f]+>/g

/**
 * `value` as it is hashed: a picture by the hash of its bytes, where the SDK
 * writes a reference made up afresh for every picture read, and text that
 * holds a picture with that hash in place of its reference. An object's keys
 * are sorted. A picture whose bytes are not at hand yet (a `Blob`) is given a
 * key of its own, so it is never taken for another.
 */
function canonical(value: unknown, refs: Map<string, string>): unknown {
  if (value === null || typeof value !== 'object') return value
  const marked = value as Record<symbol, unknown>
  if (marked[IMAGE]) {
    const data = (value as { data?: unknown }).data
    const hash = data instanceof Uint8Array ? sha(data) : `unread:${Math.random()}`
    refs.set(String(value), hash)
    return { image: hash }
  }
  if (marked[TEXT_WITH_ASSETS]) {
    const { text, assets } = value as { text: string; assets: unknown[] }
    for (const asset of assets) canonical(asset, refs)
    return { text: text.replace(REFERENCE, (ref) => `<image:${refs.get(ref) ?? ref}>`) }
  }
  if (Array.isArray(value)) return value.map((item) => canonical(item, refs))
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical((value as Record<string, unknown>)[key], refs)]),
  )
}

/** The hash of `value` as `canonical` writes it. */
export const hashOf = (value: unknown): string => sha(JSON.stringify(canonical(value, new Map())))

/** Where replies are saved to or answered from, as the environment says; null for neither. */
export function savedReplies(): { mode: 'record' | 'replay'; dir: string } | null {
  const replay = process.env.ST_AI_REPLAY
  if (replay) return { mode: 'replay', dir: resolve(replay) }
  const record = process.env.ST_AI_RECORD
  return record ? { mode: 'record', dir: resolve(record) } : null
}

/** A replay found no saved reply for a call: what was asked differs from what was saved. */
export class MissingReply extends Error {
  constructor(operation: Operation, dir: string, what: string) {
    super(`No saved reply for ${operation} in ${dir}: ${what}.`)
    this.name = 'MissingReply'
  }
}

/** `error`, a call a replay cannot answer, counted to the meters so the command stops with it. */
export function unanswered<E extends Error>(error: E): E {
  countMissing(error.message)
  return error
}

/** Throws, counted, when a replay is on: a call that is never saved cannot be answered from one. */
export function neverReplayed(what: string): void {
  if (savedReplies()?.mode === 'replay')
    throw unanswered(new Error(`${what} is never saved, so a replay cannot answer it.`))
}

/** The `ST_AI_REPLAY_LOG` that could not be written, said once. */
let unwritable: string | null = null

/**
 * Under a replay, note a saved reply it answered from, as `<folder>/<key>.json`
 * and, for one of Jev's, `#<question's key>`: a line each in the file
 * `ST_AI_REPLAY_LOG` names, when it names one, its folder made if need be. So
 * a test can hold every reply kept to being read, and none lies there unused.
 * Noting never fails the call: a file that cannot be written is said once, on
 * stderr, and nothing more is noted.
 */
export function noteReplayed(what: string): void {
  const log = process.env.ST_AI_REPLAY_LOG
  if (!log || unwritable === log) return
  try {
    mkdirSync(dirname(resolve(log)), { recursive: true })
    appendFileSync(log, `${what}\n`)
  } catch (error) {
    unwritable = log
    process.stderr.write(
      `ST_AI_REPLAY_LOG cannot be written, so the replies read are not noted: ${(error as Error).message}\n`,
    )
  }
}

/** The file `<dir>/<folder>/<key>.json`, read; undefined when there is none. */
export function readSaved<T>(dir: string, folder: string, key: string): T | undefined {
  try {
    return JSON.parse(readFileSync(join(dir, folder, `${key}.json`), 'utf8')) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

/** Write `<dir>/<folder>/<key>.json` whole: to a temporary file that then takes its name. */
export function writeSaved(dir: string, folder: string, key: string, value: unknown): void {
  const into = join(dir, folder)
  mkdirSync(into, { recursive: true })
  const path = join(into, `${key}.json`)
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(temporary, path)
}
