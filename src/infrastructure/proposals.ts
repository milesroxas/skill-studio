/**
 * The checks `st propose` proposed, in `evals/proposals.json`, written whole
 * as the app's other JSON is, so a screen can show them later. Each keeps
 * the model, the time and what it was made from, and a state: proposed,
 * accepted or dropped.
 *
 * What a proposal was made from is its stamp: the version of what the model
 * is told, what its case asks (the request and each input file by name and
 * bytes), the case's "A good answer" note, and each answer read, by run,
 * attempt and the bytes of the files it wrote. A proposal whose stamp is not the
 * case's now is out of date: the request or the note changed, an answer
 * changed, or a newer run has a newer answer. The next `st propose` reads
 * the case again, and the out-of-date proposals it had go.
 *
 * A dropped proposal is kept by its id, which is its case, what that case
 * asks and its words (`proposalId`), so it is not proposed again while those
 * stand. A note or an answer that changes does not bring it back.
 *
 * Proposals for every case that say the same in different cases are one
 * proposal, kept in `every` with the cases it was seen on: accepting it
 * writes one check for every case. Jev's answers on which proposals say the
 * same, and on whether a proposal's words ask for all of it, are kept in
 * `asked`, so the same question is never paid for twice.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type Meets,
  PROPOSE_PROMPT_VERSION,
  type Scope,
  type Tells,
  wordsOf,
} from '@domain/proposal.ts'
import type { Case, Configuration } from '@domain/schemas.ts'
import type { Sample } from '@domain/views.ts'
import { assertInside, isFile, readJson, writeJson } from './fs.ts'
import { askStamp } from './rule-readings.ts'

const PROPOSALS_FILE = 'proposals.json'

const proposalsPath = (skillDir: string): string => join(skillDir, 'evals', PROPOSALS_FILE)

/** One answer that was read, by where it is kept. */
export interface AnswerRef {
  run: string
  /** The attempt's folder in the run, such as `email-free-s1`. */
  sample: string
  configuration: Configuration
  /** The skill version the run tested (`v2`); empty for a run without the skill. */
  version: string
  /** The version's name, as the run gives it. */
  name: string
}

/** Where the words that ask for a proposal are: the request, the case's note, or one of the request's files. */
export type Basis = { in: 'request' } | { in: 'note' } | { in: 'input'; file: string }

export type ProposalState = 'proposed' | 'accepted' | 'dropped'

export interface StoredProposal {
  /** Short and stable (`proposalId`). What `st propose --accept` names it by. */
  id: string
  case: string
  check: string
  why: string
  /** "every case" when the model said it would hold for every case of the skill. */
  scope: Scope
  /** What asks for it, and its words there, copied. */
  basis: Basis & { quote: string }
  /** An answer that misses it; null when no answer read does. */
  shownBy: AnswerRef | null
  /** Where in that answer the fault shows, by its path in the attempt's folder, and its words; null for something it leaves out. */
  fault: { file: string; quote: string } | null
  /** Each answer read, with the model's word on whether it meets the check. */
  answers: Array<AnswerRef & { meets: Meets }>
  tells: Tells
  state: ProposalState
  /** When it was accepted or dropped. */
  decidedAt?: string
  /** What it was made from (`caseStamp`). */
  stamp: string
  /** The case's request stamp (`askStamp`), which a dropped one is kept by. */
  ask: string
  provider: string
  model: string
  at: string
  /** The `PROPOSE_PROMPT_VERSION` it was made under. */
  prompt: number
  /** The whole lines its basis quote stands in, as Jev reads them. */
  basisLines?: string
  /** Jev's word on whether its basis asks for all of it; null when Jev was not asked. */
  basisCheck?: BasisCheck | null
}

/**
 * Jev's word on whether a proposal's basis asks for all of it, asked both ways
 * round (`forward`: it asks for all of it; `inverse`: the check asks for
 * more), and the two read as one: `yes`, `no` or `not sure`.
 */
export interface BasisCheck {
  forward: number
  inverse: number
  reading: 'yes' | 'no' | 'not sure'
}

/** A proposal left out because Jev was sure its words do not ask for all of it. */
export interface Overreach {
  check: string
  why: string
  scope: Scope
  basis: Basis & { quote: string }
  basisCheck: BasisCheck
}

/**
 * One fact of a case's note and what covers it: a check of the case, a
 * proposal (by id), a reason it cannot be a check, or nothing, with why.
 */
export interface StoredFact {
  fact: string
  by: 'check' | 'proposal' | 'reason' | 'nothing'
  check: string | null
  proposal: string | null
  why: string
}

/** One reading of a case, kept so a case read with nothing to propose is not read again. */
export interface ProposalRead {
  case: string
  stamp: string
  at: string
  model: string
  /** How many proposals it kept. */
  kept: number
  /** Why the parser refused each proposal of the first reply it refused, and of the second. */
  refused: string[]
  /** Each fact of the note the model listed, with what covers it. */
  facts?: StoredFact[]
  /** Stretches of the note no listed fact quotes. */
  unlisted?: string[]
  /** Why each fact the model listed was not taken. */
  factsRefused?: string[]
  /** Proposals left out because Jev was sure their words do not ask for all of them. */
  overreach?: Overreach[]
  /** Whether Jev was asked about each proposal's basis. */
  basisChecked?: boolean
}

/** A proposal for every case: proposals of two or more cases that say the same. */
export interface StoredEvery {
  /** Short and stable (`proposalId` of its words): what `--accept` names it by. */
  id: string
  check: string
  why: string
  /** The proposals it is made of, each by its case and its id. */
  members: Array<{ case: string; id: string }>
  state: ProposalState
  decidedAt?: string
  at: string
}

/** One answer of Jev's, kept by a hash of what was asked (`askedKey`). */
export interface AskedEntry {
  key: string
  noul: number
  at: string
}

interface ProposalsFile {
  proposals: StoredProposal[]
  reads: ProposalRead[]
  every: StoredEvery[]
  asked: AskedEntry[]
}

/** The most of Jev's answers kept. Past it the oldest go, as `rule-readings.json` does. */
const ASKED_MAX = 4000

/** The key one answer of Jev's is kept by: its model and everything it was asked. */
export const askedKey = (model: string, parts: readonly unknown[]): string =>
  sha(JSON.stringify([model, ...parts]))

const sha = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex')

/** The bytes of a sample's files, as one hash: the files it wrote, as the run lists them. */
function sampleHash(sample: Sample): string {
  const parts = sample.artifacts
    .map((a) => a.file)
    .map((file) => {
      const path = assertInside(sample.path, join(sample.path, file))
      return [file, isFile(path) ? sha(readFileSync(path)) : 'missing']
    })
  return sha(JSON.stringify(parts))
}

/**
 * What a case's proposals are made from, as one hash: the version of what the
 * model is told, what the case asks, its note, and each answer read.
 */
export function caseStamp(
  skillDir: string,
  testCase: Case,
  answers: ReadonlyArray<{ ref: AnswerRef; sample: Sample }>,
): string {
  return sha(
    JSON.stringify([
      'propose',
      PROPOSE_PROMPT_VERSION,
      askStamp(skillDir, testCase),
      testCase.expectedOutcome.trim(),
      answers
        .map(({ ref, sample }) => [ref.run, ref.sample, sampleHash(sample)])
        .sort((a, b) => (a.join('/') < b.join('/') ? -1 : 1)),
    ]),
  )
}

/**
 * A proposal's id, short: its case, what the case asks and its words. So the
 * same words proposed again for the same request have the same id, and one
 * dropped stays dropped while its words and its case stand.
 */
export const proposalId = (caseId: string, ask: string, check: string): string =>
  sha(JSON.stringify([caseId, ask, wordsOf(check)])).slice(0, 8)

const STATES: readonly ProposalState[] = ['proposed', 'accepted', 'dropped']

const isProposal = (entry: unknown): entry is StoredProposal => {
  if (!entry || typeof entry !== 'object') return false
  const e = entry as Partial<StoredProposal>
  return (
    typeof e.id === 'string' &&
    typeof e.case === 'string' &&
    typeof e.check === 'string' &&
    e.check.trim() !== '' &&
    typeof e.stamp === 'string' &&
    typeof e.ask === 'string' &&
    !!e.basis &&
    typeof e.basis === 'object' &&
    STATES.includes(e.state as ProposalState) &&
    Array.isArray(e.answers)
  )
}

const isRead = (entry: unknown): entry is ProposalRead =>
  !!entry &&
  typeof entry === 'object' &&
  typeof (entry as ProposalRead).case === 'string' &&
  typeof (entry as ProposalRead).stamp === 'string'

const isEvery = (entry: unknown): entry is StoredEvery => {
  if (!entry || typeof entry !== 'object') return false
  const e = entry as Partial<StoredEvery>
  return (
    typeof e.id === 'string' &&
    typeof e.check === 'string' &&
    Array.isArray(e.members) &&
    STATES.includes(e.state as ProposalState)
  )
}

const isAsked = (entry: unknown): entry is AskedEntry =>
  !!entry &&
  typeof entry === 'object' &&
  typeof (entry as AskedEntry).key === 'string' &&
  typeof (entry as AskedEntry).noul === 'number'

/**
 * What the file holds. A file that cannot be read throws, naming it, as the
 * app's other JSON does; an entry that is not a proposal is left out.
 */
export function readProposals(skillDir: string): ProposalsFile {
  const file = readJson<Partial<ProposalsFile>>(proposalsPath(skillDir), {})
  return {
    proposals: Array.isArray(file?.proposals) ? file.proposals.filter(isProposal) : [],
    reads: Array.isArray(file?.reads) ? file.reads.filter(isRead) : [],
    every: Array.isArray(file?.every) ? file.every.filter(isEvery) : [],
    asked: Array.isArray(file?.asked) ? file.asked.filter(isAsked) : [],
  }
}

function write(skillDir: string, file: ProposalsFile): void {
  writeJson(proposalsPath(skillDir), file)
}

/** `asked` with `fresh` in place of any with their keys, the newest `ASKED_MAX` kept. */
function withAsked(asked: readonly AskedEntry[], fresh: readonly AskedEntry[]): AskedEntry[] {
  const keys = new Set(fresh.map((a) => a.key))
  return [...asked.filter((a) => !keys.has(a.key)), ...fresh].slice(-ASKED_MAX)
}

/**
 * Keep the proposals for every case as the latest reading joined them: these
 * in place of the ones still proposed. Accepted and dropped ones stay, and a
 * new one with the id of one decided is not kept. `asked` adds Jev's answers.
 */
export function storeEvery(
  skillDir: string,
  fresh: readonly StoredEvery[],
  asked: readonly AskedEntry[],
): void {
  const file = readProposals(skillDir)
  const decided = new Set(file.every.filter((e) => e.state !== 'proposed').map((e) => e.id))
  write(skillDir, {
    ...file,
    every: [
      ...file.every.filter((e) => e.state !== 'proposed'),
      ...fresh.filter((e) => !decided.has(e.id)),
    ],
    asked: withAsked(file.asked, asked),
  })
}

/**
 * Set the state of the named proposals for every case and of each proposal
 * they are made of. Returns those set. Set back to proposed, a decision is
 * taken back: its time goes, and the proposals it decided are proposed again.
 */
export function decideEvery(
  skillDir: string,
  ids: readonly string[],
  state: ProposalState,
): StoredEvery[] {
  const file = readProposals(skillDir)
  const at = new Date().toISOString()
  const set: StoredEvery[] = []
  const every = file.every.map((e) => {
    if (!ids.includes(e.id)) return e
    const next = decided(e, state, at)
    set.push(next)
    return next
  })
  const members = new Set(set.flatMap((e) => e.members.map((m) => `${m.case}/${m.id}`)))
  // A decision sets the members still open; taking one back opens the members it closed.
  const from =
    state === 'proposed'
      ? set.map((e) => file.every.find((f) => f.id === e.id)?.state)
      : ['proposed']
  const proposals = file.proposals.map((p) =>
    members.has(`${p.case}/${p.id}`) && from.includes(p.state) ? decided(p, state, at) : p,
  )
  write(skillDir, { ...file, every, proposals })
  return set
}

/**
 * Keep one case's new reading: its proposals in place of the ones still
 * proposed for that case, which a new reading replaces. Accepted and dropped
 * ones stay as they were. A new proposal with the id of an accepted or a
 * dropped one is not kept: that one was decided.
 */
export function storeCaseRead(
  skillDir: string,
  read: ProposalRead,
  fresh: StoredProposal[],
  asked: readonly AskedEntry[] = [],
): void {
  const file = readProposals(skillDir)
  const decided = new Set(
    file.proposals.filter((p) => p.case === read.case && p.state !== 'proposed').map((p) => p.id),
  )
  write(skillDir, {
    ...file,
    proposals: [
      ...file.proposals.filter((p) => p.case !== read.case || p.state !== 'proposed'),
      ...fresh.filter((p) => !decided.has(p.id)),
    ],
    reads: [...file.reads.filter((r) => r.case !== read.case), read],
    asked: withAsked(file.asked, asked),
  })
}

/** A proposal in its new state: decided at `at`, or proposed again with no time of decision. */
function decided<T extends { state: ProposalState; decidedAt?: string }>(
  proposal: T,
  state: ProposalState,
  at: string,
): T {
  if (state !== 'proposed') return { ...proposal, state, decidedAt: at }
  const { decidedAt: _, ...open } = proposal
  return { ...open, state } as T
}

/** Set the state of the named proposals of one case, and when. Returns those it set. Set back to proposed, a decision is taken back. */
export function decideProposals(
  skillDir: string,
  caseId: string,
  ids: readonly string[],
  state: ProposalState,
): StoredProposal[] {
  const file = readProposals(skillDir)
  const at = new Date().toISOString()
  const set: StoredProposal[] = []
  const proposals = file.proposals.map((p) => {
    if (p.case !== caseId || !ids.includes(p.id)) return p
    const next = decided(p, state, at)
    set.push(next)
    return next
  })
  write(skillDir, { ...file, proposals })
  return set
}
