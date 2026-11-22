/**
 * The stored outputs of a copy of the `launch-note` test skill, as the bench
 * reads them: each graded output of each run, with the SKILL.md its run was
 * made with, the case as the run asked it, and the output as `answerExact`
 * takes it. Shared by `sorted.ts` and `src/interfaces/cli/exact-key.test.ts`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { ExactSubject } from '@domain/exact.ts'
import { type Rule, scanRules } from '@domain/rules.ts'
import type { ArtifactKind, Case } from '@domain/schemas.ts'
import { loadCases } from '@infrastructure/cases.ts'
import { readKept } from '@infrastructure/run-cases.ts'

const V1 = readFileSync(resolve(import.meta.dirname, 'skill/v1.md'), 'utf8')

/** One graded output of a stored run. */
export interface StoredOutput {
  run: string
  sample: string
  version: 'v1' | 'v2'
  /** The SKILL.md its run was made with, and its rules. */
  skillMd: string
  rules: Rule[]
  /** The case as the run asked it, and the fingerprint it kept of what it asked. */
  testCase: Case
  ask: string | null
  subject: ExactSubject
}

/** Every graded output of every run under `skill`'s `evals/runs`. */
export function storedOutputs(skill: string): StoredOutput[] {
  const runs = join(skill, 'evals/runs')
  const live = loadCases(skill)
  return readdirSync(runs).flatMap((run) => {
    const dir = join(runs, run)
    const skillMd = readFileSync(join(dir, '_skill/SKILL.md'), 'utf8')
    const version = skillMd === V1 ? 'v1' : 'v2'
    const rules = scanRules(skillMd).rules
    const kept = readKept(dir).kept ?? []
    const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')) as {
      results: Array<{
        sample: string
        case: string
        primary: { file: string; kind: ArtifactKind }
      }>
    }
    const meta = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8')) as {
      samples: Array<{ dir: string; outputs: string[] }>
    }
    return report.results.map((result): StoredOutput => {
      const held = kept.find((k) => k.case.id === result.case)
      const testCase = held?.case ?? live.find((c) => c.id === result.case)
      if (!testCase) throw new Error(`no case ${result.case}`)
      const inputs = join(dir, '_inputs', result.case)
      const files = Object.fromEntries(
        readdirSync(inputs).map((name) => [name, readFileSync(join(inputs, name), 'utf8')]),
      )
      const sample = join(dir, result.sample)
      const written = meta.samples.find((s) => s.dir === result.sample)?.outputs ?? []
      const others = Object.fromEntries(
        written
          .filter((file) => file !== result.primary.file)
          .map((file) => [file, readFileSync(join(sample, file), 'utf8')]),
      )
      return {
        run,
        sample: result.sample,
        version,
        skillMd,
        rules,
        testCase,
        ask: held?.ask ?? null,
        subject: {
          output: readFileSync(join(sample, result.primary.file), 'utf8'),
          kind: result.primary.kind,
          others,
          request: testCase.prompt,
          files,
          layout: null,
        },
      }
    })
  })
}
