/**
 * The assistant reads a graded run: for each case, one session in a folder
 * made for it (`makeRoom`), with tools that only read, answers the rules and
 * checks it is asked about and says where it saw each. Code checks every
 * quote against the file it names, and counts how the answers stand against
 * the reader's own and against Jev's. Nothing is written to the skill: this
 * measures a reading, and what it measured is the caller's to keep.
 */
import type { AiProviderId, AiUsage } from '@domain/ai.ts'
import {
  type Agreement,
  addAgreements,
  agreementOf,
  type CheckedMark,
  checkedFindings,
  checkedMarks,
  type Finding,
  filesMessage,
  parseReading,
  READING_BRIEF,
  READING_BRIEF_INLINE,
  READING_FIRST,
  READING_SCHEMA,
  readFacts,
} from '@domain/reading.ts'
import { aiProvider } from '@infrastructure/ai/index.ts'
import { recordUsage } from '@infrastructure/ai/store.ts'
import { loadCases } from '@infrastructure/cases.ts'
import { makeRoom, type RoomSample, roomText } from '@infrastructure/reading-room.ts'
import { readKept, takenCase } from '@infrastructure/run-cases.ts'
import { readRun, runDir } from '@infrastructure/runs.ts'
import { correctionsOf, runVerdicts } from './grade.ts'

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
  log: (line: string) => void
  signal: AbortSignal
}

/** What one case's session made. */
export interface CaseRead {
  case: string
  /** The outputs it read, by folder name. */
  outputs: string[]
  /** How many rules and checks it was asked about, over those outputs. */
  asked: number
  marks: CheckedMark[]
  findings: Finding[]
  note: string
  usage: AiUsage
  seconds: number
  /** Why the session gave no reading, when it failed. */
  error: string | null
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
}

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

/**
 * Read a graded run's outputs, case by case. A case with nothing to ask (Jev
 * was sure of every rule and check, in a reading that is not blind) starts no
 * session. A session that fails is said in its case, and the rest go on.
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
    const room = makeRoom({
      runDir: dir,
      caseId: id,
      request: taken.case.prompt,
      samples,
      blind: options.blind,
    })
    const asked = Object.values(room.outputs).reduce((sum, o) => sum + o.asked.length, 0)
    try {
      if (!asked) {
        options.log(`${id}: nothing to ask, Jev was sure of every rule and check.`)
        return { ...base, asked, error: null }
      }
      if (options.signal.aborted) return { ...base, asked, error: 'Stopped.' }
      options.log(`${id}: reading ${samples.length} output(s), ${asked} to answer.`)
      const begun = Date.now()
      const reply =
        options.inline || !read
          ? await provider.run({
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
              model: options.model,
              effort: options.effort,
              system: READING_BRIEF,
              prompt: PROMPT,
              dir: room.dir,
              schema: READING_SCHEMA,
              signal: options.signal,
            })
      model = reply.model
      try {
        recordUsage({
          at: new Date().toISOString(),
          provider: options.provider,
          model: reply.model,
          ...reply.usage,
        })
      } catch (error) {
        // The log is a record beside the reading, never part of it.
        console.warn(`The usage log could not be written: ${(error as Error).message}`)
      }
      const reading = parseReading(reply.text)
      return {
        ...base,
        asked,
        marks: checkedMarks(reading.marks, room.outputs),
        findings: checkedFindings(reading.findings, room.outputs),
        note: reading.note,
        usage: reply.usage,
        seconds: Math.round((Date.now() - begun) / 1000),
        error: null,
      }
    } catch (error) {
      return {
        ...base,
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
    agreement: cases
      .filter((c) => !c.error)
      .map((c) => agreementOf(c.marks, c.asked))
      .reduce(addAgreements, agreementOf([], 0)),
    usage: cases.reduce(
      (sum, c) => ({ input: sum.input + c.usage.input, output: sum.output + c.usage.output }),
      NO_USAGE,
    ),
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
    agreement: cases
      .filter((c) => !c.error)
      .map((c) => agreementOf(c.marks, c.asked))
      .reduce(addAgreements, agreementOf([], 0)),
  }
}
