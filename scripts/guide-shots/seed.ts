/**
 * The sample skills the guide's screenshots show. Importing this file writes
 * them into the folder SKILL_STUDIO_HOME names, through the app's own
 * infrastructure, so the files are the shape the app writes itself. The judge
 * answers are made up by hand and scored by the real scoring code: no agent
 * runs and nothing is sent to Jev.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mergeConfig } from '@domain/config.ts'
import { rulesFromSkill } from '@domain/rules.ts'
import { runName, sampleDir } from '@domain/run-name.ts'
import type { Configuration, ReportResult, RunMeta, SampleMeta } from '@domain/schemas.ts'
import { scoreResult } from '@domain/scoring.ts'
import { copyOf, words } from '@domain/text.ts'
import { loadBench, loadCases, saveCase } from '@infrastructure/cases.ts'
import { writeJson } from '@infrastructure/fs.ts'
import { createSkill, touchRecent } from '@infrastructure/library.ts'
import { savePreference, saveReview } from '@infrastructure/reviews.ts'
import { runDir, versionsOf } from '@infrastructure/runs.ts'
import { skillFiles, skillHash, snapshotSkill, snapshotSkillFiles } from '@infrastructure/skill.ts'
import { saveVersion } from '@infrastructure/versions.ts'
import { scorers } from '@judges/scorers.ts'

const HOME = process.env.SKILL_STUDIO_HOME
if (!HOME) throw new Error('Set SKILL_STUDIO_HOME to a scratch folder before importing the seed.')

// A workspace with one project, so the library has a project place beside User.
const project = join(HOME, 'work', 'acme-app')
mkdirSync(join(project, '.agents', 'skills'), { recursive: true })
writeJson(join(HOME, '.skill-studio', 'library.json'), {
  workspaces: [join(HOME, 'work')],
  others: [],
  recent: [],
})

createSkill({
  scope: 'user',
  name: 'unit-tests',
  description: '',
  agents: ['claude', 'cursor'],
  template: 'code',
  samples: true,
})
createSkill({
  scope: 'user',
  name: 'pr-review',
  description: '',
  agents: ['claude'],
  template: 'workflow',
  samples: false,
})
createSkill({
  scope: project,
  name: 'landing-pages',
  description: '',
  agents: ['cursor'],
  template: 'design',
  samples: true,
})
const dir = createSkill({
  scope: project,
  name: 'release-notes',
  description:
    'Write a release note for a software change. Use when asked for a release note, changelog entry or "what\'s new" text.',
  agents: ['claude', 'cursor'],
  template: 'blank',
  samples: false,
})

const FRONT = `---
name: release-notes
description: Write a release note for a software change. Use when asked for a release note, changelog entry or "what's new" text.
---
`
const V0 = `${FRONT}
# Release notes

Write for the person who uses the software, not the person who built it.

## Rules

- Start with a one-line title that names the change in plain words. Readers scan titles and skip the rest.
- Keep the note under 120 words. A note longer than one screen is not read.
- Never use "excited", "thrilled" or "revolutionary". Hype makes the reader doubt the facts beside it.
- End with one line that says where to find the change. A reader who cannot find it files a ticket.
- State only what the request says. A guessed detail in a release note becomes a support promise.
`
const V1 = `${FRONT}
# Release notes

Write for the person who uses the software, not the person who built it. Read [references/voice.md](references/voice.md) before a note about a breaking change.

## Rules

- Start with a one-line title that names the change in plain words. Readers scan titles and skip the rest.
- Say what changed, then what it means for the reader, in that order. The reader decides in the first sentence whether the note is about them.
- Keep the note under 120 words. A note longer than one screen is not read.
- Never use "excited", "thrilled" or "revolutionary". Hype makes the reader doubt the facts beside it.
- End with one line that says where to find the change. A reader who cannot find it files a ticket.
- State only what the request says. A guessed detail in a release note becomes a support promise.

## Process

1. Read the request and list the facts it states.
2. Write the title, then the note.
3. Check each fact in the note against the list.
`
const VOICE = `# Voice for breaking changes

Read this when the change removes or renames something the reader depends on.

- Put the date in the title. A reader planning work needs it before anything else.
- Name what replaces the removed thing in the same sentence that removes it.
- Say what stays the same. A reader assumes everything changed unless told.
`

const CASES = [
  {
    id: 'export-folder',
    title: 'Release note for the export folder change',
    prompt:
      'Write a release note for this change: the export dialog now remembers the last folder the user picked, so repeat exports skip the folder prompt. It is in Settings > Export, available to every account from today.',
    expectedOutcome:
      'A short, plain note with a title, the change, what it means for the reader, and where to find it.',
    checks: [
      ['The note says the export dialog remembers the last folder picked.', 2],
      ['The note tells the reader the change is under Settings > Export.', 1],
    ],
  },
  {
    id: 'breaking-api',
    title: 'Release note for a removed API endpoint',
    prompt:
      'Write a release note: the API removes the /v1/reports endpoint on 1 March 2027. Callers must move to /v3/reports, which returns the same fields plus generated_at. Nothing else changes.',
    expectedOutcome:
      'A note a developer can plan from: the date, what to move to, and what stays the same.',
    checks: [
      ['The note gives the removal date, 1 March 2027.', 2],
      ['The note names /v3/reports as the endpoint to move to.', 1],
      ['The note says what stays the same.', 1],
    ],
  },
  {
    id: 'sync-fix',
    title: 'Release note for the offline sync fix',
    prompt:
      'Write a release note for this fix: notes edited offline on two devices no longer overwrite each other. Both versions are kept and the app asks which to keep. Fixed in 4.2.1 for iOS and Android.',
    expectedOutcome: 'A note that says what was wrong, what happens now, and which version has it.',
    checks: [
      ['The note says both versions of a note are kept.', 2],
      ['The note names the version, 4.2.1.', 1],
    ],
  },
] as const

type CaseId = (typeof CASES)[number]['id']
type Variant = 'good' | 'ok' | 'hype'

const OUTPUTS: Record<CaseId, Record<Variant, string>> = {
  'export-folder': {
    good: `# Export remembers your last folder

The export dialog now opens in the folder you last exported to. Repeat exports skip the folder prompt, so a weekly report takes one step less.

Find it in Settings > Export. It is on for every account from today.
`,
    ok: `# Export remembers your last folder

The export dialog now remembers the folder you picked last time, so repeat exports skip the folder prompt.

Available to every account from today.
`,
    hype: `# A revolutionary new export experience

We are thrilled to announce a major improvement to exporting! Our team has worked hard to rebuild the export dialog from the ground up. It now remembers the last folder you picked, which means that when you export again you will no longer be asked to choose a folder every single time. We think you are going to love how much faster your day feels.
`,
  },
  'breaking-api': {
    good: `# /v1/reports is removed on 1 March 2027

From 1 March 2027 the API no longer answers \`/v1/reports\`. Calls to it will fail, so move to \`/v3/reports\` before then.

\`/v3/reports\` returns the same fields and adds \`generated_at\`. Nothing else in the API changes.

Find the endpoint under Reports in the API reference.
`,
    ok: `# Reports endpoint moves to v3

The \`/v1/reports\` endpoint is removed on 1 March 2027. Use \`/v3/reports\` instead, which also returns \`generated_at\`.

See the API reference for the new endpoint.
`,
    hype: `# Exciting updates to our Reports API

We're excited to share that version 3 of the API brings a cleaner, more modern Reports endpoint with a new \`generated_at\` field. As part of this change we will be retiring some older endpoints in the future. We recommend that all customers review their integrations and plan to upgrade when convenient.
`,
  },
  'sync-fix': {
    good: `# Offline edits no longer overwrite each other

If you edit the same note offline on two devices, the app now keeps both versions and asks which one to keep. Before, the later sync replaced the earlier edit.

The fix is in version 4.2.1 for iOS and Android. Update from the App Store or Google Play.
`,
    ok: `# Fixed: notes overwritten after offline edits

Notes edited offline on two devices no longer overwrite each other. Both versions are kept and you choose which to keep.

Update the app on iOS or Android to get the fix.
`,
    hype: `# Sync improvements

We have made sync more reliable. Some users reported problems with notes after editing on more than one device, and this release resolves the conflict handling in the sync engine's merge step.
`,
  },
}

/** The judge's made-up probability per rule, by what the rule is about. */
const RULE_NOULS: Record<Variant, Record<string, number>> = {
  good: { title: 0.95, order: 0.92, under: 0.99, never: 0.99, where: 0.93, only: 0.88 },
  ok: { title: 0.9, order: 0.84, under: 0.99, never: 0.98, where: 0.34, only: 0.81 },
  hype: { title: 0.21, order: 0.38, under: 0.97, never: 0.02, where: 0.08, only: 0.27 },
}
const RULE_KEYS: Array<[RegExp, string]> = [
  [/^Start with/, 'title'],
  [/^Say what changed/, 'order'],
  [/^Keep the note/, 'under'],
  [/^Never use/, 'never'],
  [/^End with/, 'where'],
  [/^State only/, 'only'],
]
const CHECK_NOULS: Record<CaseId, Record<Variant, number[]>> = {
  'export-folder': { good: [0.97, 0.95], ok: [0.96, 0.06], hype: [0.9, 0.04] },
  'breaking-api': { good: [0.98, 0.96, 0.93], ok: [0.97, 0.95, 0.12], hype: [0.05, 0.31, 0.1] },
  'sync-fix': { good: [0.97, 0.98], ok: [0.95, 0.07], hype: [0.18, 0.03] },
}

interface Trouble {
  errors?: number
  retries?: number
  outside?: string[]
  followed?: number
}
interface SampleSpec {
  case: CaseId
  variant: Variant
  trouble?: Trouble
}
interface RunSpec {
  date: string
  time: string
  version: string
  versionName: string
  note: string
  model: string
  modelId: string
  configuration: Configuration
  samples: SampleSpec[]
}

const config = () => mergeConfig(loadBench(dir), scorers)

function writeRun(spec: RunSpec): string {
  const name = runName({
    date: spec.date,
    skillVersion: spec.version,
    engine: 'claude',
    model: spec.model,
    effort: null,
    configuration: spec.configuration,
  })
  const root = runDir(dir, name)
  const withSkill = spec.configuration !== 'without_skill'
  snapshotSkillFiles(dir, join(root, '_skill'))
  const rules = rulesFromSkill(readFileSync(join(dir, 'SKILL.md'), 'utf8'))
  const cases = loadCases(dir)
  const started = new Date(`${spec.date}T${spec.time}:00Z`).getTime()
  const counts = new Map<string, number>()
  const metas: SampleMeta[] = []
  const results: ReportResult[] = []
  const cfg = config()

  spec.samples.forEach((s, i) => {
    const index = (counts.get(s.case) ?? 0) + 1
    counts.set(s.case, index)
    const sample = sampleDir(s.case, index)
    const path = join(root, sample)
    const found = cases.find((c) => c.id === s.case)
    if (!found) throw new Error(`No case ${s.case}`)
    const text = OUTPUTS[s.case][s.variant]
    const trouble = s.trouble ?? {}
    const seconds = 14 + ((i * 7 + spec.model.length * 3) % 19)
    const toolCalls = 3 + (trouble.errors ?? 0) + (trouble.retries ?? 0) + (i % 2)
    const tokens = { input: 81200 + i * 913, output: 1180 + i * 61 }
    const costUsd = spec.model === 'haiku' ? 0.0031 + i * 0.0002 : 0.0412 + i * 0.0017
    mkdirSync(join(path, 'outputs'), { recursive: true })
    writeFileSync(join(path, 'prompt.md'), `${found.prompt}\n`)
    writeFileSync(join(path, 'outputs', 'output.md'), text)
    writeFileSync(
      join(path, 'notes.md'),
      '# Notes\n\n- Kept to the facts in the request.\n- The Settings path is copied from the request and was not checked against the app.\n',
    )
    if (withSkill) snapshotSkill(dir, join(path, '.agents', 'skills', 'release-notes'))
    const skillPath = join(path, '.agents/skills/release-notes/SKILL.md')
    const events = [
      { kind: 'system', text: `claude ${spec.modelId}` },
      ...(withSkill
        ? [
            { kind: 'tool', tool: 'Read', args: skillPath },
            {
              kind: 'result',
              tool: 'Read',
              result: '1 --- 2 name: release-notes 3 description: Write a release note for…',
              durationMs: 31,
            },
          ]
        : []),
      { kind: 'tool', tool: 'Read', args: join(path, 'prompt.md') },
      { kind: 'result', tool: 'Read', result: `1 ${found.prompt.slice(0, 70)}…`, durationMs: 12 },
      ...(trouble.errors
        ? [
            { kind: 'tool', tool: 'Bash', args: 'wc -w outputs/output.md' },
            {
              kind: 'error',
              tool: 'Bash',
              text: 'wc: outputs/output.md: No such file or directory',
              error: true,
            },
          ]
        : []),
      { kind: 'tool', tool: 'Write', args: join(path, 'outputs/output.md') },
      { kind: 'result', tool: 'Write', result: 'File created', durationMs: 9 },
      { kind: 'tool', tool: 'Write', args: join(path, 'notes.md') },
      { kind: 'result', tool: 'Write', result: 'File created', durationMs: 7 },
      {
        kind: 'text',
        text: 'Wrote the release note to `outputs/output.md` and my notes to `notes.md`.',
      },
    ]
    const stepMs = Math.floor((seconds * 1000) / (events.length + 1))
    writeFileSync(
      join(path, 'transcript.jsonl'),
      `${events.map((e, k) => JSON.stringify({ step: k + 1, at: 240 + k * stepMs, ...e })).join('\n')}\n`,
    )
    const at = new Date(started + i * 21_000)
    writeJson(join(path, 'timing.json'), {
      startedAt: at.toISOString(),
      finishedAt: new Date(at.getTime() + seconds * 1000).toISOString(),
      durationMs: seconds * 1000,
      costUsd,
      tokens,
      model: spec.modelId,
    })
    writeJson(join(path, 'agent.json'), {
      ok: true,
      error: null,
      finalText: 'Wrote the release note to `outputs/output.md` and my notes to `notes.md`.',
    })
    metas.push({
      dir: sample,
      case: s.case,
      index,
      ok: true,
      seconds,
      costUsd,
      tokens,
      model: spec.modelId,
      error: null,
      steps: events.length,
      toolCalls,
    })

    const primary = { file: 'outputs/output.md', kind: 'markdown' as const }
    const firstWrite = events.findIndex((e) => 'tool' in e && e.tool === 'Write') + 1
    const base: Omit<ReportResult, 'scores' | 'flags' | 'confidence'> = {
      sample,
      case: s.case,
      label: null,
      tests: [],
      artifacts: [primary],
      primary,
      words: words(copyOf(text)).length,
      range: found.bench.words ?? null,
      packs: {
        generic: {
          adherence: {
            rules: rules.map((r) => ({
              ...r,
              noul:
                RULE_NOULS[s.variant][RULE_KEYS.find(([test]) => test.test(r.text))?.[1] ?? ''] ??
                0.9,
            })),
          },
          rubric: {
            statements: found.graders.map((g, k) => ({
              id: g.id,
              text: g.statement,
              weight: g.weight,
              noul: CHECK_NOULS[s.case][s.variant][k] ?? 0.9,
              units: null,
              best: null,
            })),
          },
        },
        workflow: {
          metrics: {
            steps: events.length,
            toolCalls,
            errors: trouble.errors ?? 0,
            retries: trouble.retries ?? 0,
            seconds,
            costUsd,
            outside: trouble.outside ?? [],
            skillReadAt: withSkill ? 2 : null,
            firstWriteAt: firstWrite,
            skillPresent: withSkill,
            wroteOutput: true,
            maxTurns: null,
            timeoutSeconds: 300,
          },
          jev: {
            followedTask: trouble.followed ?? (s.variant === 'hype' ? 0.58 : 0.91),
            recovered: trouble.errors ? 0.83 : null,
          },
        },
      },
    }
    const scored = scoreResult(base, cfg, scorers)
    results.push({ ...base, ...scored })
  })

  const meta: RunMeta = {
    name,
    skillPath: dir,
    skillVersion: spec.version,
    skillName: spec.versionName,
    skillHash: skillHash(skillFiles(dir)),
    note: spec.note,
    writer: { engine: 'claude', model: spec.model, effort: 'default', harness: 'agent' },
    configuration: spec.configuration,
    baselineDir: null,
    cases: [...new Set(spec.samples.map((s) => s.case))],
    samplesPerCase: Math.max(...counts.values()),
    createdAt: new Date(started).toISOString(),
    finishedAt: new Date(started + spec.samples.length * 21_000 + 30_000).toISOString(),
    samples: metas,
  }
  writeJson(join(root, 'run.json'), meta)
  writeJson(join(root, 'report.json'), {
    createdAt: new Date(started + spec.samples.length * 21_000 + 45_000).toISOString(),
    model: 'jev-1.14.0',
    inputTokens: 2400 * spec.samples.length + 371,
    seconds: 0.4,
    config: cfg,
    packs: cfg.packs,
    results,
  })
  return name
}

function saveAs(name: string, note: string, date: string): string {
  const saved = saveVersion(dir, versionsOf(dir).current, name, note)
  const file = join(dir, 'evals/versions', saved.version, 'version.json')
  const json = JSON.parse(readFileSync(file, 'utf8'))
  writeJson(file, { ...json, createdAt: `${date}T15:00:00.000Z` })
  return saved.version
}

// The skill's bench, cases and first version.
writeJson(join(dir, 'evals/bench.json'), { packs: ['generic', 'workflow'] })
for (const c of CASES)
  saveCase(
    dir,
    {
      id: c.id,
      title: c.title,
      prompt: c.prompt,
      expectedOutcome: c.expectedOutcome,
      words: [30, 120],
      images: [],
      graders: c.checks.map(([statement, weight]) => ({
        id: null,
        statement,
        weight,
        image: null,
      })),
    },
    true,
  )

writeFileSync(join(dir, 'SKILL.md'), V0)
const v0 = saveAs('First draft', 'Five rules, each with its why.', '2026-11-02')
const twice = (
  variants: Record<CaseId, [Variant, Variant]>,
  trouble: Record<string, Trouble> = {},
) =>
  CASES.flatMap((c) =>
    variants[c.id].map((variant, k) => ({
      case: c.id,
      variant,
      trouble: trouble[`${c.id}-s${k + 1}`],
    })),
  )

const r0 = writeRun({
  date: '2026-11-02',
  time: '15:12',
  version: v0,
  versionName: 'First draft',
  note: 'First run of all three cases',
  model: 'sonnet',
  modelId: 'claude-sonnet-5-5',
  configuration: 'with_skill',
  samples: twice(
    {
      'export-folder': ['ok', 'good'],
      'breaking-api': ['ok', 'hype'],
      'sync-fix': ['ok', 'ok'],
    },
    { 'breaking-api-s2': { errors: 1 } },
  ),
})
const r0bare = writeRun({
  date: '2026-11-02',
  time: '15:31',
  version: v0,
  versionName: 'First draft',
  note: 'Baseline: no skill installed',
  model: 'sonnet',
  modelId: 'claude-sonnet-5-5',
  configuration: 'without_skill',
  samples: [
    { case: 'export-folder', variant: 'hype' },
    { case: 'breaking-api', variant: 'hype' },
    { case: 'sync-fix', variant: 'ok' },
  ],
})

mkdirSync(join(dir, 'references'), { recursive: true })
writeFileSync(join(dir, 'SKILL.md'), V1)
writeFileSync(join(dir, 'references/voice.md'), VOICE)
const v1 = saveAs(
  'Lead with the change',
  'Added the order rule and a voice reference: v0 notes buried what changed under the announcement.',
  '2026-11-03',
)
const r1 = writeRun({
  date: '2026-11-03',
  time: '10:04',
  version: v1,
  versionName: 'Lead with the change',
  note: 'Same cases after the order rule',
  model: 'sonnet',
  modelId: 'claude-sonnet-5-5',
  configuration: 'with_skill',
  samples: twice({
    'export-folder': ['good', 'good'],
    'breaking-api': ['good', 'ok'],
    'sync-fix': ['good', 'good'],
  }),
})
const r1haiku = writeRun({
  date: '2026-11-03',
  time: '10:26',
  version: v1,
  versionName: 'Lead with the change',
  note: 'Does a smaller model follow it?',
  model: 'haiku',
  modelId: 'claude-haiku-5-5',
  configuration: 'with_skill',
  samples: twice(
    {
      'export-folder': ['good', 'ok'],
      'breaking-api': ['ok', 'good'],
      'sync-fix': ['good', 'ok'],
    },
    {
      'sync-fix-s2': { outside: ['/Users/dana/work/acme-app/CHANGELOG.md'], retries: 2 },
      'breaking-api-s1': { followed: 0.54 },
    },
  ),
})

// Reviews of the first runs; the newest runs stay in the blind queue.
const rate = (
  run: string,
  sample: string,
  rating: number,
  layers: Record<string, 'good' | 'bad'>,
  note: string,
) => saveReview(dir, `${run}/${sample}`, { rating, layers, note })
rate(
  r0,
  'export-folder-s1',
  3,
  { adherence: 'bad', rubric: 'bad' },
  'Clear, but never says where the setting is.',
)
rate(r0, 'export-folder-s2', 5, { adherence: 'good', rubric: 'good' }, 'Ships as is.')
rate(
  r0,
  'breaking-api-s1',
  3,
  { adherence: 'good', rubric: 'bad' },
  'Date is there. Does not say the fields stay the same.',
)
rate(
  r0,
  'breaking-api-s2',
  1,
  { adherence: 'bad', rubric: 'bad', process: 'bad' },
  'Hype, no date. The skill should have forced the date into the title.',
)
rate(
  r0,
  'sync-fix-s1',
  4,
  { adherence: 'good', rubric: 'good' },
  'Good note. The version number is missing but the update line covers it.',
)
rate(r0, 'sync-fix-s2', 3, { adherence: 'bad', rubric: 'bad' }, 'No version number.')
rate(r0bare, 'export-folder-s1', 1, { adherence: 'bad', rubric: 'bad' }, 'Reads like an advert.')
rate(r0bare, 'sync-fix-s1', 3, { rubric: 'bad' }, 'Fine, no version.')
rate(
  r1,
  'export-folder-s1',
  5,
  { adherence: 'good', rubric: 'good', process: 'good' },
  'Leads with the change.',
)
rate(
  r1,
  'breaking-api-s1',
  5,
  { adherence: 'good', rubric: 'good' },
  'Date in the title, as the reference asks.',
)

const vote = (
  a: string,
  b: string,
  human: 'a' | 'b' | 'tie',
  jev: 'a' | 'b' | 'tie',
  sure: number,
) => {
  savePreference(dir, { a, b, criterion: 'overall', vote: human, by: 'human' })
  savePreference(dir, { a, b, criterion: 'overall', vote: jev, by: 'jev', confidence: sure })
}
vote(`${r0}/export-folder-s1`, `${r1}/export-folder-s1`, 'b', 'b', 0.91)
vote(`${r0}/breaking-api-s2`, `${r1}/breaking-api-s1`, 'b', 'b', 0.97)
vote(`${r1}/sync-fix-s1`, `${r1haiku}/sync-fix-s2`, 'a', 'a', 0.74)
vote(`${r0}/sync-fix-s1`, `${r1}/sync-fix-s2`, 'b', 'a', 0.66)

touchRecent(dir)

/** What the capture script looks for on screen. */
export const sample = {
  skill: 'release-notes',
  /** The run whose detail the Results shot opens. */
  run: 'v1 · Claude Sonnet',
  /** A weak v0 answer beside a v1 answer to the same case. */
  compare: { a: `${r0}/breaking-api-s2`, b: `${r1}/breaking-api-s1` },
}
