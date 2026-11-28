/**
 * Sorting a skill: the assistant reads each rule of the skill and each check
 * of its cases and says how it is marked (`domain/sorting.ts`). One call
 * reads every rule, with the whole SKILL.md and what the cases' requests look
 * like; one call per case reads that case's checks, with its request and
 * files. Several calls, not one, so a case's files are read in full beside
 * its own checks and never beside another case's, and so one long reply
 * cannot run past a provider's time limit.
 *
 * A case's checks are its own and the checks for every case
 * (`evals/graders/`), read beside that case's request as its own are, since
 * what a check needs can differ from one request to the next.
 *
 * Only `st sort` starts this: it spends the person's own model usage, so
 * nothing in a run, a grading or the app calls it by itself. A reading that
 * is still current is kept and not asked again, unless `again` says to.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type AiChoice, type AiProviderId, type AiUsage, resolveChoice } from '@domain/ai.ts'
import { type Asked, bothHold, everywhere, sameScope } from '@domain/both-hold.ts'
import { inputName } from '@domain/case-draft.ts'
import { isEveryCase, withEveryCase } from '@domain/every-case.ts'
import { answerExact, type ExactSubject, outputOf } from '@domain/exact.ts'
import type { Verdict } from '@domain/pack.ts'
import { aiChoiceOf } from '@domain/preferences.ts'
import type { RuleReading } from '@domain/rule-reading.ts'
import { headingOf, type Rule } from '@domain/rules.ts'
import type { Case } from '@domain/schemas.ts'
import {
  CHECKS_SCHEMA,
  checksPrompt,
  type Decided,
  FALLBACK,
  type Flagged,
  parseSorted,
  type RequestFile,
  type RequestShown,
  retryPrompt,
  rulesPrompt,
  SORT_BRIEF,
  SORT_PROMPT_VERSION,
  SORT_SCHEMA,
  type SortedEntry,
  type SortedReading,
} from '@domain/sorting.ts'
import { checkIds, verdictId } from '@domain/verdict.ts'
import { aiProvider, aiProviderInfo, isProviderError } from '@infrastructure/ai/index.ts'
import type { AiMessage } from '@infrastructure/ai/types.ts'
import { loadBench, loadCases, loadEveryCase, loadRules } from '@infrastructure/cases.ts'
import { isDir, isFile, textOf, treeFiles } from '@infrastructure/fs.ts'
import { readPreferences } from '@infrastructure/preferences.ts'
import {
  askStamp,
  checkStamp,
  readStored,
  ruleStamp,
  type StoredReading,
  storeReadings,
} from '@infrastructure/rule-readings.ts'
import { listRuns } from '@infrastructure/runs.ts'
import { savedReplies } from '@judges/replies.ts'
import { correctionsOf, runVerdicts, storedSubjects } from './grade.ts'

export interface SortOptions {
  /** The model to ask in place of the one set in Settings, on the same assistant. */
  model?: string
  /** Its effort, with `model`; empty for the model's own. */
  effort?: string
  /** Ask again for readings that are still current. */
  again: boolean
  /** Calls in flight at once. */
  parallel: number
  log: (line: string) => void
  signal: AbortSignal
}

/** One rule or check as it was sorted. */
export interface SortedItem {
  kind: 'rule' | 'check'
  /** Its short name in the skill: `r3`, or a check's `c2` within its case. */
  ref: string
  /** The id its verdict carries, which `currentReadings` returns it by. */
  id: string
  text: string
  /** Null when the call that was to read it failed: it has no reading. */
  stored: StoredReading | null
  /** Kept from an earlier sort, so not asked again. */
  kept: boolean
  /** A check for every case (`evals/graders/`), read for this case as its own are. */
  every?: true
}

/** One call to the model, and what came of it. */
export interface SortCall {
  /** `rules`, or the case id whose checks it read. */
  what: string
  asked: number
  /** Readings the parser refused on the first reply, and again on the second. */
  refusedOnce: number
  refusedTwice: number
  usage: AiUsage
  seconds: number
  error: string | null
}

export interface SortResult {
  provider: AiProviderId
  model: string
  effort: string
  rules: SortedItem[]
  cases: Array<{ case: string; title: string; checks: SortedItem[] }>
  calls: SortCall[]
  usage: AiUsage
  /** Each pair of exact readings code worked out, over every reading that stands now. */
  decided: Decided[]
  /** Each output a new exact reading answers otherwise than the sure answer a run kept there. */
  flagged: Flagged[]
}

const NO_USAGE: AiUsage = { input: 0, output: 0 }
const add = (a: AiUsage, b: AiUsage): AiUsage => ({
  input: a.input + b.input,
  output: a.output + b.output,
})

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

/**
 * The model a sort asks: the one set in Settings, or the one named, on the
 * same assistant. Throws when no assistant is set up, before anything is asked.
 * A replay asks no assistant what it offers, so it takes the model named, on
 * the assistant in Settings or else Claude Code, and throws without one.
 */
export async function sortChoice(
  options: Pick<SortOptions, 'model' | 'effort'>,
): Promise<AiChoice> {
  if (savedReplies()?.mode === 'replay') {
    if (!options.model) throw new Error('A replay asks no assistant, so name the model: --model.')
    return {
      provider: aiChoiceOf(readPreferences())?.provider ?? 'claude-code',
      model: options.model,
      effort: options.effort ?? '',
    }
  }
  const choice = resolveChoice(aiChoiceOf(readPreferences()), await aiProviderInfo())
  if (!choice) throw new Error('Set up the assistant in Settings first.')
  return options.model
    ? { ...choice, model: options.model, effort: options.effort ?? '' }
    : options.effort !== undefined
      ? { ...choice, effort: options.effort }
      : choice
}

/** A case's input files that read as text, by the name the agent gets each under. */
function requestFiles(skillDir: string, testCase: Case): RequestFile[] {
  const files: RequestFile[] = []
  const take = (path: string, name: string) => {
    const text = textOf(readFileSync(path))
    if (text !== null) files.push({ name, text })
  }
  for (const rel of testCase.files) {
    const path = join(skillDir, rel)
    const name = inputName(testCase, rel)
    if (isFile(path)) take(path, name)
    else if (isDir(path))
      for (const file of treeFiles(path, { hidden: true })) take(file.real, `${name}/${file.rel}`)
  }
  return files
}

const shownOf = (skillDir: string, testCase: Case): RequestShown => ({
  case: testCase.id,
  graded: testCase.bench.artifact ?? null,
  prompt: testCase.prompt,
  files: requestFiles(skillDir, testCase),
})

/** What one rule or check is asked as, and where its reading goes. */
interface Ask {
  ref: string
  id: string
  text: string
  stamp: string
  kind: 'rule' | 'check'
  case: string | null
  every?: true
}

/**
 * Ask `asks` in one call, and once more for those the parser refused, with
 * what was wrong. A reading refused twice is the fallback, with why it was
 * refused each time. Throws only when the first reply fails to arrive.
 */
async function sortCall(
  choice: AiChoice,
  prompt: string,
  asks: readonly Ask[],
  signal: AbortSignal,
  /** For a checks call, the case's rules by the id the model is shown (`r4`), with their words. */
  rules?: ReadonlyArray<{ id: string; text: string }>,
): Promise<{ entries: StoredReading[]; call: Omit<SortCall, 'what' | 'seconds' | 'error'> }> {
  const provider = aiProvider(choice.provider)
  let usage = NO_USAGE
  const ask = async (messages: AiMessage[]): Promise<string> => {
    try {
      const reply = await provider.run({
        operation: 'sort',
        model: choice.model,
        effort: choice.effort,
        system: SORT_BRIEF,
        messages,
        schema: rules ? CHECKS_SCHEMA : SORT_SCHEMA,
        signal,
        onText: () => {},
      })
      usage = add(usage, reply.usage)
      model = reply.model
      return reply.text
    } catch (error) {
      if (isProviderError(error)) {
        usage = add(usage, error.usage)
      }
      throw error
    }
  }
  let model = choice.model
  const ids = asks.map((a) => a.ref)
  const ruleIds = rules?.map((r) => r.id)
  const first = await ask([{ role: 'user', text: prompt }])
  const firstEntries = parseSorted(first, ids, ruleIds)
  const refused = firstEntries.filter(
    (e): e is Extract<SortedEntry, { refused: string }> => 'refused' in e,
  )
  const byRef = new Map(firstEntries.map((e) => [e.id, e]))
  const why = new Map<string, string[]>(refused.map((r) => [r.id, [r.refused]]))
  if (refused.length && !signal.aborted) {
    let second: SortedEntry[]
    try {
      const text = await ask([
        { role: 'user', text: prompt },
        { role: 'assistant', text: first },
        { role: 'user', text: retryPrompt(refused.map((r) => ({ id: r.id, why: r.refused }))) },
      ])
      second = parseSorted(
        text,
        refused.map((r) => r.id),
        ruleIds,
      )
    } catch (error) {
      if (signal.aborted) throw error
      second = refused.map((r) => ({
        id: r.id,
        refused: `the second reply failed: ${(error as Error).message}`,
      }))
    }
    for (const entry of second) {
      byRef.set(entry.id, entry)
      if ('refused' in entry) why.get(entry.id)?.push(entry.refused)
    }
  }
  const at = new Date().toISOString()
  const entries = asks.map((item): StoredReading => {
    const entry = byRef.get(item.ref)
    const taken = entry && 'reading' in entry ? entry : null
    // A rule a check cannot hold beside is kept by its words: ids are only the names the model was shown.
    const against = (taken?.against ?? []).flatMap((a) => {
      const rule = rules?.find((r) => r.id === a.rule)
      return rule ? [{ rule: rule.text, fix: a.fix }] : []
    })
    return {
      stamp: item.stamp,
      kind: item.kind,
      text: item.text,
      case: item.case,
      reading: taken ? taken.reading : FALLBACK,
      ...(item.kind === 'check' ? { against } : {}),
      reason: taken ? taken.reason : '',
      refused: why.get(item.ref) ?? [],
      provider: choice.provider,
      model,
      at,
      prompt: SORT_PROMPT_VERSION,
    }
  })
  return {
    entries,
    call: {
      asked: asks.length,
      refusedOnce: refused.length,
      refusedTwice: entries.filter((e) => e.refused.length > 1).length,
      usage,
    },
  }
}

/**
 * The reading each rule's or check's words were last given under another
 * stamp: for a rule, its words in another SKILL.md; for a check, its words in
 * the same case, read beside another SKILL.md or another form of the
 * request. The model is shown it beside the words, so a reading moves between
 * versions only for a reason. A fallback is no reading, and is not shown.
 * Where code set the assistant's reading aside, the assistant's own is
 * shown, so code holds the next version's readings to the same test.
 */
function earlierReadings(current: readonly StoredReading[]): (ask: Ask) => RuleReading | null {
  const latest = new Map<string, StoredReading>()
  const keyOf = (kind: string, caseId: string | null, text: string) =>
    JSON.stringify([kind, caseId, text.trim()])
  for (const entry of current) {
    const own = ownReading(entry)
    if (own.reading === 'judged' && own.span === null) continue
    const key = keyOf(entry.kind, entry.case, entry.text)
    const held = latest.get(key)
    if (!held || held.at < entry.at) latest.set(key, entry)
  }
  return (ask) => {
    const found = latest.get(keyOf(ask.kind, ask.case, ask.text))
    return found && found.stamp !== ask.stamp ? (ownReading(found) as RuleReading) : null
  }
}

/** One rule or check that has a reading after the calls, made by this sort or kept from one before. */
interface Standing {
  ask: Ask
  entry: StoredReading
}

type Exact = Extract<RuleReading, { reading: 'exact' }>
type Against = NonNullable<StoredReading['against']>

const exactOf = (reading: SortedReading): Exact | null =>
  reading.reading === 'exact' ? reading : null

/** The assistant's own reading, and a check's own `against`, before code's word on them. */
const ownReading = (entry: StoredReading): SortedReading =>
  entry.assistant?.reading ?? entry.reading
const ownAgainst = (entry: StoredReading): Against =>
  entry.assistant?.against ?? entry.against ?? []

const sameRule = (a: string, b: string): boolean => a.trim() === b.trim()
const sameAgainst = (a: Against, b: Against): boolean =>
  a.length === b.length && a.every((x, i) => sameRule(x.rule, b[i].rule) && x.fix === b[i].fix)

/**
 * `entry` with code's word kept: `reading` for a rule, `against` for a check,
 * and what the assistant said under `assistant` where code's word differs.
 */
function withCodeWord(
  entry: StoredReading,
  reading: SortedReading,
  against: Against | null,
): StoredReading {
  const { assistant: _said, ...rest } = entry
  const said: NonNullable<StoredReading['assistant']> = {}
  const own = ownReading(entry)
  // Code makes a reading of its own only where it sets the assistant's aside.
  if (reading !== own) said.reading = own
  const ownList = ownAgainst(entry)
  const changed = against !== null && !sameAgainst(against, ownList)
  if (changed) said.against = ownList
  return {
    ...rest,
    reading,
    ...(changed ? { against } : entry.assistant?.against ? { against: ownList } : {}),
    ...(Object.keys(said).length ? { assistant: said } : {}),
  }
}

/** A case's request as code draws a reading's values from it, with the kind of output it is graded on. */
function askedOf(skillDir: string, testCase: Case): Asked {
  const shown = shownOf(skillDir, testCase)
  const graded = testCase.bench.artifact
  const kind = graded ? outputOf(graded) : null
  return {
    case: testCase.id,
    request: shown.prompt,
    files: Object.fromEntries(shown.files.map((file) => [file.name, file.text])),
    kinds: graded ? (kind ? [kind] : []) : null,
  }
}

/**
 * Code's word on each pair of exact readings that stand: two rules, over
 * every case's request, and each check beside each rule, over its own case's
 * (`bothHold`). Two rules are held together only where grading surely asks
 * both of the same outputs (`sameScope`: one heading, no condition of either's
 * own), and a check only beside a rule grading asks of every output
 * (`everywhere`). Where code finds two rules no output can meet both of, both
 * are set aside as in conflict, each naming the first rule it cannot hold
 * beside. Where code finds a rule cannot hold beside a check, or can, the
 * check's `against` names it, or does not; a rule code set aside is not held
 * beside a check. Everywhere else the assistant's word stands. What the
 * assistant said is read from `assistant` where code spoke before, so the same
 * readings over the same cases are decided the same way, and a case added or
 * changed is held to on the next sort.
 */
function settle(
  rules: ReadonlyArray<Standing & { rule: Rule }>,
  cases: ReadonlyArray<{ asked: Asked; checks: readonly Standing[] }>,
): { decided: Decided[]; entries: StoredReading[] } {
  const decided: Decided[] = []
  const requests = cases.map((c) => c.asked)
  const own = rules.map((rule) => exactOf(ownReading(rule.entry)))
  const beside = new Map<number, number>()
  for (const [i, a] of own.entries())
    for (const [j, b] of own.entries()) {
      if (j <= i || !a || !b || !sameScope(rules[i].rule, rules[j].rule)) continue
      const held = bothHold(a, b, requests)
      if (!held) continue
      decided.push({
        kind: 'rules',
        case: null,
        ref: rules[i].ask.ref,
        rule: rules[j].ask.ref,
        holds: held.holds,
        assistant: true,
        on: held,
      })
      if (held.holds) continue
      if (!beside.has(i)) beside.set(i, j)
      if (!beside.has(j)) beside.set(j, i)
    }
  const entries: StoredReading[] = []
  const standing = rules.map((rule, i) => {
    const other = beside.get(i)
    const reading: SortedReading =
      other === undefined
        ? ownReading(rule.entry)
        : { reading: 'unmarkable', why: 'conflict', with: rules[other].ask.ref, fix: null }
    entries.push(withCodeWord(rule.entry, reading, null))
    return exactOf(reading)
  })
  for (const { asked, checks } of cases)
    for (const check of checks) {
      const reading = exactOf(check.entry.reading)
      const said = ownAgainst(check.entry)
      let against = [...said]
      for (const [i, rule] of rules.entries()) {
        const ruleReading = standing[i]
        if (!reading || !ruleReading || !everywhere(rule.rule)) continue
        const held = bothHold(reading, ruleReading, [asked])
        if (!held) continue
        const named = said.some((a) => sameRule(a.rule, rule.ask.text))
        decided.push({
          kind: 'check',
          case: asked.case,
          ref: check.ask.ref,
          rule: rule.ask.ref,
          holds: held.holds,
          assistant: !named,
          on: held,
        })
        if (held.holds) against = against.filter((a) => !sameRule(a.rule, rule.ask.text))
        else if (!against.some((a) => sameRule(a.rule, rule.ask.text)))
          against.push({ rule: rule.ask.text, fix: null })
      }
      entries.push(withCodeWord(check.entry, check.entry.reading, against))
    }
  return { decided, entries }
}

/** The answer an output's grading kept on a fact that counts as sure: the person's own mark, else Jev's where it was sure. */
function keptAnswer(fact: Verdict): { met: boolean; by: 'jev' | 'reader' } | null {
  if (fact.corrected) return { met: fact.met, by: 'reader' }
  return fact.open && typeof fact.jev === 'boolean' ? { met: fact.jev, by: 'jev' } : null
}

/**
 * Each new exact reading held to the answers every run's grading kept for
 * the same rule, or the same check of the same case: on each graded output,
 * code answers with the new reading, and where it answers met or missed and
 * the answer kept is the other, the output is flagged. An answer Jev was not
 * sure of, an output with no answer kept, and one code gives no answer on
 * flag nothing. A run that cannot be read is said in the log and passed over.
 */
function flagsOf(
  skillDir: string,
  fresh: ReadonlyArray<{ ask: Ask; reading: Exact }>,
  log: (line: string) => void,
): Flagged[] {
  const flagged: Flagged[] = []
  for (const view of listRuns(skillDir)) {
    const { report } = view
    if (!report) continue
    try {
      const verdicts = runVerdicts(skillDir, report, view.cases, correctionsOf(skillDir, view.name))
      const subjectOf = storedSubjects(skillDir, view.name)
      for (const result of report.results) {
        const sample = view.samples.find((s) => s.name === result.sample && !s.cut)
        const facts = Object.hasOwn(verdicts, result.sample) ? verdicts[result.sample] : null
        if (!sample || !facts) continue
        let subject: ExactSubject | null | undefined
        for (const { ask, reading } of fresh) {
          if (ask.kind === 'check' && ask.case !== result.case) continue
          const fact = facts.find((v) => v.kind === ask.kind && sameRule(v.text, ask.text))
          const kept = fact ? keptAnswer(fact) : null
          if (!kept) continue
          if (subject === undefined) subject = subjectOf(result, sample)
          if (!subject) break
          const code = answerExact(reading, subject)
          if (code.answer === 'none' || (code.answer === 'met') === kept.met) continue
          flagged.push({
            kind: ask.kind,
            ref: ask.ref,
            case: ask.case,
            text: ask.text,
            run: view.name,
            sample: result.sample,
            code: code.answer === 'met',
            kept: kept.met,
            by: kept.by,
          })
        }
      }
    } catch (error) {
      log(`The new readings were not held to ${view.name}: ${(error as Error).message}`)
    }
  }
  return flagged
}

/**
 * Sort the skill in `skillDir` as it is now: every rule of its SKILL.md (or
 * of `bench.json`'s `rules`) and every check of every case. What is sorted is
 * kept in `evals/rule-readings.json` (`storeReadings`) as each call ends, so
 * a call that fails loses only its own.
 *
 * Then code has its word on every pair of exact readings that stand
 * (`settle`), and what it changes is kept too; and each new exact reading is
 * held to the answers the skill's runs kept for the same words (`flagsOf`).
 */
export async function sortSkill(skillDir: string, options: SortOptions): Promise<SortResult> {
  const choice = await sortChoice(options)
  const skillMd = readFileSync(join(skillDir, 'SKILL.md'), 'utf8')
  const rules = loadRules(skillDir, loadBench(skillDir))
  // A case's checks are its own, then the checks for every case.
  const every = loadEveryCase(skillDir)
  const cases = loadCases(skillDir).map((testCase) => withEveryCase(testCase, every))
  const stored = new Map(
    readStored(skillDir)
      .filter((entry) => entry.prompt === SORT_PROMPT_VERSION)
      .map((entry) => [entry.stamp, entry]),
  )
  const isKept = (stamp: string) => !options.again && stored.has(stamp)
  const earlier = earlierReadings([...stored.values()])

  const ruleAsks: Ask[] = rules.map((rule) => ({
    ref: rule.id,
    id: verdictId('rule', rule.text),
    text: rule.text,
    stamp: ruleStamp(skillMd, rule.text),
    kind: 'rule',
    case: null,
  }))
  const caseAsks = cases.map((testCase) => {
    const ask = askStamp(skillDir, testCase)
    const ids = checkIds(testCase.graders.map((g) => ({ id: g.id, text: g.statement })))
    return {
      testCase,
      asks: testCase.graders.map(
        (grader, i): Ask => ({
          ref: `c${i + 1}`,
          id: ids[i],
          text: grader.statement,
          stamp: checkStamp(skillMd, ask, grader.statement),
          kind: 'check',
          case: testCase.id,
          ...(isEveryCase(grader) ? { every: true as const } : {}),
        }),
      ),
    }
  })

  const made = new Map<string, StoredReading>()
  const jobs: Array<{
    what: string
    asks: Ask[]
    prompt: () => string
    rules?: Array<{ id: string; text: string }>
  }> = []
  const allRules = rules.map((rule) => ({
    id: rule.id,
    text: rule.text,
    heading: headingOf(rule),
  }))
  const wantedRules = ruleAsks.filter((a) => !isKept(a.stamp))
  if (wantedRules.length)
    jobs.push({
      what: 'rules',
      asks: wantedRules,
      prompt: () =>
        rulesPrompt({
          skillMd,
          rules: wantedRules.map((a) => ({
            id: a.ref,
            text: a.text,
            heading: allRules.find((r) => r.id === a.ref)?.heading ?? null,
            earlier: earlier(a),
          })),
          requests: cases.map((c) => shownOf(skillDir, c)),
        }),
    })
  for (const { testCase, asks } of caseAsks) {
    const wanted = asks.filter((a) => !isKept(a.stamp))
    if (wanted.length)
      jobs.push({
        what: testCase.id,
        asks: wanted,
        prompt: () =>
          checksPrompt({
            skillMd,
            rules: allRules,
            request: shownOf(skillDir, testCase),
            checks: wanted.map((a) => ({ id: a.ref, text: a.text, earlier: earlier(a) })),
          }),
        rules: allRules.map((r) => ({ id: r.id, text: r.text })),
      })
  }

  let model = choice.model
  const calls = await pooled(jobs, options.parallel, async (job): Promise<SortCall> => {
    const base = { what: job.what, asked: job.asks.length, refusedOnce: 0, refusedTwice: 0 }
    if (options.signal.aborted) return { ...base, usage: NO_USAGE, seconds: 0, error: 'Stopped.' }
    options.log(
      job.what === 'rules'
        ? `Reading ${job.asks.length} rule(s).`
        : `${job.what}: reading ${job.asks.length} check(s).`,
    )
    const begun = Date.now()
    try {
      const { entries, call } = await sortCall(
        choice,
        job.prompt(),
        job.asks,
        options.signal,
        job.rules,
      )
      if (options.signal.aborted) throw new Error('Stopped.')
      storeReadings(skillDir, entries)
      for (const entry of entries) made.set(entry.stamp, entry)
      model = entries[0]?.model ?? model
      return { ...base, ...call, seconds: Math.round((Date.now() - begun) / 1000), error: null }
    } catch (error) {
      return {
        ...base,
        usage: NO_USAGE,
        seconds: Math.round((Date.now() - begun) / 1000),
        error: options.signal.aborted ? 'Stopped.' : (error as Error).message,
      }
    }
  })

  const entryOf = (ask: Ask): StoredReading | null =>
    made.get(ask.stamp) ?? (isKept(ask.stamp) ? (stored.get(ask.stamp) ?? null) : null)
  // Code's word on what stands, made now or kept: so readings kept from before code spoke are held to it too.
  const settled = new Map<string, StoredReading>()
  let decided: Decided[] = []
  let flagged: Flagged[] = []
  if (!options.signal.aborted) {
    const standing = (asks: readonly Ask[]): Standing[] =>
      asks.flatMap((ask) => {
        const entry = entryOf(ask)
        return entry ? [{ ask, entry }] : []
      })
    const worked = settle(
      standing(ruleAsks).flatMap((held) => {
        const rule = rules.find((r) => r.id === held.ask.ref)
        return rule ? [{ ...held, rule }] : []
      }),
      caseAsks.map(({ testCase, asks }) => ({
        asked: askedOf(skillDir, testCase),
        checks: standing(asks),
      })),
    )
    decided = worked.decided
    const before = new Map(
      [...ruleAsks, ...caseAsks.flatMap((c) => c.asks)].map((ask) => [ask.stamp, entryOf(ask)]),
    )
    const changed = worked.entries.filter(
      (entry) => JSON.stringify(entry) !== JSON.stringify(before.get(entry.stamp)),
    )
    if (changed.length) storeReadings(skillDir, changed)
    for (const entry of worked.entries) settled.set(entry.stamp, entry)
    const fresh = [...ruleAsks, ...caseAsks.flatMap((c) => c.asks)].flatMap((ask) => {
      const reading = made.has(ask.stamp) ? settled.get(ask.stamp)?.reading : undefined
      return reading?.reading === 'exact' ? [{ ask, reading }] : []
    })
    if (fresh.length) flagged = flagsOf(skillDir, fresh, options.log)
  }

  const itemOf = (ask: Ask): SortedItem => ({
    kind: ask.kind,
    ref: ask.ref,
    id: ask.id,
    text: ask.text,
    stored: settled.get(ask.stamp) ?? entryOf(ask),
    kept: !made.has(ask.stamp) && isKept(ask.stamp),
    ...(ask.every ? { every: true as const } : {}),
  })
  return {
    provider: choice.provider,
    model,
    effort: choice.effort,
    rules: ruleAsks.map(itemOf),
    cases: caseAsks.map(({ testCase, asks }) => ({
      case: testCase.id,
      title: testCase.title,
      checks: asks.map(itemOf),
    })),
    calls,
    usage: calls.reduce((sum, c) => add(sum, c.usage), NO_USAGE),
    decided,
    flagged,
  }
}
