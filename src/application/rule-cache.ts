/**
 * `rule-judge-cache.json`, in the app's own folder: what Jev answered about a
 * rule, so Auto refine, Suggest changes, Help me improve and Fix with AI ask
 * nothing Jev has answered before, after a restart too.
 *
 * - Each answer is kept under a hash of everything it rests on: where Jev was
 *   asked, the model, the state exactly as it was sent (the rule, the lines
 *   beside it, the skill's description, and a rewrite or the writer's reply
 *   where one was asked about), and the question's own words. Change any of
 *   them and the question is asked again. Jev answers each question apart
 *   from the others, so a request asks only the questions it holds no answer to.
 * - The answer is kept as Jev gave it, never read against a threshold: every
 *   threshold is applied as an answer is read (`@domain/improve.ts`), so one
 *   changed later reads a kept answer anew.
 * - Nothing else is written: no rule, no reply, no key. The file keeps the
 *   `ANSWERS_MAX` answers used last, and the one used longest ago goes first.
 * - It is the app's, not a skill's: what Jev is asked names no skill, so one
 *   answer serves every copy of a rule, and nothing is added to a folder a
 *   person may commit.
 * - A file that does not read holds nothing, and one that cannot be written
 *   costs only the keeping: the answers are returned all the same.
 * - Under `ST_AI_RECORD` or `ST_AI_REPLAY` it is neither read nor written, so
 *   a recording holds every question, and a replay answers from its own files.
 */
import { join } from 'node:path'
import { readJson, writeJson } from '@infrastructure/fs.ts'
import { STUDIO_DIR } from '@infrastructure/library.ts'
import type { JevAsker, JevState, Usage } from '@judges/jev.ts'
import { hashOf, savedReplies, sha } from '@judges/replies.ts'
import type { Questions } from '@typesafe-ai/sdk'
import { usable } from './judge-cache.ts'

/** Where the answers are kept. */
const RULE_CACHE = join(STUDIO_DIR, 'rule-judge-cache.json')
/** The shape the file is written in. A file in another holds nothing. */
const VERSION = 1
/** How many answers the file keeps: about a hundred actions' worth, at some 20 answers each. */
export const ANSWERS_MAX = 2_000

interface Entry {
  /** Jev's answer, as it came. */
  answer: unknown
  /** When it was last kept or read, as an ISO time. */
  used: string
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** Where Jev is asked, as the TypeSafe client reads it: another server may answer otherwise. */
const endpoint = (): string =>
  (process.env.TYPESAFE_BASE_URL?.trim() || 'https://api.typesafe.ai').replace(/\/+$/, '')

/**
 * The answers kept at `path` that can be read. A file that is not there, does
 * not parse, or is in another shape holds none; one that does not parse is
 * said, when `say` is set, and written over with the next answer kept.
 */
function readEntries(path: string, say: boolean): Map<string, Entry> {
  const entries = new Map<string, Entry>()
  let kept: unknown
  try {
    kept = readJson<unknown>(path, null)
  } catch (error) {
    if (say) console.warn(`${(error as Error).message} Jev is asked again.`)
    return entries
  }
  if (!isObject(kept) || kept.version !== VERSION || !isObject(kept.answers)) return entries
  for (const [key, entry] of Object.entries(kept.answers))
    if (isObject(entry) && usable(entry.answer))
      entries.set(key, {
        answer: entry.answer,
        used: typeof entry.used === 'string' ? entry.used : '',
      })
  return entries
}

/** When an entry was last used, as a number to sort by; one with no time that reads is the oldest. */
const usedAt = (entry: Entry): number => Date.parse(entry.used) || 0

/**
 * Write `fresh` over what is on disk now, which another copy of the app may
 * have added to since this one read it, keeping the `ANSWERS_MAX` used last.
 * The file is written whole, as the app writes JSON, so a reader finds the old
 * one or the new one. A file that cannot be written is said, and nothing else
 * comes of it.
 */
function keep(path: string, fresh: ReadonlyMap<string, Entry>): void {
  if (!fresh.size) return
  try {
    const entries = readEntries(path, false)
    for (const [key, entry] of fresh) entries.set(key, entry)
    const newest = [...entries]
      .sort(([a, x], [b, y]) => usedAt(y) - usedAt(x) || (a < b ? -1 : a > b ? 1 : 0))
      .slice(0, ANSWERS_MAX)
    writeJson(path, { version: VERSION, answers: Object.fromEntries(newest) })
  } catch (error) {
    console.warn(`Jev's answers about the rule could not be kept: ${(error as Error).message}`)
  }
}

/**
 * `jev` as the rule judge asks it, through the file at `path`: a question
 * answered before is not asked again, and the rest go in one request. Every
 * answer that came back is kept, so a request Jev answered in part costs only
 * the questions it left out. A request that fails, or is stopped, keeps
 * nothing. `usage`, when given, is told what was asked, never what was kept.
 * The answers come back in the order of `questions`.
 */
export function keptRuleJev(jev: JevAsker, path: string = RULE_CACHE): JevAsker {
  const ask = async (
    state: JevState,
    questions: Questions,
    signal?: AbortSignal,
    usage?: Usage,
  ): Promise<Record<string, unknown>> => {
    if (savedReplies())
      return (await jev.ask(state, questions, signal, usage)) as Record<string, unknown>
    const asked = [endpoint(), jev.model, hashOf(state)]
    const keyed = Object.entries(questions).map(([name, question]) => ({
      name,
      question,
      key: sha(JSON.stringify([...asked, hashOf(question)])),
    }))
    const held = readEntries(path, true)
    const used = new Date().toISOString()
    // What this request leaves in the file: every answer it read or was given, as used now.
    const keeping = new Map<string, Entry>()
    const answers = new Map<string, unknown>()
    const missing: typeof keyed = []
    for (const entry of keyed) {
      const kept = held.get(entry.key)
      if (!kept) missing.push(entry)
      else {
        answers.set(entry.name, kept.answer)
        keeping.set(entry.key, { answer: kept.answer, used })
      }
    }
    if (usage) usage.inputTokens = 0
    if (missing.length) {
      const spent: Usage = { inputTokens: 0 }
      const came = (await jev.ask(
        state,
        Object.fromEntries(missing.map((m) => [m.name, m.question])) as Questions,
        signal,
        spent,
      )) as Record<string, unknown>
      if (usage) usage.inputTokens = spent.inputTokens
      for (const { name, key } of missing) {
        if (!Object.hasOwn(came, name)) continue
        answers.set(name, came[name])
        // One that cannot be read is no answer: kept, it would fail every reading after.
        if (usable(came[name])) keeping.set(key, { answer: came[name], used })
      }
    }
    keep(path, keeping)
    return Object.fromEntries(
      keyed.filter(({ name }) => answers.has(name)).map(({ name }) => [name, answers.get(name)]),
    )
  }
  return { model: jev.model, ask: ask as JevAsker['ask'] }
}
