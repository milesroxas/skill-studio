/**
 * Proposing checks: the assistant reads a case's answers and proposes checks
 * a good answer to it makes true (`domain/proposal.ts`), for the person to
 * accept, edit or drop. It reads, for each case, the latest answer of each
 * version of the skill and the latest answer made without the skill, all to
 * the case as it asks now, in a folder made for it (`proposal-room.ts`) that
 * holds no part of the skill. One session per case, with tools that only read.
 *
 * After each case's reading, Jev is asked, when a TypeSafe key is set,
 * whether each proposal's words ask for all of it: one they do not, Jev being
 * sure, is left out. After every case, proposals for every case that say the
 * same, in the same words or, Jev being sure, in other words, are joined into
 * one proposal for every case (`judges/proposals.ts`). Jev's answers are kept,
 * so nothing is asked twice.
 *
 * Only `st propose` starts this: it spends the person's own model usage, so
 * nothing in a run, a grading or the app calls it by itself. It never changes
 * a case by itself: `acceptProposals` adds a check only when the person names
 * it, and `acceptEveryCase` writes a check for every case. A case read before,
 * with nothing changed since, is not read again unless `again` says to.
 */
import { createHash } from 'node:crypto'
import type { AiProviderId, AiUsage } from '@domain/ai.ts'
import { draftOf } from '@domain/case-draft.ts'
import { withEveryCase } from '@domain/every-case.ts'
import {
  ANSWERS_MAX,
  answerNoun,
  asAnswer,
  type EarlierProposal,
  joinGroups,
  type Left,
  type Meets,
  type NoteFact,
  type Parsed,
  PROPOSALS_MAX,
  PROPOSE_BRIEF,
  PROPOSE_PROMPT,
  PROPOSE_PROMPT_VERSION,
  PROPOSE_SCHEMA,
  type Proposal,
  type ProposedCheck,
  parseProposals,
  pickProposals,
  retryText,
  sameWords,
  type Tells,
  tellsOf,
  tellsOfAll,
  unlistedOf,
  wordsOf,
} from '@domain/proposal.ts'
import { parseSampleDir } from '@domain/run-name.ts'
import type { Case } from '@domain/schemas.ts'
import type { Sample } from '@domain/views.ts'
import { aiProvider, isProviderError } from '@infrastructure/ai/index.ts'
import { recordUsage } from '@infrastructure/ai/store.ts'
import {
  loadBench,
  loadCases,
  loadEveryCase,
  saveCase,
  saveEveryCase,
} from '@infrastructure/cases.ts'
import { listDirs } from '@infrastructure/fs.ts'
import { makeProposalRoom } from '@infrastructure/proposal-room.ts'
import {
  type AnswerRef,
  type AskedEntry,
  askedKey,
  type Basis,
  type BasisCheck,
  caseStamp,
  decideEvery,
  decideProposals,
  type Overreach,
  type ProposalState,
  proposalId,
  readProposals,
  type StoredEvery,
  type StoredFact,
  type StoredProposal,
  storeCaseRead,
  storeEvery,
} from '@infrastructure/proposals.ts'
import { askStamp } from '@infrastructure/rule-readings.ts'
import { readKept, takenCase } from '@infrastructure/run-cases.ts'
import { readRunMeta, runDir, runSamples, runsDir } from '@infrastructure/runs.ts'
import type { JevAsker, JevState } from '@judges/jev.ts'
import {
  basisQuestions,
  basisState,
  bothWays,
  PROPOSAL_QUESTIONS_VERSION,
  SAME_STATE,
  sameQuestions,
} from '@judges/proposals.ts'
import { noulOf } from '@judges/shared/questions.ts'
import type { Question } from '@typesafe-ai/sdk'

export interface ProposeOptions {
  /** The assistant to ask, and its model. */
  provider: AiProviderId
  model: string
  /** Empty for the model's own default. */
  effort: string
  /** The cases to read; every case when empty. */
  cases: string[]
  /** Read a case again though nothing it was read from has changed. */
  again: boolean
  /** Sessions in flight at once. */
  parallel: number
  /** Jev, to check each proposal's words and to join proposals that say the same; null to ask nothing of it. */
  jev: JevAsker | null
  log: (line: string) => void
  signal: AbortSignal
}

/** One answer read, with its letter in the room. */
export interface ReadAnswer extends AnswerRef {
  letter: string
}

/** What came of one case. */
export interface CaseProposals {
  case: string
  title: string
  /** The answers read, in letter order. */
  answers: ReadAnswer[]
  /** The proposals current for the case alone, in the model's order. Those for every case are in `ProposeResult.every`. */
  proposals: StoredProposal[]
  /** Read before, with nothing changed since, so not read again. */
  kept: boolean
  /** Proposals the model made that are not shown, and why. */
  left: Array<{ check: string; why: Left }>
  /** Proposals left out because Jev was sure their words do not ask for all of them. */
  overreach: Overreach[]
  /** Whether Jev was asked about each proposal's words. */
  basisChecked: boolean
  /** Each fact of the note, with what covers it. */
  facts: StoredFact[]
  /** Words of the note no listed fact quotes. */
  unlisted: string[]
  /** Proposals the parser refused on the first reply, and on the second. */
  refusedOnce: number
  refusedTwice: number
  usage: AiUsage
  seconds: number
  /** Why the case was not read: it has no answer to read. */
  skipped: string | null
  /** Why the session gave no proposals, when it failed. */
  error: string | null
}

/** A proposal for every case, with the proposals it is made of. */
export interface EveryProposal extends StoredEvery {
  /** The proposals it is made of, each with its case. */
  made: StoredProposal[]
  /** The cases it was seen on, in the cases' order. */
  cases: string[]
  tells: Tells
}

/** Two proposals Jev was asked about, and whether they were joined. */
export interface Pair {
  a: string
  b: string
  /** Jev's answers: that they ask the same, and that an answer could meet one and miss the other. */
  same: number
  differ: number
  joined: boolean
}

/** What Jev was asked, as counted for the person. */
export interface JevSpent {
  /** Requests sent, and the questions in them. */
  requests: number
  questions: number
  /** Answers kept from before, so not asked. */
  kept: number
  /** Why Jev could not be asked, when it could not. */
  error: string | null
}

export interface ProposeResult {
  provider: AiProviderId
  /** The model that answered, as its provider names it. */
  model: string
  cases: CaseProposals[]
  /** The proposals for every case, after joining. */
  every: EveryProposal[]
  /** How proposals for every case were joined: by Jev, or by their words alone. */
  joining: {
    /** Jev was asked about proposals in other words; false when there was no Jev. */
    nearer: boolean
    pairs: Pair[]
    /** Proposals for every case left out because a check for every case says them. */
    left: Array<{ check: string; cases: string[]; like: string }>
  }
  /** Whether Jev was there to ask: false with no key, or when asked not to. */
  jevAsked: boolean
  jev: JevSpent
  usage: AiUsage
}

const NO_USAGE: AiUsage = { input: 0, output: 0 }
const add = (a: AiUsage, b: AiUsage): AiUsage => ({
  input: a.input + b.input,
  output: a.output + b.output,
})
const sha = (value: string): string => createHash('sha256').update(value).digest('hex')

/** Run `work` over `items`, at most `limit` at once. */
async function pooled<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await work(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  return results
}

/** Keep what a session spent. The log is a record beside the proposals, never part of them. */
function spent(provider: AiProviderId, model: string, usage: AiUsage): void {
  try {
    recordUsage({ at: new Date().toISOString(), provider, model, ...usage })
  } catch (error) {
    console.warn(`The usage log could not be written: ${(error as Error).message}`)
  }
}

/**
 * The answers to read for `testCase`: the latest finished attempt of the
 * latest run of each version that answered the case as it asks now, newest
 * version first, and the latest such answer made without the skill. At most
 * `ANSWERS_MAX`, the one without the skill among them. A run that answered
 * the case as it once was answered another request, so it is passed over.
 */
export function answersFor(
  skillDir: string,
  testCase: Case,
): Array<{ ref: AnswerRef; sample: Sample }> {
  const metas = listDirs(runsDir(skillDir))
    .flatMap((name) => {
      try {
        const meta = readRunMeta(skillDir, name)
        return meta && !meta.legacy ? [meta] : []
      } catch {
        return []
      }
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  const seen = new Set<string>()
  const picked: Array<{ ref: AnswerRef; sample: Sample; without: boolean }> = []
  for (const meta of metas) {
    const without = meta.configuration === 'without_skill'
    const group = without ? 'without' : meta.skillVersion || meta.skillHash || meta.name
    if (seen.has(group)) continue
    const dir = runDir(skillDir, meta.name)
    const kept = readKept(dir).kept?.find((entry) => entry.case.id === testCase.id) ?? null
    if (takenCase(skillDir, kept, testCase)?.earlier !== null) continue
    const sample = runSamples(dir)
      .filter((s) => !s.cut && s.artifacts.length && parseSampleDir(s.name)?.case === testCase.id)
      .sort(
        (a, b) => (parseSampleDir(a.name)?.index ?? 0) - (parseSampleDir(b.name)?.index ?? 0),
      )[0]
    if (!sample) continue
    seen.add(group)
    picked.push({
      ref: {
        run: meta.name,
        sample: sample.name,
        configuration: meta.configuration,
        version: without ? '' : meta.skillVersion,
        name: without ? '' : meta.skillName,
      },
      sample,
      without,
    })
  }
  const withoutSkill = picked.filter((p) => p.without).slice(0, 1)
  const versions = picked.filter((p) => !p.without).slice(0, ANSWERS_MAX - withoutSkill.length)
  return [...withoutSkill, ...versions].map(({ ref, sample }) => ({ ref, sample }))
}

/**
 * Letters for the answers, in an order that says nothing of which is which:
 * by a hash of the case and the run, so the answer without the skill is not
 * always first, and the same answers get the same letters each time.
 */
function lettered(
  caseId: string,
  answers: ReadonlyArray<{ ref: AnswerRef; sample: Sample }>,
): Array<{ ref: ReadAnswer; sample: Sample }> {
  return [...answers]
    .sort((a, b) => {
      const x = sha(`${caseId}/${a.ref.run}`)
      const y = sha(`${caseId}/${b.ref.run}`)
      return x < y ? -1 : x > y ? 1 : 0
    })
    .map(({ ref, sample }, i) => ({ ref: { ...ref, letter: String.fromCharCode(65 + i) }, sample }))
}

/** Where the words that ask for a proposal are, by their path in the room, as it is kept. */
function basisOf(file: string): Basis {
  if (file === 'request.md') return { in: 'request' }
  if (file === 'note.md') return { in: 'note' }
  return { in: 'input', file: file.replace(/^inputs\//, '') }
}

/** A kept basis by its path in the room, as `basisOf` reads it back. */
function roomPathOf(basis: Basis): string {
  if (basis.in === 'request') return 'request.md'
  if (basis.in === 'note') return 'note.md'
  return `inputs/${basis.file}`
}

const refOf = ({ letter: _, ...ref }: ReadAnswer): AnswerRef => ref

/** The proposals still proposed for a case at its stamp, in the order they were kept. */
const currentOf = (stored: readonly StoredProposal[], caseId: string, stamp: string) =>
  stored.filter((p) => p.case === caseId && p.stamp === stamp && p.state === 'proposed')

/** Text as a quote is found in a file: every run of whitespace one space, curly quotes straight. */
const plain = (value: string): string =>
  value.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim()

/**
 * The whole lines of `file` that hold `quote`: what Jev reads as the words a
 * proposal stands on. A few words cut from a line can lose what the line asks
 * ("must not appear in anything we publish" says nothing of what must not).
 * The quote itself when it cannot be found by lines.
 */
function basisLines(file: string, quote: string): string {
  const wanted = plain(quote)
  const lines = file.split('\n')
  for (let size = 1; size <= lines.length; size += 1)
    for (let from = 0; from + size <= lines.length; from += 1) {
      const run = lines.slice(from, from + size).join('\n')
      if (plain(run).includes(wanted)) return run.trim()
    }
  return quote
}

/**
 * Jev's answers, each kept by a hash of what was asked (`askedKey`): one held
 * from before is not asked again. Counts what it asked and what it kept.
 */
class Asking {
  private readonly held: Map<string, number>
  private fresh: AskedEntry[] = []
  readonly spent: JevSpent = { requests: 0, questions: 0, kept: 0, error: null }

  constructor(
    readonly jev: JevAsker,
    entries: readonly AskedEntry[],
    private readonly signal: AbortSignal,
  ) {
    this.held = new Map(entries.map((e) => [e.key, e.noul]))
  }

  /** The answers new since the last call, to be written with what they answered. */
  drain(): AskedEntry[] {
    const out = this.fresh
    this.fresh = []
    return out
  }

  /**
   * Each question's answer, by its key: those held from before, and the rest
   * asked of `state`, at most `per` questions a request. Throws when a request fails.
   */
  async ask(
    state: JevState,
    items: ReadonlyArray<{ key: string; question: Question }>,
    per = 40,
  ): Promise<Map<string, number>> {
    const answers = new Map<string, number>()
    const missing: Array<{ key: string; question: Question }> = []
    for (const item of items) {
      const held = this.held.get(item.key)
      if (held === undefined) {
        if (!missing.some((m) => m.key === item.key)) missing.push(item)
      } else {
        answers.set(item.key, held)
        this.spent.kept += 1
      }
    }
    for (let at = 0; at < missing.length; at += per) {
      const part = missing.slice(at, at + per)
      const came = (await this.jev.ask(
        state,
        Object.fromEntries(part.map((m, i) => [`q${i}`, m.question])),
        this.signal,
      )) as Record<string, unknown>
      this.spent.requests += 1
      this.spent.questions += part.length
      const now = new Date().toISOString()
      part.forEach((m, i) => {
        const value = noulOf(came, `q${i}`)
        answers.set(m.key, value)
        this.held.set(m.key, value)
        this.fresh.push({ key: m.key, noul: value, at: now })
      })
    }
    return answers
  }
}

/** How a probability reads against the skill's thresholds. */
const readOf = (value: number, cuts: { yes: number; no: number }): BasisCheck['reading'] =>
  value >= cuts.yes ? 'yes' : value <= cuts.no ? 'no' : 'not sure'

/**
 * Ask Jev whether each proposal's words ask for all of it, in one request for
 * the case. Returns Jev's word on each, by its place in `proposals`.
 */
async function checkBases(
  asking: Asking,
  room: { files: Readonly<Record<string, string>> },
  proposals: readonly Proposal[],
  cuts: { yes: number; no: number },
): Promise<BasisCheck[]> {
  const state = basisState({
    request: room.files['request.md'] ?? '',
    note: room.files['note.md'] ?? '',
    files: Object.fromEntries(
      Object.entries(room.files)
        .filter(([path]) => path.startsWith('inputs/'))
        .map(([path, text]) => [path.replace(/^inputs\//, ''), text]),
    ),
  })
  const stateKey = sha(JSON.stringify(state))
  const items = proposals.map((p) => {
    const words = basisLines(room.files[p.basisFile] ?? '', p.basisQuote)
    const basis = basisOf(p.basisFile)
    const [forward, inverse] = basisQuestions(p.check, words, basis)
    const key = (way: string) =>
      askedKey(asking.jev.model, [
        'basis',
        PROPOSAL_QUESTIONS_VERSION,
        stateKey,
        p.check,
        words,
        p.basisFile,
        way,
      ])
    return {
      forward: { key: key('forward'), question: forward },
      inverse: { key: key('inverse'), question: inverse },
    }
  })
  const answers = await asking.ask(
    state,
    items.flatMap((i) => [i.forward, i.inverse]),
  )
  return items.map((i) => {
    const forward = answers.get(i.forward.key) as number
    const inverse = answers.get(i.inverse.key) as number
    return { forward, inverse, reading: readOf(bothWays(forward, inverse), cuts) }
  })
}

/** What a fact of the note's cover came to, after the proposals were picked and checked. */
type Fate =
  | { kept: StoredProposal }
  | { like: { by: 'check'; check: string } | { by: 'proposal'; check: string } }
  | { gone: string }

/**
 * Propose checks for the cases of the skill in `skillDir`. A case with no
 * answer to read starts no session. One read before with nothing changed
 * since is not read again, and its proposals are returned as they were. A
 * session that fails is said in its case, and the rest go on. Then the
 * proposals for every case, of every case, are joined.
 */
export async function proposeChecks(
  skillDir: string,
  options: ProposeOptions,
): Promise<ProposeResult> {
  const provider = aiProvider(options.provider)
  if (!provider.readFolder)
    throw new Error(
      `${options.provider} cannot be held to reading one folder yet. Use claude-code.`,
    )
  const read = provider.readFolder
  const live = loadCases(skillDir)
  for (const id of options.cases)
    if (!live.some((c) => c.id === id)) throw new Error(`No case named ${id}.`)
  const wanted = options.cases.length ? live.filter((c) => options.cases.includes(c.id)) : live
  const every = loadEveryCase(skillDir)
  const bench = loadBench(skillDir)
  const cuts = { yes: bench.yes, no: Number.isFinite(bench.no) ? bench.no : bench.yes }
  const asking = options.jev
    ? new Asking(options.jev, readProposals(skillDir).asked, options.signal)
    : null
  let model = options.model

  const cases = await pooled(wanted, options.parallel, async (testCase): Promise<CaseProposals> => {
    const answers = lettered(testCase.id, answersFor(skillDir, testCase))
    const refs = answers.map((a) => a.ref)
    const base: CaseProposals = {
      case: testCase.id,
      title: testCase.title,
      answers: refs,
      proposals: [],
      kept: false,
      left: [],
      overreach: [],
      basisChecked: false,
      facts: [],
      unlisted: [],
      refusedOnce: 0,
      refusedTwice: 0,
      usage: NO_USAGE,
      seconds: 0,
      skipped: null,
      error: null,
    }
    if (!answers.length)
      return { ...base, skipped: 'No run has an answer to this case as it asks now.' }
    const stamp = caseStamp(skillDir, testCase, answers)
    const ask = askStamp(skillDir, testCase)
    const file = readProposals(skillDir)
    const lastRead = file.reads.find((r) => r.case === testCase.id)
    if (!options.again && lastRead?.stamp === stamp)
      return {
        ...base,
        kept: true,
        proposals: currentOf(file.proposals, testCase.id, stamp),
        overreach: lastRead.overreach ?? [],
        basisChecked: lastRead.basisChecked ?? false,
        facts: lastRead.facts ?? [],
        unlisted: lastRead.unlisted ?? [],
      }
    if (options.signal.aborted) return { ...base, error: 'Stopped.' }

    const dropped = file.proposals
      .filter((p) => p.case === testCase.id && p.ask === ask && p.state === 'dropped')
      .map((p) => p.check)
    // What was proposed before, shown so a new reading keeps what stood: the ones still open, newest reading's first.
    const shownBefore = (p: {
      check: string
      why: string
      scope: StoredProposal['scope']
      basis: StoredProposal['basis']
    }): EarlierProposal => ({
      check: p.check,
      why: p.why,
      scope: p.scope,
      basisFile: roomPathOf(p.basis),
      basisQuote: p.basis.quote,
    })
    const earlier = {
      kept: file.proposals
        .filter((p) => p.case === testCase.id && p.ask === ask && p.state === 'proposed')
        .map(shownBefore),
      overreach: (lastRead?.overreach ?? []).map(shownBefore),
    }
    // The checks for every case count as the case's own: a proposal that says one again is left out.
    const checked = withEveryCase(testCase, every)
    const room = makeProposalRoom({
      skillDir,
      testCase: checked,
      answers: answers.map((a) => ({ letter: a.ref.letter, sample: a.sample })),
      dropped,
      max: PROPOSALS_MAX,
      earlier,
    })
    let usage = NO_USAGE
    const session = async (prompt: string): Promise<string> => {
      try {
        const reply = await read({
          model: options.model,
          effort: options.effort,
          system: PROPOSE_BRIEF,
          prompt,
          dir: room.dir,
          schema: PROPOSE_SCHEMA,
          signal: options.signal,
        })
        usage = add(usage, reply.usage)
        model = reply.model
        spent(options.provider, reply.model, reply.usage)
        return reply.text
      } catch (error) {
        if (isProviderError(error)) {
          usage = add(usage, error.usage)
          spent(options.provider, error.model, error.usage)
        }
        throw error
      }
    }
    const begun = Date.now()
    try {
      options.log(`${testCase.id}: reading ${answers.length} answer(s).`)
      const first = await session(PROPOSE_PROMPT)
      const once = parseProposals(first, room)
      let twice: Parsed = { taken: [], takenAt: [], refused: [], facts: [], factsRefused: [] }
      if (once.refused.length && !options.signal.aborted) {
        options.log(`${testCase.id}: ${once.refused.length} did not fit, asking once more.`)
        try {
          twice = parseProposals(await session(retryText(first, once.refused)), room)
        } catch (error) {
          if (options.signal.aborted) throw error
          twice = {
            taken: [],
            takenAt: [],
            refused: [{ index: -1, why: (error as Error).message }],
            facts: [],
            factsRefused: [],
          }
        }
      }
      if (options.signal.aborted) throw new Error('Stopped.')
      const whole = (p: Parsed) => p.refused.some((r) => r.index < 0)
      if (whole(once) && (!once.refused.length || whole(twice)))
        throw new Error(
          `The reply did not fit twice: ${[...once.refused, ...twice.refused].map((r) => r.why).join('; ')}`,
        )
      const against = { checks: checked.graders.map((g) => g.statement), dropped }
      const picked = pickProposals(
        [...once.taken, ...twice.taken],
        against,
        Number.POSITIVE_INFINITY,
      )

      // Jev on each one's words, before the most is counted: one left out frees its place.
      let checks: Array<BasisCheck | null> = picked.kept.map(() => null)
      let basisChecked = false
      if (asking && picked.kept.length && !options.signal.aborted)
        try {
          checks = await checkBases(asking, room, picked.kept, cuts)
          basisChecked = true
        } catch (error) {
          if (options.signal.aborted) throw error
          asking.spent.error = (error as Error).message
          options.log(
            `${testCase.id}: Jev could not check the proposals' words: ${(error as Error).message}`,
          )
        }
      const overreach: Overreach[] = []
      const fair: Array<{ proposal: Proposal; check: BasisCheck | null }> = []
      picked.kept.forEach((proposal, i) => {
        const check = checks[i]
        if (check?.reading === 'no')
          overreach.push({
            check: proposal.check,
            why: proposal.why,
            scope: proposal.scope,
            basis: { ...basisOf(proposal.basisFile), quote: proposal.basisQuote },
            basisCheck: check,
          })
        else fair.push({ proposal, check })
      })
      const shown = fair.slice(0, PROPOSALS_MAX)
      const past = fair
        .slice(PROPOSALS_MAX)
        .map((f) => ({ proposal: f.proposal, why: 'past the most' as const }))

      const at = new Date().toISOString()
      const stored = shown.map(
        ({ proposal: p, check }): StoredProposal => ({
          id: proposalId(testCase.id, ask, p.check),
          case: testCase.id,
          check: p.check,
          why: p.why,
          scope: p.scope,
          basis: { ...basisOf(p.basisFile), quote: p.basisQuote },
          shownBy: p.answer ? refOf(refs.find((r) => r.letter === p.answer) as ReadAnswer) : null,
          fault: p.fault
            ? { file: p.fault.file.replace(/^[A-Z]\//, ''), quote: p.fault.quote }
            : null,
          answers: refs.map((r) => ({ ...refOf(r), meets: p.meets[r.letter] })),
          tells: tellsOf(p.meets),
          state: 'proposed',
          stamp,
          ask,
          provider: options.provider,
          model,
          at,
          prompt: PROPOSE_PROMPT_VERSION,
          basisLines: basisLines(room.files[p.basisFile] ?? '', p.basisQuote),
          basisCheck: check,
        }),
      )

      // What each proposal came to, for the note's facts that name it.
      const fateOf = (p: Proposal): Fate => {
        const i = shown.findIndex((s) => s.proposal === p)
        if (i >= 0) return { kept: stored[i] }
        if (overreach.some((o) => o.check === p.check))
          return { gone: 'Its proposal asked for more than its words, so it was left out.' }
        if (past.some((x) => x.proposal === p))
          return { gone: 'Its proposal was past the most one case shows.' }
        const left = picked.left.find((l) => l.proposal === p)
        if (left?.why === 'same as a check') {
          const like = against.checks.find((c) => sameWords(c, p.check)) ?? p.check
          return { like: { by: 'check', check: like } }
        }
        if (left?.why === 'said twice') {
          const twin = stored.find((s) => sameWords(s.check, p.check))
          return twin ? { kept: twin } : { gone: 'Its proposal was left out.' }
        }
        if (left?.why === 'turned down') return { gone: 'You turned its proposal down.' }
        return { gone: 'Its proposal was left out.' }
      }
      const coverOf = (fact: NoteFact, reply: Parsed, other: Parsed | null): StoredFact => {
        const none = { check: null, proposal: null }
        if (!fact.cover)
          return fact.whyNot
            ? { fact: fact.quote, by: 'reason', ...none, why: fact.whyNot }
            : { fact: fact.quote, by: 'nothing', ...none, why: '' }
        if (fact.cover.by === 'check')
          return {
            fact: fact.quote,
            by: 'check',
            ...none,
            check: room.checks[fact.cover.index],
            why: '',
          }
        const at = reply.takenAt.indexOf(fact.cover.index)
        if (at < 0) {
          // Refused on the first reply: the second names its own proposals for the facts they cover.
          const again = other?.facts.find((f) => sameWords(f.quote, fact.quote) && f.cover)
          return again && other
            ? coverOf(again, other, null)
            : {
                fact: fact.quote,
                by: 'nothing',
                ...none,
                why: 'Its proposal did not fit and was left out.',
              }
        }
        const fate = fateOf(reply.taken[at])
        if ('kept' in fate)
          return {
            fact: fact.quote,
            by: 'proposal',
            check: fate.kept.check,
            proposal: fate.kept.id,
            why: '',
          }
        if ('like' in fate)
          return { fact: fact.quote, by: 'check', ...none, check: fate.like.check, why: '' }
        return { fact: fact.quote, by: 'nothing', ...none, why: fate.gone }
      }
      const facts = once.facts.map((f) => coverOf(f, once, twice))
      const note = room.files['note.md'] ?? ''
      const unlisted = note.trim()
        ? unlistedOf(
            note,
            once.facts.map((f) => f.quote),
          )
        : []

      storeCaseRead(
        skillDir,
        {
          case: testCase.id,
          stamp,
          at,
          model,
          kept: stored.length,
          refused: [...once.refused, ...twice.refused].map((r) => r.why),
          facts,
          unlisted,
          factsRefused: once.factsRefused,
          overreach,
          basisChecked,
        },
        stored,
        asking?.drain() ?? [],
      )
      return {
        ...base,
        proposals: currentOf(readProposals(skillDir).proposals, testCase.id, stamp),
        left: [...picked.left, ...past].map((l) => ({ check: l.proposal.check, why: l.why })),
        overreach,
        basisChecked,
        facts,
        unlisted,
        refusedOnce: once.refused.length,
        refusedTwice: twice.refused.length,
        usage,
        seconds: Math.round((Date.now() - begun) / 1000),
      }
    } catch (error) {
      return {
        ...base,
        usage,
        seconds: Math.round((Date.now() - begun) / 1000),
        error: options.signal.aborted ? 'Stopped.' : (error as Error).message,
      }
    } finally {
      room.dispose()
    }
  })

  const joined = options.signal.aborted
    ? { every: [], joining: { nearer: false, pairs: [], left: [] }, hidden: new Set<string>() }
    : await joinEveryCase(
        skillDir,
        live,
        every.map((g) => g.statement),
        asking,
        cuts,
        options.log,
      )
  const forCase = (c: CaseProposals): CaseProposals => ({
    ...c,
    proposals: c.proposals.filter((p) => !joined.hidden.has(`${p.case}/${p.id}`)),
  })
  return {
    provider: options.provider,
    model,
    cases: cases.map(forCase),
    every: joined.every,
    joining: joined.joining,
    jevAsked: asking !== null,
    jev: asking?.spent ?? { requests: 0, questions: 0, kept: 0, error: null },
    usage: cases.reduce((sum, c) => add(sum, c.usage), NO_USAGE),
  }
}

/**
 * Join what the cases propose into proposals for every case, over every case
 * as last read. Two proposals of different cases are one when they say the
 * same, each with its case's name for its answer read as "The answer"
 * (`asAnswer`): in the same words always, and, with Jev, in other words when
 * Jev is sure. A set seen on two cases or more is one proposal for every
 * case, in the words of its first case's; one seen on one case stays that
 * case's, whatever scope the assistant gave it. One Jev is sure a check for
 * every case says already is left out. Kept in place of the proposals for
 * every case still proposed. `hidden` is each case proposal now part of one
 * for every case, or left out, by `case/id`.
 */
async function joinEveryCase(
  skillDir: string,
  live: readonly Case[],
  everyChecks: readonly string[],
  asking: Asking | null,
  cuts: { yes: number; no: number },
  log: (line: string) => void,
): Promise<{ every: EveryProposal[]; joining: ProposeResult['joining']; hidden: Set<string> }> {
  const file = readProposals(skillDir)
  const order = new Map(live.map((c, i) => [c.id, i]))
  const members = live.flatMap((c) => {
    const last = file.reads.find((r) => r.case === c.id)
    return last ? currentOf(file.proposals, c.id, last.stamp) : []
  })
  const nouns = new Map(
    live.map((c) => [
      c.id,
      answerNoun([
        ...c.graders.map((g) => g.statement),
        ...members.filter((p) => p.case === c.id).map((p) => p.check),
      ]),
    ]),
  )
  const wordsAs = (p: StoredProposal) => asAnswer(p.check, nouns.get(p.case) ?? null)
  // Same words first: one group a wording, its first proposal standing for it.
  const byWords = new Map<string, StoredProposal[]>()
  for (const p of members) {
    const key = wordsOf(wordsAs(p))
    byWords.set(key, [...(byWords.get(key) ?? []), p])
  }
  const groups = [...byWords.values()]
  const casesOf = (g: readonly StoredProposal[]) => new Set(g.map((p) => p.case))
  const lead = (i: number) => groups[i][0]
  const compared = (p: StoredProposal) => ({
    check: wordsAs(p),
    words: p.basisLines ?? p.basis.quote,
  })
  const pairs: Pair[] = []
  let joins: Array<readonly [number, number]> = []
  const likeCheck = new Map<number, string>()
  let nearer = false
  if (asking && groups.length) {
    const items: Array<{ a: number; b: number | null; check: string | null }> = []
    for (let a = 0; a < groups.length; a += 1) {
      // Two wordings of one case alone would join into that case's own: not asked.
      for (let b = a + 1; b < groups.length; b += 1)
        if (new Set([...casesOf(groups[a]), ...casesOf(groups[b])]).size > 1)
          items.push({ a, b, check: null })
      for (const check of everyChecks)
        if (!sameWords(check, wordsAs(lead(a)))) items.push({ a, b: null, check })
    }
    const keyed = items.map((item) => {
      const one = compared(lead(item.a))
      const other =
        item.b === null ? { check: item.check as string, words: '' } : compared(lead(item.b))
      const [x, y] = wordsOf(one.check) < wordsOf(other.check) ? [one, other] : [other, one]
      const [same, differ] = sameQuestions(x, y)
      const key = (way: string) =>
        askedKey(asking.jev.model, [
          'same',
          PROPOSAL_QUESTIONS_VERSION,
          wordsOf(x.check),
          x.words,
          wordsOf(y.check),
          y.words,
          way,
        ])
      return {
        item,
        same: { key: key('same'), question: same },
        differ: { key: key('differ'), question: differ },
      }
    })
    try {
      const answers = await asking.ask(
        SAME_STATE,
        keyed.flatMap((k) => [k.same, k.differ]),
      )
      nearer = true
      for (const { item, same, differ } of keyed) {
        const s = answers.get(same.key) as number
        const d = answers.get(differ.key) as number
        const joined = readOf(bothWays(s, d), cuts) === 'yes'
        const b = item.b === null ? (item.check as string) : wordsAs(lead(item.b))
        pairs.push({ a: wordsAs(lead(item.a)), b, same: s, differ: d, joined })
        if (joined && item.b !== null) joins.push([item.a, item.b])
        if (joined && item.b === null && !likeCheck.has(item.a)) likeCheck.set(item.a, b)
      }
    } catch (error) {
      asking.spent.error = (error as Error).message
      log(
        `Jev could not be asked which proposals of different cases say the same: ${(error as Error).message}`,
      )
      joins = []
      likeCheck.clear()
    }
  }
  const at = new Date().toISOString()
  const left: ProposeResult['joining']['left'] = []
  const every: EveryProposal[] = []
  const hidden = new Set<string>()
  for (const indices of joinGroups(groups.length, joins)) {
    const made = indices
      .flatMap((i) => groups[i])
      .sort((x, y) => (order.get(x.case) ?? 0) - (order.get(y.case) ?? 0))
    const cases = [...new Set(made.map((p) => p.case))]
    const like = indices.map((i) => likeCheck.get(i)).find((c) => c !== undefined)
    if (!like && cases.length < 2) continue
    for (const p of made) hidden.add(`${p.case}/${p.id}`)
    const check = wordsAs(made[0])
    if (like) {
      left.push({ check, cases, like })
      continue
    }
    every.push({
      id: proposalId('every case', '', check),
      check,
      why: made[0].why,
      members: made.map((p) => ({ case: p.case, id: p.id })),
      state: 'proposed',
      at,
      made,
      cases,
      tells: tellsOfAll(
        made.map((p) => Object.fromEntries(p.answers.map((a, i) => [`${i}`, a.meets as Meets]))),
      ),
    })
  }
  storeEvery(
    skillDir,
    every.map(({ made: _, cases: __, tells: ___, ...stored }) => stored),
    asking?.drain() ?? [],
  )
  // One decided before keeps its state: a person's accept or drop is not undone by a new reading.
  const decided = new Map(readProposals(skillDir).every.map((e) => [e.id, e]))
  return {
    every: every.filter((e) => decided.get(e.id)?.state === 'proposed'),
    joining: { nearer, pairs, left },
    hidden,
  }
}

const keyOf = (answer: AnswerRef): string => `${answer.run}/${answer.sample}`

/** A stored proposal's parts as a screen reads them, but for whose it is. */
function shown(proposal: StoredProposal) {
  const { basis, shownBy, fault } = proposal
  return {
    check: proposal.check,
    why: proposal.why,
    basis: { in: basis.in, file: basis.in === 'input' ? basis.file : null, quote: basis.quote },
    fault: shownBy
      ? { key: keyOf(shownBy), file: fault?.file ?? null, quote: fault?.quote ?? null }
      : null,
    answers: proposal.answers.map((a) => ({ key: keyOf(a), meets: a.meets })),
  }
}

/**
 * The proposals kept for a skill, as a screen lists them: those for every
 * case first, then each case's own in the cases' order. A proposal that is
 * part of one for every case is not listed again under its case. One for
 * every case stands on its first member's words, shows the first fault any
 * member found, and holds every member's answers.
 */
export function proposedChecks(skillDir: string): ProposedCheck[] {
  const file = readProposals(skillDir)
  const order = loadCases(skillDir).map((c) => c.id)
  const place = (id: string): number => {
    const at = order.indexOf(id)
    return at < 0 ? order.length : at
  }
  const byPlace = <T extends { case: string }>(list: readonly T[]): T[] =>
    [...list].sort((a, b) => place(a.case) - place(b.case))
  const joined = new Set<string>()
  const every: ProposedCheck[] = []
  for (const group of file.every) {
    const made = byPlace(
      group.members.flatMap((m) =>
        file.proposals.filter((p) => p.case === m.case && p.id === m.id),
      ),
    )
    for (const p of made) joined.add(`${p.case}/${p.id}`)
    if (!made.length) continue
    const withFault = made.find((p) => p.shownBy)
    every.push({
      ...shown(made[0]),
      id: group.id,
      case: null,
      cases: [...new Set(made.map((p) => p.case))],
      check: group.check,
      why: group.why,
      fault: withFault ? shown(withFault).fault : null,
      answers: made.flatMap((p) => shown(p).answers),
      tells: tellsOfAll(
        made.map((p) => Object.fromEntries(p.answers.map((a, i) => [`${i}`, a.meets]))),
      ),
      state: group.state,
    })
  }
  const own = byPlace(file.proposals.filter((p) => !joined.has(`${p.case}/${p.id}`)))
  return [
    ...every,
    ...own.map((p) => ({
      ...shown(p),
      id: p.id,
      case: p.case,
      cases: [],
      tells: p.tells,
      state: p.state,
    })),
  ]
}

/** The named proposals of one case, each in a state `allowed` takes. Throws naming one that is not. */
function named(
  skillDir: string,
  caseId: string,
  ids: readonly string[],
  allowed: readonly ProposalState[],
): StoredProposal[] {
  if (!ids.length) throw new Error('Name the proposals by their ids.')
  const file = readProposals(skillDir)
  const mine = file.proposals.filter((p) => p.case === caseId)
  return ids.map((id) => {
    const found = mine.find((p) => p.id === id)
    if (!found) throw new Error(`No proposal ${id} for ${caseId}. Run st propose to list them.`)
    const group = file.every.find((e) => e.members.some((m) => m.case === caseId && m.id === id))
    if (group)
      throw new Error(
        `Proposal ${id} is part of ${group.id}, a proposal for every case. Name ${group.id} without --case.`,
      )
    if (!allowed.includes(found.state)) throw new Error(`Proposal ${id} is ${found.state} already.`)
    return found
  })
}

/**
 * Add the named proposals of one case to its checks, through the code that
 * writes a case, and mark them accepted. A proposal whose words a check of
 * the case, or a check for every case, has already is marked accepted and
 * not added twice. A proposal for every case is accepted by its own id, with
 * `acceptEveryCase`.
 */
export function acceptProposals(
  skillDir: string,
  caseId: string,
  ids: readonly string[],
): { added: StoredProposal[]; had: StoredProposal[] } {
  const testCase = loadCases(skillDir).find((c) => c.id === caseId)
  if (!testCase) throw new Error(`No case named ${caseId}.`)
  const chosen = named(skillDir, caseId, ids, ['proposed', 'dropped'])
  const draft = draftOf(testCase)
  const every = loadEveryCase(skillDir)
  const added: StoredProposal[] = []
  const had: StoredProposal[] = []
  for (const proposal of chosen) {
    const said = [...draft.graders.map((g) => g.statement), ...every.map((g) => g.statement)]
    if (said.some((statement) => sameWords(statement, proposal.check))) {
      had.push(proposal)
      continue
    }
    draft.graders.push({ id: null, statement: proposal.check, weight: 1, image: null })
    added.push(proposal)
  }
  if (added.length) saveCase(skillDir, draft, false)
  decideProposals(skillDir, caseId, ids, 'accepted')
  return { added, had }
}

/** Mark the named proposals of one case dropped, so they are not proposed again while the case asks the same. */
export function dropProposals(
  skillDir: string,
  caseId: string,
  ids: readonly string[],
): StoredProposal[] {
  named(skillDir, caseId, ids, ['proposed'])
  return decideProposals(skillDir, caseId, ids, 'dropped')
}

/** Propose again the named proposals of one case that were turned down: the Undo of a drop. */
export function restoreProposals(
  skillDir: string,
  caseId: string,
  ids: readonly string[],
): StoredProposal[] {
  named(skillDir, caseId, ids, ['dropped'])
  return decideProposals(skillDir, caseId, ids, 'proposed')
}

/** The named proposals for every case, each in a state `allowed` takes. Throws naming one that is not. */
function namedEvery(
  skillDir: string,
  ids: readonly string[],
  allowed: readonly ProposalState[],
): StoredEvery[] {
  if (!ids.length) throw new Error('Name the proposals by their ids.')
  const every = readProposals(skillDir).every
  return ids.map((id) => {
    const found = every.find((e) => e.id === id)
    if (!found)
      throw new Error(
        `No proposal for every case is called ${id}. A case's own needs --case <id>. Run st propose to list them.`,
      )
    if (!allowed.includes(found.state)) throw new Error(`Proposal ${id} is ${found.state} already.`)
    return found
  })
}

/**
 * Write each named proposal for every case as one check for every case, in
 * `evals/graders/` (`saveEveryCase`), and mark it and the proposals it is
 * made of accepted. No case's own checks change. One whose words a check for
 * every case has already is marked accepted and not written twice.
 */
export function acceptEveryCase(
  skillDir: string,
  ids: readonly string[],
): { added: Array<StoredEvery & { grader: string }>; had: StoredEvery[] } {
  const chosen = namedEvery(skillDir, ids, ['proposed', 'dropped'])
  const added: Array<StoredEvery & { grader: string }> = []
  const had: StoredEvery[] = []
  for (const proposal of chosen) {
    if (loadEveryCase(skillDir).some((g) => sameWords(g.statement, proposal.check))) {
      had.push(proposal)
      continue
    }
    added.push({ ...proposal, grader: saveEveryCase(skillDir, proposal.check) })
  }
  decideEvery(skillDir, ids, 'accepted')
  return { added, had }
}

/** Mark the named proposals for every case dropped, and the proposals they are made of, so none is proposed again. */
export function dropEveryCase(skillDir: string, ids: readonly string[]): StoredEvery[] {
  namedEvery(skillDir, ids, ['proposed'])
  return decideEvery(skillDir, ids, 'dropped')
}

/** Propose again the named proposals for every case that were turned down, and the proposals they are made of. */
export function restoreEveryCase(skillDir: string, ids: readonly string[]): StoredEvery[] {
  namedEvery(skillDir, ids, ['dropped'])
  return decideEvery(skillDir, ids, 'proposed')
}
