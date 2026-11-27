/**
 * The assistant reads a graded run: for each case, one session in a folder
 * made for it (`makeRoom`), with tools that only read, answers the rules and
 * checks it is asked about and says where it saw each. Code checks every
 * quote against the file it names, and counts how the answers stand against
 * the reader's own and against Jev's. Nothing is written to the skill: this
 * measures a reading, and what it measured is the caller's to keep.
 *
 * Before the assistant, Jev is asked again what it left, each fact in a
 * narrower state than a grading's (`askAgain`), and the assistant is asked
 * only what Jev is still not sure of.
 */
import type { AiProviderId, AiUsage } from '@domain/ai.ts'
import type { Verdict } from '@domain/pack.ts'
import {
  type AgainState,
  type Agreement,
  addAgreements,
  againMark,
  agreementOf,
  type CheckedMark,
  checkedFindings,
  checkedMarks,
  type Finding,
  factsAsked,
  filesMessage,
  parseReading,
  READING_BRIEF,
  READING_BRIEF_INLINE,
  READING_FIRST,
  READING_SCHEMA,
  type ReadFact,
  readFacts,
} from '@domain/reading.ts'
import type { ReportResult } from '@domain/schemas.ts'
import type { Span } from '@domain/span.ts'
import { type Cuts, checkIds, readingOf, verdictId } from '@domain/verdict.ts'
import { aiProvider } from '@infrastructure/ai/index.ts'
import { loadBench, loadCases } from '@infrastructure/cases.ts'
import {
  makeRoom,
  measuredLayout,
  type RoomSample,
  roomText,
} from '@infrastructure/reading-room.ts'
import { readKept, takenCase } from '@infrastructure/run-cases.ts'
import { readRun, runDir } from '@infrastructure/runs.ts'
import { type AgainFact, askAgain } from '@judges/generic/index.ts'
import type { GenericRaw } from '@judges/generic/score.ts'
import type { JevAsker } from '@judges/jev.ts'
import { correctionsOf, gradingInput, runVerdicts } from './grade.ts'

export interface ReadingOptions {
  /** The assistant to ask, and its model. */
  provider: AiProviderId
  model: string
  /** Empty for the model's own default. */
  effort: string
  /** The cases to read; every case the run answered when empty. */
  cases: string[]
  /** Ask every rule and check and show none of Jev's answers, to set the two against each other. */
  blind: boolean
  /**
   * Answers to count the reading against in place of the reader's own, by
   * output and by fact: an answer key, for a skill whose rules code can check.
   */
  answers?: Readonly<Record<string, Readonly<Record<string, boolean>>>>
  /** Sessions in flight at once. */
  parallel: number
  /**
   * Send each case's room to the model in one message, with no tools (true),
   * or start a session that reads it in a folder (false: `--deep`), which
   * sees a page as drawn and costs far more.
   */
  inline: boolean
  /**
   * Jev, asked again first of what it left, each fact in a narrower state than
   * a grading's (`askAgain`): a fact it is then sure of is its answer, and the
   * assistant is asked only the rest. Absent or null, the assistant is asked
   * everything Jev left, as with no TypeSafe key or `--no-jev`. A blind
   * reading never asks it.
   */
  jev?: JevAsker | null
  log: (line: string) => void
  signal: AbortSignal
}

/** What Jev was asked again, first, of what it had left (`ReadingOptions.jev`). */
export interface AgainRead {
  /** The facts it was asked again, each in a state narrower than the grading's. */
  asked: number
  /** Of those, the ones it was sure of: their answers are its, and the assistant was not asked them. */
  settled: number
  /** Why each request that failed did: its facts went to the assistant, as they would have. */
  failed: string[]
}

/** What one case's session made. */
export interface CaseRead {
  case: string
  /** The outputs it read, by folder name. */
  outputs: string[]
  /**
   * How many rules and checks the reading answers over those outputs: those
   * Jev left, or every one when it is blind. Those Jev settled when asked again
   * are among them, with their answers in `marks`.
   */
  asked: number
  marks: CheckedMark[]
  findings: Finding[]
  note: string
  usage: AiUsage
  seconds: number
  /** Why the session gave no reading, when it failed. */
  error: string | null
  /** What Jev was asked again before the assistant; absent when it was not asked. */
  again?: AgainRead
}

export interface RunReading {
  run: string
  provider: AiProviderId
  /** The model that answered, as its provider names it. */
  model: string
  blind: boolean
  cases: CaseRead[]
  agreement: Agreement
  usage: AiUsage
  /** What Jev was asked again, over every case; absent when it was not asked. */
  again?: AgainRead
  /**
   * `agreement` split by who answered, where Jev was asked again: Jev, on the
   * facts it was sure of then, and the assistant, on the rest. The two add up
   * to `agreement`. Absent when Jev was not asked again.
   */
  split?: AnswerSplit
}

/** A reading's counts, by who answered. */
export interface AnswerSplit {
  /** Jev's answers, asked again and sure. */
  jev: Agreement
  /** The assistant's answers, on what Jev left after that. */
  assistant: Agreement
}

/**
 * The counts over the cases that gave a reading, of the answers `who` names:
 * every one, Jev's asked again (one a fact it settled), or the assistant's,
 * on the facts Jev left after that.
 */
function agreementOver(
  cases: readonly CaseRead[],
  who: 'all' | 'jev' | 'assistant' = 'all',
): Agreement {
  return cases
    .filter((c) => !c.error)
    .map((c) => {
      const jev = c.marks.filter((m) => m.jev)
      if (who === 'jev') return agreementOf(jev, jev.length)
      if (who === 'assistant')
        return agreementOf(
          c.marks.filter((m) => !m.jev),
          c.asked - jev.length,
        )
      return agreementOf(c.marks, c.asked)
    })
    .reduce(addAgreements, agreementOf([], 0))
}

/** A reading's counts split by who answered (`RunReading.split`). */
const splitOf = (cases: readonly CaseRead[]): AnswerSplit => ({
  jev: agreementOver(cases, 'jev'),
  assistant: agreementOver(cases, 'assistant'),
})

const PROMPT =
  'Read sheet.md, then the request, the skill and each output it names, and answer as your instructions say.'

/** Run `work` over `items`, at most `limit` at once, in order of arrival. */
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

const NO_USAGE: AiUsage = { input: 0, output: 0 }

const NO_AGAIN: AgainRead = { asked: 0, settled: 0, failed: [] }

const addAgain = (a: AgainRead, b: AgainRead): AgainRead => ({
  asked: a.asked + b.asked,
  settled: a.settled + b.settled,
  failed: [...a.failed, ...b.failed],
})

/** A pack's stored answer on a fact, as `askAgain` reads it: how its parts were joined, where that was said. */
const spanOf = (answer: object): Span | null =>
  'span' in answer && typeof answer.span === 'string' ? (answer.span as Span) : null

/**
 * The rules and checks a grading's generic answers hold, each by the name its
 * verdict goes under (`verdictId`, `checkIds`): what it is to the pack, and
 * how the grading joined the answers of the output's parts.
 */
function genericFacts(raw: GenericRaw | undefined): Map<string, Omit<AgainFact, 'name' | 'saw'>> {
  const facts = new Map<string, Omit<AgainFact, 'name' | 'saw'>>()
  for (const rule of raw?.adherence?.rules ?? [])
    facts.set(verdictId('rule', rule.text), { kind: 'rule', id: rule.id, span: spanOf(rule) })
  const statements = raw?.rubric?.statements ?? []
  checkIds(statements).forEach((name, i) => {
    facts.set(name, { kind: 'check', id: statements[i].id, span: spanOf(statements[i]) })
  })
  return facts
}

/** One output after Jev was asked again: its facts as they now stand, Jev's sure answers, and what was asked. */
interface Asked {
  room: RoomSample
  marks: CheckedMark[]
  read: AgainRead
}

/**
 * Ask Jev again, first, what it left of one output (`askAgain`), as a grading
 * of the run puts the output to the packs (`gradingInput`), and keep each
 * answer it is now sure of under `cuts` as its own. The output's facts come
 * back with those standing as Jev answered, so the room asks the assistant only
 * the rest and shows those as marked. A fact no narrower state is built for,
 * and every fact of a request that failed, stays as the grading left it.
 */
async function askedAgain(
  skillDir: string,
  run: string,
  room: RoomSample,
  result: ReportResult | undefined,
  verdicts: readonly Verdict[],
  jev: JevAsker,
  cuts: Cuts,
  options: Pick<ReadingOptions, 'log' | 'signal'>,
): Promise<Asked> {
  const raw = result?.packs.generic as GenericRaw | undefined
  const named = genericFacts(raw)
  const facts = factsAsked(room.facts, false).flatMap((fact): AgainFact[] => {
    const at = named.get(fact.id)
    const code = verdicts.find((v) => v.id === fact.id)?.code
    // Code read it and would not call it: a sure answer of Jev's there is a guess (`SETS_ASIDE`).
    if (!at || (code?.stands && code.met === null)) return []
    return [{ name: fact.ref, ...at, saw: code?.saw ?? [] }]
  })
  if (!facts.length || options.signal.aborted) return { room, marks: [], read: NO_AGAIN }
  const output = room.sample.name
  let got: Awaited<ReturnType<typeof askAgain>>
  try {
    const input = gradingInput(skillDir, run, room.sample, options.log)
    got = await askAgain(
      input,
      facts,
      {
        parted: raw?.parts ?? null,
        drawn: result?.graded?.drawn === true,
        layout: measuredLayout(room.sample.path),
        skillDir,
      },
      (state, questions) => jev.ask(state, questions, options.signal),
      options.log,
    )
  } catch (error) {
    // Nothing is lost: the facts go to the assistant as they would have.
    const why = (error as Error)?.message ?? String(error)
    options.log(`${output}: Jev could not be asked again: ${why}`)
    return { room, marks: [], read: { asked: facts.length, settled: 0, failed: [why] } }
  }
  for (const { names, why } of got.failed)
    options.log(`${output}: Jev could not be asked ${names.join(', ')} again: ${why}`)
  const sure = new Map<string, { met: boolean; state: AgainState; noul: number }>()
  for (const [ref, { state, noul }] of Object.entries(got.answers)) {
    const reading = readingOf(noul, cuts)
    if (reading === 'met' || reading === 'missed')
      sure.set(ref, { met: reading === 'met', state, noul })
  }
  const settled = (fact: ReadFact): ReadFact => {
    const answer = sure.get(fact.ref)
    return answer ? { ...fact, jev: answer.met ? 'met' : 'missed' } : fact
  }
  return {
    room: { ...room, facts: room.facts.map(settled) },
    marks: room.facts.flatMap((fact) => {
      const answer = sure.get(fact.ref)
      return answer
        ? [againMark(output, fact, answer.met, { state: answer.state, noul: answer.noul })]
        : []
    }),
    read: {
      asked: Object.keys(got.answers).length + got.failed.reduce((n, f) => n + f.names.length, 0),
      settled: sure.size,
      failed: got.failed.map((f) => f.why),
    },
  }
}

/**
 * Read a graded run's outputs, case by case. Unless the reading is blind, Jev
 * is first asked again what it left (`ReadingOptions.jev`, `askedAgain`), and
 * the assistant only what it is still not sure of. A case with nothing left to
 * ask (Jev was sure of every rule and check, at grading or asked again)
 * starts no session. A session that fails is said in its case, and the rest
 * go on.
 */
export async function readingOfRun(
  skillDir: string,
  run: string,
  options: ReadingOptions,
): Promise<RunReading> {
  const provider = aiProvider(options.provider)
  const read = provider.readFolder
  if (!options.inline && !read)
    throw new Error(
      `${options.provider} cannot be held to reading one folder yet. Use claude-code.`,
    )
  const live = loadCases(skillDir)
  const view = readRun(skillDir, run, live)
  if (!view.report) throw new Error(`${run} is not graded. Run: st grade --run ${run}`)
  const dir = runDir(skillDir, run)
  const { kept } = readKept(dir)
  const verdicts = runVerdicts(skillDir, view.report, view.cases, correctionsOf(skillDir, run))
  const caseOf = new Map(view.report.results.map((result) => [result.sample, result.case]))
  const results = new Map(view.report.results.map((result) => [result.sample, result]))
  const cuts = loadBench(skillDir)
  const jev = options.blind ? null : (options.jev ?? null)

  /** An output's facts, each with the answer it is counted against: the reader's own, or the key's. */
  const factsOf = (sample: string) => {
    const facts = readFacts(verdicts[sample])
    const { answers } = options
    if (!answers) return facts
    const key = Object.hasOwn(answers, sample) ? answers[sample] : {}
    return facts.map((fact) => ({
      ...fact,
      yours: Object.hasOwn(key, fact.id) ? key[fact.id] : null,
    }))
  }

  /** The run's finished outputs with a grading, by case. */
  const byCase = new Map<string, RoomSample[]>()
  for (const sample of view.samples) {
    const id = caseOf.get(sample.name)
    if (sample.cut || !id || !Object.hasOwn(verdicts, sample.name)) continue
    byCase.set(id, [...(byCase.get(id) ?? []), { sample, facts: factsOf(sample.name) }])
  }
  const wanted = options.cases.length ? options.cases : [...byCase.keys()]
  let model = options.model

  const cases = await pooled(wanted, options.parallel, async (id): Promise<CaseRead> => {
    const samples = byCase.get(id) ?? []
    const base = {
      case: id,
      outputs: samples.map((s) => s.sample.name),
      marks: [],
      findings: [],
      note: '',
      usage: NO_USAGE,
      seconds: 0,
    }
    const taken = takenCase(
      skillDir,
      kept?.find((entry) => entry.case.id === id) ?? null,
      live.find((testCase) => testCase.id === id) ?? null,
    )
    if (!samples.length || !taken)
      return { ...base, asked: 0, error: 'The run has no graded output for this case.' }
    const asked = samples.reduce((n, s) => n + factsAsked(s.facts, options.blind).length, 0)
    const again = jev
      ? await Promise.all(
          samples.map((s) =>
            askedAgain(
              skillDir,
              run,
              s,
              results.get(s.sample.name),
              verdicts[s.sample.name] ?? [],
              jev,
              cuts,
              options,
            ),
          ),
        )
      : null
    const settled = {
      marks: again?.flatMap((a) => a.marks) ?? [],
      ...(again ? { again: again.map((a) => a.read).reduce(addAgain, NO_AGAIN) } : {}),
    }
    const room = makeRoom({
      runDir: dir,
      caseId: id,
      request: taken.case.prompt,
      samples: again?.map((a) => a.room) ?? samples,
      blind: options.blind,
    })
    const left = Object.values(room.outputs).reduce((sum, o) => sum + o.asked.length, 0)
    try {
      if (!left) {
        options.log(
          asked
            ? `${id}: nothing left to ask the assistant, Jev was sure of every rule and check it was asked again.`
            : `${id}: nothing to ask, Jev was sure of every rule and check.`,
        )
        return { ...base, ...settled, asked, error: null }
      }
      if (options.signal.aborted) return { ...base, ...settled, asked, error: 'Stopped.' }
      options.log(`${id}: reading ${samples.length} output(s), ${left} to answer.`)
      const begun = Date.now()
      const reply =
        options.inline || !read
          ? await provider.run({
              operation: 'read',
              model: options.model,
              effort: options.effort,
              system: READING_BRIEF_INLINE,
              messages: [
                { role: 'user', text: filesMessage(roomText(room.dir), PROMPT, READING_FIRST) },
              ],
              schema: READING_SCHEMA,
              signal: options.signal,
              onText: () => {},
            })
          : await read({
              operation: 'read',
              model: options.model,
              effort: options.effort,
              system: READING_BRIEF,
              prompt: PROMPT,
              dir: room.dir,
              schema: READING_SCHEMA,
              signal: options.signal,
            })
      model = reply.model
      const reading = parseReading(reply.text)
      return {
        ...base,
        ...settled,
        asked,
        marks: [...settled.marks, ...checkedMarks(reading.marks, room.outputs)],
        findings: checkedFindings(reading.findings, room.outputs),
        note: reading.note,
        usage: reply.usage,
        seconds: Math.round((Date.now() - begun) / 1000),
        error: null,
      }
    } catch (error) {
      return {
        ...base,
        ...settled,
        asked,
        error: options.signal.aborted ? 'Stopped.' : (error as Error).message,
      }
    } finally {
      room.dispose()
    }
  })

  return {
    run,
    provider: options.provider,
    model,
    blind: options.blind,
    cases,
    agreement: agreementOver(cases),
    usage: cases.reduce(
      (sum, c) => ({ input: sum.input + c.usage.input, output: sum.output + c.usage.output }),
      NO_USAGE,
    ),
    ...(jev
      ? {
          again: cases.map((c) => c.again ?? NO_AGAIN).reduce(addAgain, NO_AGAIN),
          split: splitOf(cases),
        }
      : {}),
  }
}

/**
 * A reading made before, counted again against the reader's answers as they
 * stand now: each mark's `yours` is read afresh from the run's corrections,
 * and the agreement counted again. Asks no model. A mark on a fact the run no
 * longer grades keeps no answer of the reader's.
 */
export function recountReading(skillDir: string, reading: RunReading): RunReading {
  const view = readRun(skillDir, reading.run)
  if (!view.report) throw new Error(`${reading.run} is not graded.`)
  const verdicts = runVerdicts(
    skillDir,
    view.report,
    view.cases,
    correctionsOf(skillDir, reading.run),
  )
  const yoursOf = (output: string, fact: string): boolean | null =>
    Object.hasOwn(verdicts, output)
      ? (readFacts(verdicts[output]).find((f) => f.id === fact)?.yours ?? null)
      : null
  const cases = reading.cases.map((c) => ({
    ...c,
    marks: c.marks.map((mark) => ({
      ...mark,
      fact: { ...mark.fact, yours: yoursOf(mark.output, mark.fact.id) },
    })),
  }))
  return {
    ...reading,
    cases,
    agreement: agreementOver(cases),
    // A reading saved before Jev was asked again has no split, and is given none.
    ...(reading.split ? { split: splitOf(cases) } : {}),
  }
}
