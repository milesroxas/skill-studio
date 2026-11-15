/**
 * `judge-cache.json`: what Jev answered, kept beside `report.json` so a grading
 * asks only what changed. It holds two things.
 *
 * - Each question's answer, by a hash of everything the answer rests on: the
 *   model, the pack and the version of its questions, the state the question
 *   was asked of, exactly as it was sent (the output, its pictures by their
 *   bytes, the notes, the files, the skill), and the question's own words. Jev
 *   answers each question apart from the others, so a question added beside
 *   them asks that question alone, and one moved or renamed asks nothing.
 * - Each pack's whole reading of an output, by `judgeKey` in grade.ts, with the
 *   questions it rests on: an output nothing changed in is read again without
 *   running the pack.
 *
 * Each entry keeps the grading that last used it, and the file keeps four
 * gradings' worth.
 */
import { createHash } from 'node:crypto'
import { readJson, writeJson } from '@infrastructure/fs.ts'
import type { JevAsker, JevState, Usage } from '@judges/jev.ts'
import type { Questions } from '@typesafe-ai/sdk'

/** The shape the file is written in. A file without it is from an earlier version. */
const VERSION = 2
/** How many gradings' worth of answers the file keeps. */
const GRADINGS = 4

/** A pack's reading of one output, and the answers it rests on. */
interface PackEntry {
  raw: unknown
  /** The answers' keys: what the reading cost is counted from them. */
  keys: string[]
  /** The grading that last used it. */
  g: number
}

/** One question's answer. */
interface AnswerEntry {
  answer: unknown
  /** Its share of the input tokens of the request it came in: the request's, split evenly over its questions. */
  tokens: number
  g: number
}

interface CacheFile {
  version: typeof VERSION
  /** The last grading that used the file. */
  generation: number
  packs: Record<string, PackEntry>
  answers: Record<string, AnswerEntry>
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const sha = (text: string | Uint8Array): string => createHash('sha256').update(text).digest('hex')

/**
 * The file at `path`, as entries that read. A file from an earlier version
 * held each pack's reading under the same key `judgeKey` makes now, and those
 * are kept with no answers under them, so they count no tokens. A damaged file
 * holds nothing.
 */
function readFile(path: string): CacheFile {
  const empty: CacheFile = { version: VERSION, generation: 0, packs: {}, answers: {} }
  let kept: unknown
  try {
    kept = readJson<unknown>(path, null)
  } catch (error) {
    console.warn((error as Error).message)
    return empty
  }
  if (!isObject(kept)) return empty
  if (kept.version !== VERSION)
    return {
      ...empty,
      packs: Object.fromEntries(
        Object.entries(kept).map(([key, raw]) => [key, { raw, keys: [], g: 0 }]),
      ),
    }
  const generation =
    typeof kept.generation === 'number' && Number.isFinite(kept.generation) ? kept.generation : 0
  const packs: Record<string, PackEntry> = {}
  for (const [key, entry] of Object.entries(isObject(kept.packs) ? kept.packs : {})) {
    if (!isObject(entry) || !Object.hasOwn(entry, 'raw')) continue
    const keys = Array.isArray(entry.keys)
      ? entry.keys.filter((k): k is string => typeof k === 'string')
      : []
    packs[key] = { raw: entry.raw, keys, g: typeof entry.g === 'number' ? entry.g : 0 }
  }
  const answers: Record<string, AnswerEntry> = {}
  for (const [key, entry] of Object.entries(isObject(kept.answers) ? kept.answers : {})) {
    if (!isObject(entry) || !usable(entry.answer)) continue
    answers[key] = {
      answer: entry.answer,
      tokens: typeof entry.tokens === 'number' && entry.tokens >= 0 ? entry.tokens : 0,
      g: typeof entry.g === 'number' ? entry.g : 0,
    }
  }
  return { version: VERSION, generation, packs, answers }
}

/**
 * An answer that can be read: an object with the number Jev gave. One that is
 * not is no answer, and is asked again; kept, it would fail every grading.
 */
function usable(answer: unknown): boolean {
  if (!isObject(answer)) return false
  return ['noul', 'score'].some((field) => {
    const value = answer[field]
    return typeof value === 'number' && Number.isFinite(value)
  })
}

/** One grading's view of the cache: what was kept, and what this grading keeps. */
export class JudgeCache {
  private readonly old: CacheFile
  /** This grading's number: one past the last that used the file. */
  private readonly generation: number
  private readonly packs = new Map<string, PackEntry>()
  private readonly answers = new Map<string, AnswerEntry>()
  /** The answers the grading's report rests on, each once, whether asked now or kept. */
  readonly used = new Set<string>()

  constructor(path: string) {
    this.old = readFile(path)
    this.generation = this.old.generation + 1
  }

  /** A pack's reading kept under `key`, used again by this grading; undefined when none is. */
  pack(key: string): { raw: unknown; keys: string[] } | undefined {
    const entry =
      this.packs.get(key) ?? (Object.hasOwn(this.old.packs, key) ? this.old.packs[key] : undefined)
    if (!entry) return undefined
    this.keepPack(key, entry.raw, entry.keys)
    // The answers it rests on are this grading's too, so they are kept as long as it is.
    for (const k of entry.keys) {
      const answer = this.answer(k)
      if (answer !== undefined) this.used.add(k)
    }
    return entry
  }

  keepPack(key: string, raw: unknown, keys: readonly string[]): void {
    this.packs.set(key, { raw, keys: [...new Set(keys)], g: this.generation })
  }

  /** The answer kept under `key`, used again by this grading; undefined when none is. */
  answer(key: string): unknown {
    const entry =
      this.answers.get(key) ??
      (Object.hasOwn(this.old.answers, key) ? this.old.answers[key] : undefined)
    if (!entry) return undefined
    this.answers.set(key, { ...entry, g: this.generation })
    return entry.answer
  }

  /** Keep an answer that came back. One that cannot be read is not kept, so it is asked again. */
  keepAnswer(key: string, answer: unknown, tokens: number): boolean {
    if (!usable(answer)) return false
    this.answers.set(key, { answer, tokens, g: this.generation })
    return true
  }

  /**
   * The input tokens of every answer the report rests on, each counted once,
   * whether this grading asked it or kept it: what the answers cost in all.
   */
  tokens(): number {
    let sum = 0
    for (const key of this.used) sum += this.answers.get(key)?.tokens ?? 0
    return Math.round(sum)
  }

  /** Whether this grading used or kept anything, so the file has something to write. */
  get touched(): boolean {
    return this.packs.size > 0 || this.answers.size > 0
  }

  /** Whether there is anything to write: this grading's entries, or kept ones. */
  get holds(): boolean {
    return (
      this.touched ||
      Object.keys(this.old.packs).length > 0 ||
      Object.keys(this.old.answers).length > 0
    )
  }

  /**
   * Write the file: the entries kept with this grading's over them, and
   * nothing older than four gradings. A grading that used nothing, as one
   * without Jev may, changes no entry's age, so it costs no answer.
   */
  write(path: string): void {
    const generation = this.touched ? this.generation : this.old.generation
    const packs: Record<string, PackEntry> = { ...this.old.packs }
    const answers: Record<string, AnswerEntry> = { ...this.old.answers }
    for (const [key, entry] of this.packs) packs[key] = { ...entry, g: generation }
    for (const [key, entry] of this.answers) answers[key] = { ...entry, g: generation }
    const recent = <E extends { g: number }>(entries: Record<string, E>) =>
      Object.fromEntries(Object.entries(entries).filter(([, e]) => e.g > generation - GRADINGS))
    const file: CacheFile = {
      version: VERSION,
      generation,
      packs: recent(packs),
      answers: recent(answers),
    }
    writeJson(path, file)
  }
}

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
const hashOf = (value: unknown): string => sha(JSON.stringify(canonical(value, new Map())))

/** What one output's questions cost this grading: how many were asked, and how many were kept. */
export interface Asked {
  asked: number
  kept: number
}

/**
 * Asks `jev` as `pack` asks it, through `cache`: each question whose answer is
 * kept is not asked, and the rest go in one request. Every answer that came
 * back is kept as it comes, so a request that fails beside it, or a question
 * left unanswered, costs only its own. `keys` collects the key of every answer
 * the pack's reading rests on; `counts` how many were asked and kept.
 */
export function cachedAsker(
  jev: JevAsker,
  cache: JudgeCache,
  pack: { id: string; version: number },
  keys: string[],
  counts: Asked,
): JevAsker {
  const ask = async (
    state: JevState,
    questions: Questions,
    signal?: AbortSignal,
    usage?: Usage,
  ): Promise<Record<string, unknown>> => {
    const asked = hashOf(state)
    const keyed = Object.entries(questions).map(([name, question]) => ({
      name,
      question,
      key: sha(JSON.stringify([jev.model, pack.id, pack.version, asked, hashOf(question)])),
    }))
    const answers: Record<string, unknown> = {}
    const missing: typeof keyed = []
    for (const entry of keyed) {
      const kept = cache.answer(entry.key)
      if (kept === undefined) missing.push(entry)
      else {
        answers[entry.name] = kept
        keys.push(entry.key)
        cache.used.add(entry.key)
        counts.kept += 1
      }
    }
    if (usage) usage.inputTokens = 0
    if (!missing.length) return answers
    const spent: Usage = { inputTokens: 0 }
    const came = (await jev.ask(
      state,
      Object.fromEntries(missing.map((m) => [m.name, m.question])) as Questions,
      signal,
      spent,
    )) as Record<string, unknown>
    counts.asked += missing.length
    if (usage) usage.inputTokens = spent.inputTokens
    const share = spent.inputTokens / missing.length
    for (const { name, key } of missing) {
      if (!Object.hasOwn(came, name)) continue
      answers[name] = came[name]
      if (cache.keepAnswer(key, came[name], share)) {
        keys.push(key)
        cache.used.add(key)
      }
    }
    return answers
  }
  return { model: jev.model, ask: ask as JevAsker['ask'] }
}
