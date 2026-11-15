/**
 * The cases a run answered, kept with the run. A run copies its cases into
 * `_cases.json` as it starts, each with a fingerprint of what the agents were
 * asked. So an edit to a case's prompt or files, a deleted case, or an id used
 * again for another case never changes what an old run is read against, and
 * two runs are compared on a case only when both were asked the same thing.
 *
 * A case's checks and settings are the yardstick, not the request: they are
 * read as they are now while the case still asks what the run was asked, so a
 * check added since is marked on the next grading. A grading keeps a
 * fingerprint of the yardstick it used, which tells one made before the case
 * changed from one made since.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { checkWeight } from '@domain/case-draft.ts'
import { fingerprint, sameFingerprint } from '@domain/fingerprint.ts'
import type { Case, CaseSettings, Grader } from '@domain/schemas.ts'
import type { RunCase } from '@domain/views.ts'
import { caseBench } from './cases.ts'
import { assertInside, isFile, isSafeName, readJson, writeJson } from './fs.ts'

/** Where a run keeps its copy of the cases it answered. */
export const CASES_FILE = '_cases.json'

/** What a run kept of one case as it started. */
export interface KeptCase {
  /** A fingerprint of what the agents were asked (`askOf`). */
  ask: string
  case: Case
}

const sha = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex')

/** What a file hashes to when it is not there, or a link leads out of the skill to it. */
const MISSING = 'missing'

/** Each file's hash as last read, by path, with the size, times and inode it had then. */
const hashes = new Map<string, { print: string; hash: string }>()
/** More files than any one skill's cases hold; past it every reading goes. */
const HASHES_KEPT = 5000

/**
 * The hash of a file's bytes, or `MISSING`. A file that has not changed since
 * it was last read is not read again, so fingerprinting a skill's cases on
 * every listing costs a `stat` per file.
 */
function fileHash(root: string, path: string): string {
  try {
    if (!isFile(assertInside(root, path))) return MISSING
    const { size, mtimeMs, ctimeMs, ino } = statSync(path)
    const print = `${size}:${mtimeMs}:${ctimeMs}:${ino}`
    const held = hashes.get(path)
    if (held?.print === print) return held.hash
    const hash = sha(readFileSync(path))
    if (hashes.size >= HASHES_KEPT) hashes.clear()
    hashes.set(path, { print, hash })
    return hash
  } catch {
    return MISSING
  }
}

/** A value as JSON with its keys in order, so two settings that say the same hash the same. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  )

/**
 * A fingerprint of what a case asks an agent: its prompt, and each input file
 * by name and bytes, then the tools it may use and how long it may take. A
 * file of the case's own `files/` folder goes by its path inside it, so moving
 * the case's folder asks nothing new. A run made before the settings were part
 * of it kept the first part alone (`sameFingerprint`).
 */
export function askOf(
  skillDir: string,
  testCase: Pick<Case, 'prompt' | 'files' | 'dir'> & {
    settings: Pick<CaseSettings, 'allowedTools' | 'timeoutSeconds'>
  },
): string {
  const own = testCase.dir ? `${testCase.dir}/files/` : null
  const files = testCase.files
    .map((rel) => [
      own && rel.startsWith(own) ? rel.slice(own.length) : rel,
      fileHash(skillDir, join(skillDir, rel)),
    ])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const tools = testCase.settings.allowedTools
  return fingerprint(
    sha(JSON.stringify([testCase.prompt.trim(), files])),
    sha(
      canonical({
        allowedTools: tools ? [...tools].sort() : null,
        timeoutSeconds: testCase.settings.timeoutSeconds,
      }),
    ),
  )
}

/**
 * A fingerprint of what a case holds an output to: each check by its words,
 * its weight and the bytes of its picture, and the case's settings (its
 * length, its size, the file to grade, its check command), then the turns and
 * the time the workflow pack holds a run to. The order of the checks and the
 * names of their files are no part of it. A grading made before the turns and
 * the time were part of it kept the first part alone (`sameFingerprint`).
 */
export function yardstickOf(
  skillDir: string,
  testCase: Pick<Case, 'graders' | 'bench'> & {
    settings: Pick<CaseSettings, 'maxTurns' | 'timeoutSeconds'>
  },
): string {
  const checks = testCase.graders
    .map((grader) =>
      JSON.stringify([
        grader.statement.trim(),
        grader.weight,
        grader.image ? fileHash(skillDir, join(skillDir, grader.image)) : null,
      ]),
    )
    .sort()
  return fingerprint(
    sha(canonical([checks, testCase.bench])),
    sha(
      canonical({
        maxTurns: testCase.settings.maxTurns,
        timeoutSeconds: testCase.settings.timeoutSeconds,
      }),
    ),
  )
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback

const positive = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null

function gradersOf(value: unknown): Grader[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw): Grader[] => {
    if (!raw || typeof raw !== 'object' || typeof raw.statement !== 'string') return []
    return [
      {
        id: text(raw.id),
        type: text(raw.type, 'llm'),
        focus: typeof raw.focus === 'string' ? raw.focus : null,
        weight: checkWeight(positive(raw.weight)) ?? 1,
        statement: raw.statement,
        image: typeof raw.image === 'string' ? raw.image : null,
      },
    ]
  })
}

function settingsOf(value: unknown): CaseSettings {
  const raw: Record<string, unknown> = value && typeof value === 'object' ? { ...value } : {}
  return {
    tags: strings(raw.tags),
    maxTurns: positive(raw.maxTurns),
    timeoutSeconds: positive(raw.timeoutSeconds),
    allowedTools: Array.isArray(raw.allowedTools) ? strings(raw.allowedTools) : null,
  }
}

/**
 * One entry of `_cases.json` as a case every reader can use with no check of
 * its own; null for an entry that names no case. The file is the app's, but
 * it sits in a folder anyone may edit.
 */
function keptOf(raw: unknown, where: string): KeptCase | null {
  if (!raw || typeof raw !== 'object') return null
  const { ask, case: held } = raw as { ask?: unknown; case?: Record<string, unknown> }
  if (typeof ask !== 'string' || !held || typeof held !== 'object') return null
  if (typeof held.id !== 'string' || !isSafeName(held.id) || typeof held.prompt !== 'string')
    return null
  return {
    ask,
    case: {
      id: held.id,
      legacyId:
        typeof held.legacyId === 'string' || typeof held.legacyId === 'number'
          ? held.legacyId
          : null,
      title: text(held.title, held.id),
      prompt: held.prompt,
      expectedOutcome: text(held.expectedOutcome),
      files: strings(held.files),
      graders: gradersOf(held.graders),
      settings: settingsOf(held.settings),
      bench: caseBench(held.bench, where),
      source: held.source === 'evals.json' ? 'evals.json' : 'folder',
      dir: typeof held.dir === 'string' ? held.dir : null,
    },
  }
}

/** Keep `cases` with the run in `runDir`, each with what it asks as the run starts. */
export function keepCases(skillDir: string, runDir: string, cases: readonly Case[]): void {
  const kept: KeptCase[] = cases.map((testCase) => ({
    ask: askOf(skillDir, testCase),
    case: testCase,
  }))
  writeJson(join(runDir, CASES_FILE), kept)
}

/** What a run kept of its cases, as read. */
export interface KeptRead {
  /** The cases it kept; null for a run that kept none, or whose file holds no list. */
  kept: KeptCase[] | null
  /**
   * The run kept its cases and the file does not read whole: it does not
   * parse, holds no list, has an entry that names no case, or lacks a case
   * the run answered (`answered`). Each case without a kept copy is read as
   * it is now. False for a run made before runs kept their cases.
   */
  damaged: boolean
}

/**
 * The cases the run in `runDir` kept, and whether its file is damaged.
 * `answered` is the ids `run.json` says the run answered, when known.
 */
export function readKept(runDir: string, answered: readonly string[] = []): KeptRead {
  const path = join(runDir, CASES_FILE)
  if (!existsSync(path)) return { kept: null, damaged: false }
  let raw: unknown
  try {
    raw = readJson<unknown>(path, null)
  } catch (error) {
    console.warn((error as Error).message)
    return { kept: null, damaged: true }
  }
  if (!Array.isArray(raw)) {
    console.warn(`${path} holds no list of cases.`)
    return { kept: null, damaged: true }
  }
  const kept = raw.flatMap((entry) => keptOf(entry, path) ?? [])
  const ids = new Set(kept.map((entry) => entry.case.id))
  const damaged = kept.length < raw.length || answered.some((id) => !ids.has(id))
  if (damaged) console.warn(`${path} does not hold every case the run answered.`)
  return { kept, damaged }
}

/**
 * The cases the run in `runDir` kept; null for a run that kept none, which is
 * one made before runs kept their cases, or whose file holds no list. Such a
 * run is read against the cases as they are now.
 */
export const keptCases = (runDir: string): KeptCase[] | null => readKept(runDir).kept

/** A case as a run takes it, with the case its grading reads. */
export interface TakenCase extends RunCase {
  case: Case
}

/**
 * The case a run takes: the skill's own (`live`) while it asks what the run
 * was asked, with its checks and settings as they are now; else the run's
 * copy (`kept`), whole, so the run is read against the test it took. A run
 * that kept no copy takes the skill's case as it is. Null when there is
 * neither.
 */
export function takenCase(
  skillDir: string,
  kept: KeptCase | null,
  live: Case | null,
): TakenCase | null {
  const asked = live ? askOf(skillDir, live) : null
  if (live && asked !== null && (!kept || sameFingerprint(kept.ask, asked)))
    return { case: live, ask: asked, yardstick: yardstickOf(skillDir, live), earlier: null }
  if (!kept) return null
  return {
    case: kept.case,
    ask: kept.ask,
    yardstick: yardstickOf(skillDir, kept.case),
    earlier: kept.case,
  }
}

/**
 * Every case the run in `runDir` takes, by id, against the skill's cases as
 * they are now (`live`). A run that kept its cases takes those; one that kept
 * none takes each of the skill's. A case the run answered (`answered`) that
 * a damaged file lost is taken as it is now, as for a run that kept none.
 */
export function runCases(
  skillDir: string,
  runDir: string,
  live: readonly Case[],
  kept: KeptCase[] | null = keptCases(runDir),
  answered: readonly string[] = [],
): Record<string, RunCase> {
  const byId = new Map(live.map((testCase) => [testCase.id, testCase]))
  const held = new Set(kept?.map((entry) => entry.case.id))
  const lost = live.filter((testCase) => answered.includes(testCase.id) && !held.has(testCase.id))
  const pairs: Array<[KeptCase | null, Case | null]> = kept
    ? [
        ...kept.map((entry): [KeptCase, Case | null] => [entry, byId.get(entry.case.id) ?? null]),
        ...lost.map((testCase): [null, Case] => [null, testCase]),
      ]
    : live.map((testCase) => [null, testCase])
  const cases: Record<string, RunCase> = {}
  for (const [entry, testCase] of pairs) {
    const taken = takenCase(skillDir, entry, testCase)
    if (!taken) continue
    const { case: read, ...view } = taken
    cases[read.id] = view
  }
  return cases
}
