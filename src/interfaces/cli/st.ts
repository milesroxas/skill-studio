#!/usr/bin/env node
/**
 * `st`: the Skill Studio command line. Every command takes a skill directory
 * (default: the current directory) and works on its `evals/`.
 *
 *   st cases [skill]
 *   st run [skill] --engine claude --model sonnet --cases a,b --samples 2
 *   st grade [skill] --run <name> | --all   [--no-jev]
 *   st report [skill] --run <name>
 *   st compare [skill] <runA> <runB>
 *   st read [skill] --run <name> [--blind] [--model sonnet] [--out <file>] [--answers <file>]
 *   st sort [skill] [--again] [--model <id>]
 *   st propose [skill] [--cases a,b] [--again] [--all] [--deep] | [--case <id>] --accept <ids> | --drop <ids>
 *   st self-test [skill] [--no-jev]
 *   st versions [skill]
 *   st serve [skill...] [--port 4400] [--tailscale [--tailscale-port 8443]]
 *   st new <dir> [--name <id>] [--description <text>]
 *
 * `run`, `grade`, `read`, `sort`, `propose` and `serve` start agents, so each ends them before it goes:
 * on Ctrl-C, and when it is asked to stop. A run or a grading cut off that way
 * stops as one stopped in the app does: no report is written from part of it.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { generateRun } from '@application/generate.ts'
import {
  type ComparedCases,
  compareCases,
  compareRuns,
  correctionsOf,
  gradeAnchors,
  gradeRun,
  jevForRun,
  runVerdicts,
  scoredReport,
  selfTest,
  unjudged,
} from '@application/grade.ts'
import {
  acceptEveryCase,
  acceptProposals,
  dropEveryCase,
  dropProposals,
  type EveryProposal,
  type ProposeResult,
  proposeChecks,
  type ReadAnswer,
} from '@application/proposing.ts'
import { type RunReading, readingOfRun } from '@application/reading.ts'
import { type SortedItem, type SortResult, sortSkill } from '@application/sorting.ts'
import { type CaseMove, type Met, type TwoCounts, twoCounts } from '@domain/case-result.ts'
import type { Tells } from '@domain/proposal.ts'
import type { Agreed } from '@domain/reading.ts'
import type { BenchConfig, Configuration, Report } from '@domain/schemas.ts'
import { layerOrder } from '@domain/scoring.ts'
import { describeReading } from '@domain/sorting.ts'
import { TEMPLATE_IDS, type TemplateId, templateById } from '@domain/templates.ts'
import { isSlug, SLUG_RULE } from '@domain/text.ts'
import { loadCases, saveCase } from '@infrastructure/cases.ts'
import { engineById, engines } from '@infrastructure/engines/index.ts'
import { realPath } from '@infrastructure/fs.ts'
import type { StoredFact, StoredProposal } from '@infrastructure/proposals.ts'
import { listRuns, readRun, runDir, versionsOf } from '@infrastructure/runs.ts'
import { newSkill, skillInfo } from '@infrastructure/skill.ts'
import { Jev } from '@judges/jev.ts'
import { scorers } from '@judges/scorers.ts'
import { loadEnv } from '../host.ts'
import { TOKEN_PARAM } from '../http/guard.ts'
import { DEFAULT_PORT, startServer } from '../http/server.ts'
import { DEFAULT_TAILSCALE_PORT, serveOnTailnet, tailnetIdentity } from '../http/tailscale.ts'
import { agentLifecycle, keepRunning } from '../lifecycle.ts'
import { countOf, generateInputOf, openCommand, portOf, runNameOf, withHint } from './input.ts'

const HELP = `Usage: st <command> [skill-dir] [options]

Commands
  cases                       List the skill's cases.
  run                         Generate outputs with a headless agent, then grade them.
    --engine <id>             claude (default) or cursor.
    --model <id>              Engine model; default per engine.
    --effort <level>          Engine effort; default per engine.
    --cases <a,b>             Case ids; default every case.
    --samples <n>             Samples per case (default 1).
    --configuration <c>       with_skill (default), without_skill, old_skill.
    --baseline <v|run>        For old_skill: the version (v1) or run to test.
    --name <text>             Name the skill version when the tree changed.
    --note <text>             Note on the version.
    --parallel <n>            Samples in flight (default 3).
    --no-grade                Skip grading after generation.
  grade                       Grade a run: --run <name> or --all.
  report                      Print a run's report: --run <name>.
  compare <runA> <runB>       Score deltas between two graded runs.
  read                        Have the assistant read a graded run: --run <name>. It answers
                              what Jev was not sure of, and prints how often its answers
                              agree with yours. It writes nothing to the skill.
    --blind                   Ask every rule and check and show it none of Jev's answers,
                              to see how often the two agree.
    --cases <a,b>             Case ids; default every case the run answered.
    --model <id>              The model to ask (default sonnet), on Claude Code.
    --effort <level>          Its effort; default the model's own.
    --parallel <n>            Cases read at once (default 2).
    --deep                    Have a session read each case's files in a folder, pages as
                              drawn, instead of sending them in one message. Costs far more.
    --out <file>              Also write the reading to this file, as JSON.
    --answers <file>          Count its answers against the ones in this file, not against
                              yours: JSON by output, then by rule or check.
  sort                        Have the assistant read each rule and check, and say how each
                              will be marked: by code, by Jev, or not at all as written, with
                              a fix. It keeps the readings in evals/rule-readings.json.
    --again                   Ask again for readings that are still current.
    --model <id>              The model to ask in place of the one set in Settings.
    --effort <level>          Its effort; default the model's own.
    --parallel <n>            Calls at once (default 3).
  propose                     Have the assistant read each case's latest answers and propose
                              checks a good answer meets. It changes no case: name the ones to
                              keep with --accept. It keeps them in evals/proposals.json.
    --cases <a,b>             Case ids; default every case.
    --again                   Read a case again though nothing changed since it was read.
    --model <id>              The model to ask (default sonnet), on Claude Code.
    --effort <level>          Its effort; default the model's own.
    --parallel <n>            Cases read at once (default 2).
    --deep                    Have a session read each case's files in a folder, pages as
                              drawn, instead of sending them in one message. Costs far more.
    --all                     Also list the proposals every answer already meets, the note
                              fact by fact, and what was left out.
    --case <id> --accept <ids>  Add these proposals to the case's checks.
    --accept <ids>            Without --case: add these proposals for every case, each as one
                              check in evals/graders/.
    --case <id> --drop <ids>    Turn these proposals down, so they are not proposed again.
                              Without --case, the ones for every case.
  self-test                   Grade evals/anchors and check bad anchors lose to good ones.
  versions                    Skill versions seen in runs, and the working tree's.
  new <dir>                   Scaffold a skill: SKILL.md and an empty evals/cases/.
    --name <id>               Skill name; default the folder name.
    --description <text>      Front matter description.
    --template <id>           blank (default), writing, code, workflow or design.
    --with-cases              Also write the template's sample cases.
  serve [skill...]            Start the app (--port ${DEFAULT_PORT}; --open opens a browser).
                              It prints the address to open, which carries this start's token.
                              With no skill it opens on the library of skills on this machine.
                              --tailscale also serves it on this machine's tailnet name
                              (--tailscale-port ${DEFAULT_TAILSCALE_PORT}), for your own Tailscale login only.

Common
  --no-jev                    Grade without TypeSafe calls (code checks only).
  --packs <a,b>               Judge packs to run, instead of bench.json's list.
  --bench <file>              A bench.json laid over the skill's for this grading.
  --jev-model <id>            Jev version to judge with.
  --json                      Print JSON instead of a table.
  -h, --help                  This help.`

const OPTIONS = {
  engine: { type: 'string' },
  model: { type: 'string' },
  effort: { type: 'string' },
  cases: { type: 'string' },
  samples: { type: 'string' },
  configuration: { type: 'string' },
  baseline: { type: 'string' },
  name: { type: 'string' },
  note: { type: 'string' },
  parallel: { type: 'string' },
  'no-grade': { type: 'boolean' },
  run: { type: 'string' },
  all: { type: 'boolean' },
  blind: { type: 'boolean' },
  again: { type: 'boolean' },
  deep: { type: 'boolean' },
  case: { type: 'string' },
  accept: { type: 'string' },
  drop: { type: 'string' },
  out: { type: 'string' },
  answers: { type: 'string' },
  'no-jev': { type: 'boolean' },
  'jev-model': { type: 'string' },
  packs: { type: 'string' },
  bench: { type: 'string' },
  port: { type: 'string' },
  open: { type: 'boolean' },
  tailscale: { type: 'boolean' },
  'tailscale-port': { type: 'string' },
  description: { type: 'string' },
  template: { type: 'string' },
  'with-cases': { type: 'boolean' },
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const

const pad = (value: unknown, width: number): string => String(value ?? '-').padStart(width)
const padEnd = (value: unknown, width: number): string =>
  String(value ?? '-')
    .slice(0, width - 1)
    .padEnd(width)

/**
 * The skill dir among the positionals: the first that has a SKILL.md, else
 * cwd. Links on the way are resolved, as the app resolves them, so the folder
 * a sample is in is the one its agent named in its transcript.
 */
function pickSkill(positionals: string[]): { skill: string; rest: string[] } {
  const index = positionals.findIndex((p) => existsSync(join(resolve(p), 'SKILL.md')))
  if (index < 0) {
    if (!existsSync(join(process.cwd(), 'SKILL.md')))
      throw new Error('No SKILL.md here. Pass the skill directory.')
    return { skill: realPath(process.cwd()), rest: positionals }
  }
  return {
    skill: realPath(resolve(positionals[index])),
    rest: positionals.filter((_, i) => i !== index),
  }
}

function printReport(report: Report): void {
  const layers = layerOrder(report.config, scorers)
  console.log(
    `\n${padEnd('sample', 36)}${padEnd('case', 22)}${layers.map((l) => pad(l, 11)).join('')}`,
  )
  for (const r of report.results)
    console.log(
      `${padEnd(r.sample, 36)}${padEnd(r.case, 22)}${layers.map((l) => pad(r.scores[l], 11)).join('')}`,
    )
  for (const r of report.results) {
    if (!r.flags.length) continue
    console.log(`\n${r.sample}`)
    for (const flag of r.flags) console.log(`  - ${flag}`)
  }
  const { overrides } = report
  if (overrides)
    console.log(
      `\nGraded with ${[
        overrides.packs ? `--packs ${overrides.packs.join(',')}` : null,
        overrides.bench ? '--bench' : null,
      ]
        .filter(Boolean)
        .join(
          ' and ',
        )} laid over bench.json: the app scores it under bench.json, and gives no total where they changed what was asked.`,
    )
  console.log(
    `\n${report.results.length} output(s), ${report.model ?? 'no Jev'}, ${report.inputTokens.toLocaleString()} input tokens${report.asked ? ` (${report.asked.inputTokens.toLocaleString()} paid by this grading)` : ''}, ${report.seconds} s`,
  )
}

const agreed = ({ agree, total }: Agreed): string =>
  total ? `${agree} of ${total} agree` : 'none to compare'

/** Print a reading: each answer on its fact, beside Jev's and the reader's, then how they agree. */
function printReading(reading: RunReading, against: string): void {
  for (const read of reading.cases) {
    console.log(`\n${read.case}`)
    if (read.error) {
      console.log(`  ${read.error}`)
      continue
    }
    for (const mark of read.marks) {
      const yours =
        mark.fact.yours === null ? '' : `, answer: ${mark.fact.yours ? 'met' : 'missed'}`
      const quote =
        mark.evidence === 'quoted'
          ? ''
          : mark.evidence === 'unquoted'
            ? ' [no quote]'
            : ` [its quote is not in ${mark.file || 'any file'}${mark.said ? `, it said ${mark.said}` : ''}]`
      console.log(
        `  ${padEnd(mark.output, 28)}${padEnd(mark.fact.ref, 5)}${padEnd(mark.answer, 12)}(Jev: ${mark.fact.jev}${yours})${quote}`,
      )
      console.log(`      ${mark.fact.text.slice(0, 110)}`)
      if (mark.why) console.log(`      ${mark.why}`)
    }
    for (const finding of read.findings)
      console.log(`  ${padEnd(finding.output, 28)}found: ${finding.text}`)
    if (read.note) console.log(`  ${read.note}`)
  }
  const { agreement: a, usage } = reading
  console.log(
    `\n${a.asked} asked, ${a.answered} answered, ${a.cannotTell} cannot tell, ${a.skipped} not answered, ${a.unfound} with a quote that was not found`,
  )
  console.log(
    `Settled ${a.settled.agree} of the ${a.settled.total} Jev was not sure of or did not read.`,
  )
  console.log(`Against ${against}: ${agreed(a.yours)} (with a quote: ${agreed(a.yoursQuoted)}).`)
  if (reading.blind) console.log(`Against Jev where it was sure: ${agreed(a.jev)}.`)
  console.log(
    `${reading.model} on ${reading.provider}, ${usage.input.toLocaleString()} input and ${usage.output.toLocaleString()} output tokens`,
  )
}

/**
 * Print one sorted rule or check: its words, then how it will be marked. For
 * a check, each rule that cannot hold beside it, on its case alone, by the
 * rule's short name (`refOf`).
 */
function printSorted(item: SortedItem, refOf?: (rule: string) => string): void {
  console.log(
    `  ${padEnd(item.ref, 5)}${item.text}${item.every ? '  (a check for every case)' : ''}`,
  )
  if (!item.stored) {
    console.log('       Not read: the call failed, so it is marked as before.')
    return
  }
  const lines = describeReading(item.stored.reading)
  for (const line of lines) console.log(`       ${line}`)
  const { reading } = item.stored
  if (reading.reading === 'unmarkable' && item.stored.reason)
    console.log(`       Why: ${item.stored.reason}`)
  if (item.stored.refused.length)
    console.log(
      `       Refused ${item.stored.refused.length === 1 ? 'once' : 'twice'}: ${item.stored.refused.join('; ')}`,
    )
  for (const against of item.stored.against ?? []) {
    const ref = refOf?.(against.rule)
    console.log(
      `       Rule ${ref ? `${ref} ` : ''}"${against.rule}" cannot hold beside this check on this case, so that rule counts in no score here.`,
    )
    if (against.fix) console.log(`       Fix for the rule: ${against.fix}`)
  }
}

/** Print a sort: each rule, each case's checks, then the counts and what the calls spent. */
function printSort(result: SortResult): void {
  console.log('\nRules')
  for (const item of result.rules) printSorted(item)
  const refOf = (rule: string) => result.rules.find((r) => r.text.trim() === rule.trim())?.ref ?? ''
  for (const c of result.cases) {
    if (!c.checks.length) continue
    console.log(`\n${c.title || c.case} (${c.case})`)
    for (const item of c.checks) printSorted(item, refOf)
  }
  const all = [...result.rules, ...result.cases.flatMap((c) => c.checks)]
  const count = (kind: string) => all.filter((i) => i.stored?.reading.reading === kind).length
  const kept = all.filter((i) => i.kept).length
  const refused = all.filter((i) => i.stored && i.stored.refused.length > 1).length
  console.log(
    `\n${all.length} read: ${count('exact')} by code, ${count('judged')} by Jev, ${count('unmarkable')} not markable.${kept ? ` ${kept} kept from before.` : ''}${refused ? ` ${refused} refused twice, so marked as before.` : ''}`,
  )
  // A rule a check cannot hold beside counts in no score on that case alone: said once more, case by case.
  for (const c of result.cases)
    for (const check of c.checks)
      for (const against of check.stored?.against ?? [])
        console.log(
          `On ${c.case}, rule ${refOf(against.rule) || `"${against.rule}"`} cannot hold beside ${check.ref} "${check.text}": the rule counts in no score on that case.`,
        )
  for (const call of result.calls) {
    const what = call.what === 'rules' ? 'rules' : call.what
    console.log(
      `  ${padEnd(what, 22)}${call.error ? `failed: ${call.error}` : `${call.asked} asked, ${call.refusedOnce} refused once, ${call.refusedTwice} twice, ${call.usage.input.toLocaleString()} in, ${call.usage.output.toLocaleString()} out, ${call.seconds} s`}`,
    )
  }
  console.log(
    `${result.model} on ${result.provider}${result.effort ? `, ${result.effort} effort` : ''}, ${result.usage.input.toLocaleString()} input and ${result.usage.output.toLocaleString()} output tokens`,
  )
}

/** A count as the app writes it: "3 of 4", "3 of 4, 1 not sure", "3 of 4, 1 not read". */
function countWords(count: TwoCounts['checks']): string {
  if (!count) return 'none'
  return (
    [
      count.total ? `${count.met} of ${count.total}` : null,
      count.unsure ? `${count.unsure} not sure` : null,
      count.unread ? `${count.unread} not read` : null,
    ]
      .filter(Boolean)
      .join(', ') || 'none counted'
  )
}

/** Print each output's checks met and rules followed, apart: a run without the skill has no rules count. */
function printCounts(
  counts: ReadonlyArray<[string, TwoCounts]>,
  configuration: Configuration,
): void {
  if (!counts.length) return
  console.log('\nChecks met and rules followed, counted apart')
  for (const [sample, two] of counts)
    console.log(
      `  ${padEnd(sample, 36)}checks ${padEnd(countWords(two.checks), 24)}rules ${
        two.rules
          ? countWords(two.rules)
          : configuration === 'without_skill'
            ? 'none, made without the skill'
            : 'none'
      }`,
    )
}

/** How a case moved, as a line says it. */
const MOVED: Readonly<Record<CaseMove, string>> = {
  better: 'better',
  same: 'the same',
  worse: 'worse',
  none: 'no checks to compare',
}

/** One end of a case: the checks met on each attempt, "4 of 5" or "4 of 5 and 5 of 5". */
const endWords = (end: readonly Met[]): string =>
  end.map((m) => `${m.met} of ${m.total}`).join(' and ')

/** Print two runs read as cases, on checks: the count of each move, then each case's line. */
function printCases(compared: ComparedCases): void {
  const { better, same, worse, none } = compared
  console.log(
    `\nRead as cases, on checks alone: better on ${better}, the same on ${same}, worse on ${worse}.${
      none ? ` ${none} with no checks to compare.` : ''
    }`,
  )
  for (const c of compared.cases) {
    const head = `  ${padEnd(c.case, 28)}${padEnd(MOVED[c.move], 12)}`
    if (c.move === 'none') {
      console.log(head.trimEnd())
      continue
    }
    const tail = [
      c.alone && c.move !== 'same' ? 'one attempt each, so a small move may be chance' : null,
      c.left ? `${c.left} left out, marked in only one run or set aside` : null,
    ].filter(Boolean)
    console.log(
      `${head}checks met ${endWords(c.a)}, then ${endWords(c.b)}${tail.length ? `; ${tail.join('; ')}` : ''}`,
    )
  }
  if (compared.left.length) {
    console.log('\nCases not read:')
    for (const line of compared.left) console.log(`  ${line}`)
  }
}

/**
 * Print what a grading made of a run. False when it judged no output, so it
 * wrote no report and the command has not done what it was asked: the grading
 * said so itself when there was no output, and the reason is printed here when
 * a pack failed on every one.
 */
/** An answer read, as a person tells it apart: the version that wrote it, or that it had no skill. */
const answerName = (answer: Pick<ReadAnswer, 'configuration' | 'version' | 'name'>): string =>
  answer.configuration === 'without_skill'
    ? 'without the skill'
    : `${answer.version || 'a version'}${answer.name ? ` "${answer.name}"` : ''}`

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

const listed = (items: readonly string[]): string =>
  items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : (items[0] ?? '')

/** Where a proposal's words are, as a person reads it. */
const basisSays = (basis: StoredProposal['basis']): string =>
  basis.in === 'request'
    ? 'The request says'
    : basis.in === 'note'
      ? 'The case\'s "A good answer" note says'
      : `${basis.file} says`

/** What a folded proposal is, by how it reads the answers. */
const FOLDED: Record<Exclude<Tells, 'apart'>, string> = {
  'all meet': 'that every answer read already meets',
  'none meet': 'that no answer read meets',
  unclear: 'that the answers read do not show either way',
}

/** "12 that every answer read already meets, and 1 that no answer read meets." */
function foldedCount(tells: readonly Tells[]): string {
  const parts = (Object.keys(FOLDED) as Array<keyof typeof FOLDED>)
    .map((kind) => ({ kind, n: tells.filter((t) => t === kind).length }))
    .filter((p) => p.n)
    .map((p) => `${p.n} ${FOLDED[p.kind]}`)
  return listed(parts)
}

/** One proposal of one case, as a person reads it: its id, words, why, what asks for it and which answers meet it. */
function printProposal(p: StoredProposal): void {
  console.log(`\n  ${p.id}  ${p.check}`)
  console.log(`            Why: ${p.why}`)
  console.log(`            ${basisSays(p.basis)}: "${p.basis.quote}"`)
  if (p.shownBy && p.fault)
    console.log(`            ${capital(answerName(p.shownBy))} has: "${p.fault.quote}"`)
  const by = (meets: string) => p.answers.filter((a) => a.meets === meets).map(answerName)
  const parts = [
    by('yes').length ? `met by ${listed(by('yes'))}` : '',
    by('no').length ? `missed by ${listed(by('no'))}` : '',
    by('cannot tell').length ? `not clear for ${listed(by('cannot tell'))}` : '',
  ].filter(Boolean)
  console.log(`            ${capital(parts.join('; '))}.`)
  if (p.basisCheck?.reading === 'not sure')
    console.log('            Jev is not sure those words ask for all of it.')
  if (p.scope === 'every case')
    console.log(
      '            Proposed for every case, but on this case alone: accepted, it is added to this case.',
    )
}

/** One proposal for every case: its id, words, why, the cases it was seen on, and which answers miss it there. */
function printEvery(e: EveryProposal): void {
  console.log(`\n  ${e.id}  ${e.check}`)
  console.log(`            Why: ${e.why}`)
  console.log(
    `            Proposed on ${e.cases.length === 1 ? 'one case' : `${e.cases.length} cases`}: ${listed(e.cases)}.`,
  )
  const missed = new Map<string, string[]>()
  for (const p of e.made)
    for (const a of p.answers)
      if (a.meets === 'no')
        missed.set(answerName(a), [...(missed.get(answerName(a)) ?? []), p.case])
  if (missed.size)
    console.log(
      `            Missed by ${listed([...missed].map(([name, on]) => `${name} on ${listed([...new Set(on)])}`))}. Every other answer read meets it.`,
    )
  else if (e.tells === 'all meet') console.log('            Every answer read meets it.')
  if (e.made.some((p) => p.basisCheck?.reading === 'not sure'))
    console.log('            Jev is not sure the words it stands on ask for all of it.')
}

/** A fact of the note and what covers it, in one line. */
function factLine(f: StoredFact, groupOf: (id: string) => string): string {
  if (f.by === 'check') return `"${f.fact}": the check "${f.check}"`
  if (f.by === 'proposal') return `"${f.fact}": proposal ${groupOf(f.proposal ?? '')}`
  if (f.by === 'reason') return `"${f.fact}": not a yes or no check. ${f.why}`
  return `"${f.fact}": nothing covers it.${f.why ? ` ${f.why}` : ''}`
}

/**
 * Print proposed checks: first those for every case, then each case's own.
 * What tells the answers read apart is shown in full; the rest are counted in
 * one line and listed with `all`. A fact of a case's note that nothing covers
 * is always shown.
 */
function printProposals(result: ProposeResult, skillArg: string, all: boolean): void {
  const folded: Tells[] = []
  const groupOf = (id: string) =>
    result.every.find((e) => e.made.some((p) => p.id === id))?.id ?? id
  if (!result.jevAsked)
    console.log(
      'Jev, the grader, was not asked: no TypeSafe key is set, or --no-jev was given. No proposal was checked against the words it stands on. Proposals of different cases were joined only in the same words: nearer matches were not looked for.',
    )
  if (result.every.length) {
    console.log('\nFor every case')
    const shown = result.every.filter((e) => all || e.tells === 'apart')
    for (const e of shown) printEvery(e)
    for (const e of result.every) if (e.tells !== 'apart') folded.push(e.tells)
    if (!shown.length) console.log('  None tells the answers read apart.')
  }
  for (const c of result.cases) {
    console.log(`\n${c.title && c.title !== c.case ? `${c.title} (${c.case})` : c.case}`)
    if (c.skipped) {
      console.log(`  ${c.skipped} Run the case first.`)
      continue
    }
    if (c.error) {
      console.log(`  Not read: ${c.error}`)
      continue
    }
    console.log(
      `  Answers read: ${listed(c.answers.map(answerName))}.${c.kept ? ' Read before, and nothing changed since.' : ''}`,
    )
    const apart = c.proposals.filter((p) => p.tells === 'apart')
    for (const p of c.proposals) if (p.tells !== 'apart') folded.push(p.tells)
    for (const p of apart) printProposal(p)
    if (!c.proposals.length) console.log('  Nothing of its own to propose.')
    else if (!apart.length) console.log('  None of its proposals tells the answers read apart.')
    if (all) {
      const rest = c.proposals.filter((p) => p.tells !== 'apart')
      if (rest.length) {
        console.log(`\n  ${capital(foldedCount(rest.map((p) => p.tells)))}:`)
        for (const p of rest) printProposal(p)
      }
    }
    const open = c.facts.filter((f) => f.by === 'nothing')
    for (const f of open)
      console.log(`  Nothing covers this part of the note: "${f.fact}".${f.why ? ` ${f.why}` : ''}`)
    for (const words of c.unlisted)
      console.log(`  The note also says "${words}", and no check or proposal was named for it.`)
    if (all && c.facts.length) {
      console.log('  The note, fact by fact:')
      for (const f of c.facts) console.log(`    ${factLine(f, groupOf)}`)
    }
    if (all)
      for (const o of c.overreach)
        console.log(
          `  Left out, as it asks for more than its words: "${o.check}", on "${o.basis.quote}"`,
        )
    const left = c.left.filter((l) => l.why !== 'past the most')
    if (all && left.length)
      console.log(`  Left out: ${left.map((l) => `"${l.check}" (${l.why})`).join('; ')}.`)
  }
  const shown =
    result.every.filter((e) => e.tells === 'apart').length +
    result.cases.reduce((n, c) => n + c.proposals.filter((p) => p.tells === 'apart').length, 0)
  console.log(`\n${shown} proposed that tell the answers read apart.`)
  if (folded.length)
    console.log(
      `${capital(foldedCount(folded))}. Each still guards the next version.${all ? '' : ' Add --all to list them.'}`,
    )
  const overreach = result.cases.reduce((n, c) => n + c.overreach.length, 0)
  if (overreach)
    console.log(
      `${overreach} left out, as Jev is sure each asks for more than the words it stands on.${all ? '' : ' Add --all to list them.'}`,
    )
  for (const l of result.joining.left)
    console.log(
      `Left out for every case, as a check for every case says it: "${l.check}" (${listed(l.cases)}).`,
    )
  const fresh = result.cases.filter((c) => !c.kept && !c.skipped && !c.error)
  const refused = fresh.reduce((n, c) => n + c.refusedOnce, 0)
  const twice = fresh.reduce((n, c) => n + c.refusedTwice, 0)
  if (refused)
    console.log(
      `${refused} did not fit at first and were asked for again; ${twice} did not fit again and were left out.`,
    )
  if (shown || folded.length)
    console.log(
      `To keep some: pnpm st propose ${skillArg} --case <case> --accept <id,id>, or --accept <id,id> alone for ones for every case. To turn some down: --drop <id,id> in the same way.`,
    )
  for (const c of fresh)
    console.log(
      `  ${padEnd(c.case, 22)}${c.usage.input.toLocaleString()} in, ${c.usage.output.toLocaleString()} out, ${c.seconds} s`,
    )
  console.log(
    `${result.model} on ${result.provider}, ${result.usage.input.toLocaleString()} input and ${result.usage.output.toLocaleString()} output tokens`,
  )
  console.log(
    `Jev: ${result.jev.questions} questions in ${result.jev.requests} requests, ${result.jev.kept} answers kept from before.${result.jev.error ? ` It could not be asked: ${result.jev.error}` : ''}`,
  )
}

function printGraded(report: Report, json: boolean | undefined): boolean {
  if (json) console.log(JSON.stringify(report, null, 2))
  else printReport(report)
  const { failed, total, reason } = unjudged(report)
  if (total && failed === total)
    console.error(`No output was judged, so no report was written: ${reason}`)
  return total > 0 && failed < total
}

async function main(): Promise<number> {
  loadEnv()
  const { values, positionals } = parseArgs({ allowPositionals: true, options: OPTIONS })
  const [command, ...args] = positionals
  if (values.help || !command) {
    console.log(HELP)
    // Asking for the help succeeds; running with no command is a usage error.
    return values.help ? 0 : 2
  }
  // These start agents: the ones an earlier copy left are ended first, and Ctrl-C ends this copy's.
  const lifecycle = ['run', 'grade', 'read', 'sort', 'propose', 'serve'].includes(command)
    ? agentLifecycle({ signals: true })
    : null
  /** The command's own run or grading, held so a Ctrl-C lets it write what it has as it stops. */
  const held = <T>(work: Promise<T>): Promise<T> => lifecycle?.during(work) ?? work
  /** The scoring the flags ask for, laid over the skill's `bench.json`. */
  const scoring = {
    packs: values.packs ? values.packs.split(',').map((p) => p.trim()) : undefined,
    config: values.bench
      ? (JSON.parse(readFileSync(resolve(values.bench), 'utf8')) as Partial<BenchConfig>)
      : undefined,
  }
  const wantsJev = !values['no-jev']
  const jevOptions = {
    ...scoring,
    useJev: wantsJev && Jev.available(),
    model: values['jev-model'],
    log: (line: string) => console.error(line),
    // Ctrl-C stops a grading as Stop does in the app: a check it cut short is no answer.
    signal: lifecycle?.signal,
  }
  /** Say that a grading goes on without Jev, when it does for want of a key. */
  const noteNoKey = (): void => {
    if (wantsJev && !Jev.available())
      console.error('TYPESAFE_API_KEY is not set: grading without Jev.')
  }
  if (['run', 'self-test'].includes(command)) noteNoKey()
  // A server outlives any one request: an error nothing caught is logged, not the end of every job.
  if (command === 'serve') keepRunning()

  if (command === 'new') {
    const dir = args[0]
    if (!dir) throw new Error('Pass the new skill directory: st new <dir>.')
    const name = values.name ?? basename(resolve(dir))
    if (!isSlug(name)) throw new Error(SLUG_RULE)
    const template = values.template ?? 'blank'
    if (!TEMPLATE_IDS.includes(template as TemplateId))
      throw new Error(`Unknown template ${template}. Use one of ${TEMPLATE_IDS.join(', ')}.`)
    const chosen = templateById(template)
    const md = newSkill(dir, name, values.description ?? '', chosen)
    if (values['with-cases']) for (const sample of chosen.cases) saveCase(dir, sample, true)
    console.log(`Wrote ${md}. Edit it in the app: pnpm st serve ${dir}`)
    return 0
  }

  if (command === 'serve') {
    const here = existsSync(join(process.cwd(), 'SKILL.md')) ? [process.cwd()] : []
    const skills = args.length ? args.map((p) => resolve(p)) : here
    const port = portOf(values.port, '--port')
    const httpsPort = portOf(values['tailscale-port'], '--tailscale-port')
    if (httpsPort && !values.tailscale) throw new Error('--tailscale-port needs --tailscale.')
    const remote = values.tailscale ? await tailnetIdentity() : null
    const server = await startServer({ skills, port, remote })
    // The address carries the token every request needs, from this machine or the tailnet.
    console.log(`Skill Studio: ${server.url}${skills.length ? `  (${skills.join(', ')})` : ''}`)
    if (remote) {
      try {
        const tailnet = await serveOnTailnet(
          server.port,
          remote.host,
          httpsPort ?? DEFAULT_TAILSCALE_PORT,
        )
        // The tailnet asks for the token too: the login alone can be forged from this machine.
        console.log(
          `tailnet:      ${tailnet.url}/?${TOKEN_PARAM}=${server.token}  (${remote.users.join(', ')} only)`,
        )
      } catch (error) {
        // The local server is already listening and would keep the process alive.
        console.error((error as Error).message)
        process.exit(2)
      }
    }
    if (values.open) {
      // The opener's command line is anyone's to list: it gets a ticket good for one load, never the token.
      const {
        command: opener,
        args: openerArgs,
        verbatim,
      } = openCommand(process.platform, server.ticketUrl())
      const child = spawn(opener, openerArgs, {
        stdio: 'ignore',
        detached: true,
        windowsVerbatimArguments: verbatim,
      })
      // A system with no opener: the server is up all the same, and its address is printed.
      child.on('error', (error) =>
        console.error(`Could not open a browser (${error.message}). Open the address above.`),
      )
      child.unref()
    }
    return 0
  }

  const { skill, rest } = pickSkill(args)
  const info = skillInfo(skill)

  if (command === 'cases') {
    const cases = loadCases(skill)
    if (values.json) console.log(JSON.stringify(cases, null, 2))
    else {
      console.log(`${info.name}: ${cases.length} case(s)`)
      for (const c of cases)
        console.log(
          `  ${padEnd(c.id, 34)} ${c.graders.length} grader(s)${c.files.length ? `, ${c.files.length} file(s)` : ''}  ${c.title}`,
        )
    }
    return 0
  }

  if (command === 'versions') {
    const versions = versionsOf(skill)
    if (values.json) console.log(JSON.stringify(versions, null, 2))
    else {
      for (const v of versions.versions)
        console.log(`  ${v.version}  ${v.hash}  ${v.date ?? ''}  ${v.name}`)
      const c = versions.current
      console.log(
        c.changed
          ? `Working tree: ${c.version} (new, unnamed) ${c.hash}`
          : `Working tree: ${c.version} ${c.name}`,
      )
    }
    return 0
  }

  if (command === 'run') {
    // The same check the app's Run button goes through.
    const input = generateInputOf(skill, {
      engine: values.engine,
      model: values.model,
      effort: values.effort,
      cases: values.cases,
      samples: values.samples,
      configuration: values.configuration,
      baseline: values.baseline,
      name: values.name,
      note: values.note,
    })
    const [choice] = input.configs
    const engine = engineById(choice.engine)
    if (!engine)
      throw new Error(
        `Unknown engine ${choice.engine}. Have: ${engines.map((e) => e.id).join(', ')}.`,
      )
    if (!engine.available()) throw new Error(`${engine.label} is not available. ${engine.hint}`)
    const parallel = countOf(values.parallel, '--parallel')
    const cases = loadCases(skill)
    const wanted = input.cases
    const selected = wanted.length ? cases.filter((c) => wanted.includes(c.id)) : cases
    const missing = wanted.filter((id) => !cases.some((c) => c.id === id))
    if (missing.length) throw new Error(`No case named ${missing.join(', ')}.`)
    if (!selected.length) throw new Error('No cases to run.')
    const { name, meta } = await held(
      generateRun({
        skillDir: skill,
        cases: selected,
        engine,
        model: choice.model || null,
        effort: choice.effort || null,
        samples: input.samples,
        configuration: input.configuration,
        baseline: input.baseline,
        skillName: input.skillName,
        note: input.note,
        parallel,
        log: (line) => console.error(line),
        signal: lifecycle?.signal,
      }),
    )
    console.log(`Run: ${runDir(skill, name)}`)
    // An attempt that failed is no answer: the run is not whole, whatever its grading says.
    const failed = meta.samples.filter((s) => s.failed)
    for (const s of failed)
      console.error(`Failed: ${s.dir}, it ${s.failed}${s.error ? ` (${s.error})` : ''}`)
    const fine =
      values['no-grade'] || printGraded(await held(gradeRun(skill, name, jevOptions)), values.json)
    return fine && !failed.length ? 0 : 1
  }

  if (command === 'grade') {
    const names = values.all
      ? listRuns(skill).map((r) => r.name)
      : values.run
        ? [runNameOf(values.run, '--run')]
        : []
    if (!names.length) throw new Error('Pass --run <name> or --all.')
    // Asked of every run before any is graded: with no key, a run Jev scored is refused, not written over.
    const runs = names.map((name) => ({ name, useJev: wantsJev && jevForRun(skill, name) }))
    noteNoKey()
    let judged = true
    for (const { name, useJev } of runs) {
      const report = await held(gradeRun(skill, name, { ...jevOptions, useJev }))
      console.log(`\n${name}`)
      judged = printGraded(report, values.json) && judged
    }
    return judged ? 0 : 1
  }

  if (command === 'read') {
    if (!values.run) throw new Error('Pass --run <name>.')
    const reading = await held(
      readingOfRun(skill, runNameOf(values.run, '--run'), {
        provider: 'claude-code',
        model: values.model ?? 'sonnet',
        effort: values.effort ?? '',
        cases: values.cases ? values.cases.split(',').map((id) => id.trim()) : [],
        blind: Boolean(values.blind),
        ...(values.answers
          ? { answers: JSON.parse(readFileSync(resolve(values.answers), 'utf8')) }
          : {}),
        parallel: countOf(values.parallel, '--parallel') ?? 2,
        inline: !values.deep,
        log: (line) => console.error(line),
        signal: lifecycle?.signal ?? new AbortController().signal,
      }),
    )
    if (values.out) writeFileSync(resolve(values.out), `${JSON.stringify(reading, null, 2)}\n`)
    if (values.json) console.log(JSON.stringify(reading, null, 2))
    else printReading(reading, values.answers ? 'the answers given' : 'your answers')
    return reading.cases.some((c) => c.error) ? 1 : 0
  }

  if (command === 'propose') {
    const ids = (list: string) =>
      list
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    if (values.accept || values.drop) {
      // With --case, a case's own proposals; without, the proposals for every case.
      if (values.accept && values.case) {
        const { added, had } = acceptProposals(skill, values.case, ids(values.accept))
        for (const p of added) console.log(`Added to ${values.case}: ${p.check}`)
        for (const p of had) console.log(`${values.case} has this check already: ${p.check}`)
      } else if (values.accept) {
        const { added, had } = acceptEveryCase(skill, ids(values.accept))
        for (const p of added) console.log(`Added for every case: ${p.check}`)
        for (const p of had) console.log(`A check for every case says this already: ${p.check}`)
      }
      if (values.drop && values.case)
        for (const p of dropProposals(skill, values.case, ids(values.drop)))
          console.log(`Turned down: ${p.check}`)
      else if (values.drop)
        for (const p of dropEveryCase(skill, ids(values.drop)))
          console.log(`Turned down for every case: ${p.check}`)
      return 0
    }
    const result = await held(
      proposeChecks(skill, {
        provider: 'claude-code',
        model: values.model ?? 'sonnet',
        effort: values.effort ?? '',
        cases: values.cases ? ids(values.cases) : [],
        again: Boolean(values.again),
        parallel: countOf(values.parallel, '--parallel') ?? 2,
        jev: wantsJev && Jev.available() ? new Jev(values['jev-model']) : null,
        inline: !values.deep,
        log: (line) => console.error(line),
        signal: lifecycle?.signal ?? new AbortController().signal,
      }),
    )
    if (values.json) console.log(JSON.stringify(result, null, 2))
    else printProposals(result, args[0] ?? '.', Boolean(values.all))
    return result.cases.some((c) => c.error) ? 1 : 0
  }

  if (command === 'sort') {
    const result = await held(
      sortSkill(skill, {
        model: values.model,
        effort: values.effort,
        again: Boolean(values.again),
        parallel: countOf(values.parallel, '--parallel') ?? 3,
        log: (line) => console.error(line),
        signal: lifecycle?.signal ?? new AbortController().signal,
      }),
    )
    if (values.json) console.log(JSON.stringify(result, null, 2))
    else printSort(result)
    return result.calls.some((c) => c.error) ? 1 : 0
  }

  if (command === 'report') {
    if (!values.run) throw new Error('Pass --run <name>.')
    const name = runNameOf(values.run, '--run')
    const view = readRun(skill, name)
    if (!view.report)
      throw new Error(`${values.run} is not graded. Run: st grade --run ${values.run}`)
    // Scored as the app scores it: under the scoring as it is now, with the reader's corrections.
    const corrections = correctionsOf(skill, name)
    const report = scoredReport(skill, view.report, scoring, view.cases, {
      samples: view.samples.map((s) => s.name),
      corrections,
    })
    if (values.json) console.log(JSON.stringify(report, null, 2))
    else {
      printReport(report)
      // The same verdicts the scores above were counted from, read as two counts.
      const verdicts = runVerdicts(skill, view.report, view.cases, corrections)
      const configuration = view.meta?.configuration ?? 'with_skill'
      printCounts(
        report.results.map((r): [string, TwoCounts] => [
          r.sample,
          twoCounts(verdicts[r.sample] ?? [], configuration),
        ]),
        configuration,
      )
      const fixed = Object.values(corrections).reduce((n, c) => n + Object.keys(c).length, 0)
      if (fixed) console.log(`Your ${fixed} correction(s) in the app count, as they do there.`)
    }
    return 0
  }

  if (command === 'compare') {
    const [a, b] = rest
    if (!a || !b) throw new Error('Pass two run names.')
    const load = (name: string) => {
      const run = runNameOf(name, '`st compare`')
      const { report, cases, samples } = readRun(skill, run)
      if (!report) throw new Error(`${name} has no report.json.`)
      return {
        report,
        cases,
        samples: samples.map((s) => s.name),
        corrections: correctionsOf(skill, run),
      }
    }
    // Both under one scoring, so a difference is the outputs' and not a setting's, read as the app reads a change.
    const before = load(a)
    const after = load(b)
    const { rows, left, notes } = compareRuns(skill, before, after, scoring)
    // The same two runs read as cases, on checks alone.
    const byCase = compareCases(skill, before, after, scoring)
    if (values.json) {
      console.log(JSON.stringify({ rows, left, notes, cases: byCase }, null, 2))
      return 0
    }
    const layers = rows.length ? Object.keys(rows[0].deltas) : []
    console.log(`\n${padEnd('sample', 44)}${layers.map((l) => pad(l, 11)).join('')}`)
    for (const row of rows)
      console.log(
        `${padEnd(row.key, 44)}${layers
          .map((l) => {
            const d = row.deltas[l]
            return pad(d === null ? '-' : `${d > 0 ? '+' : ''}${d}`, 11)
          })
          .join('')}`,
      )
    if (notes.length) {
      console.log('\nA change counts only what was marked in both runs, as in the app:')
      for (const line of notes) console.log(`  ${line}`)
    }
    if (left.length) {
      console.log('\nLeft out, as the app leaves them out:')
      for (const line of left) console.log(`  ${line}`)
    }
    printCases(byCase)
    return 0
  }

  if (command === 'self-test') {
    const report = await gradeAnchors(skill, jevOptions)
    printReport(report)
    const { lines, failures } = selfTest(report)
    console.log(
      '\nSelf-test: each bad anchor must score below every good anchor of its case on what it tests.',
    )
    for (const l of lines)
      console.log(
        `  ${l.ok ? 'ok  ' : 'FAIL'} ${padEnd(l.bad, 40)} ${padEnd(l.layer, 12)} good ${pad(l.good, 4)}  bad ${pad(l.badScore, 4)}  ${l.against ? `against ${l.against}` : 'no good anchor of its case'}`,
      )
    // With no bad anchor at all, nothing was checked.
    if (!lines.length) {
      console.log('\nNothing was checked: there is no bad anchor.')
      return 1
    }
    console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.')
    return failures ? 1 : 0
  }

  throw new Error(`Unknown command ${command}.\n\n${HELP}`)
}

main().then(
  (code) => {
    process.exitCode = code
  },
  (error: Error) => {
    // The flag that would fix it is the command line's to name.
    console.error(withHint(error.message))
    process.exitCode = 2
  },
)
