import { oneLineTitle } from './case-draft.ts'
import type { Configuration, RunMeta } from './schemas.ts'
import { slug } from './text.ts'

export interface RunNameParts {
  date: string
  skillVersion: string
  engine: string
  model: string | null
  effort: string | null
  configuration: Configuration
}

/** `<date>-skill-<vN>-<engine>-<model>[-<effort>][-<configuration>]`; the caller adds `-2`, `-3` on collision. */
export function runName(parts: RunNameParts): string {
  const tag = [
    parts.engine,
    parts.model,
    parts.effort && parts.effort !== 'default' ? parts.effort : null,
  ]
    .filter(Boolean)
    .map((p) => slug(String(p)))
    .join('-')
  const config = parts.configuration === 'with_skill' ? '' : `-${slug(parts.configuration)}`
  return `${parts.date}-skill-${parts.skillVersion}-${tag}${config}`
}

/**
 * A run as `st` names it to a reader: its folder, which `--run` takes, and
 * the version it ran, with the name that version was given.
 */
export interface RunNamed {
  /** The run's folder. */
  name: string
  /** The version it ran ("v1"); null for a run without the skill, which tested none, and for one that recorded none. */
  version: string | null
  /** The version's name as `st versions` lists it; null where it was given none. */
  versionName: string | null
  configuration: Configuration
}

/**
 * The run in `name`, named by `meta`, its `run.json`, and the skill's
 * versions as `st versions` lists them. A run without the skill names no
 * version, though it is stamped with the number and name the skill had then.
 * A version no longer listed keeps the name the run recorded for it.
 */
export function runNamed(
  name: string,
  meta: Pick<RunMeta, 'configuration' | 'skillVersion' | 'skillName'> | null,
  versions: ReadonlyArray<{ version: string; name: string }>,
): RunNamed {
  const configuration = meta?.configuration ?? 'with_skill'
  const version = configuration === 'without_skill' ? '' : (meta?.skillVersion ?? '')
  if (!version) return { name, version: null, versionName: null, configuration }
  const given = versions.find((v) => v.version === version)?.name ?? meta?.skillName ?? ''
  return { name, version, versionName: oneLineTitle(given) ? given : null, configuration }
}

/**
 * What a run tested, in words: "v1 · draft a", "v1 · draft a · old skill" for
 * a run on a version's kept copy, or "without the skill". The name is on one
 * line, whatever it holds. Null for a run that recorded no version.
 */
export function versionWords(run: RunNamed): string | null {
  if (run.configuration === 'without_skill') return 'without the skill'
  if (!run.version) return null
  const words = run.versionName ? `${run.version} · ${oneLineTitle(run.versionName)}` : run.version
  return run.configuration === 'old_skill' ? `${words} · old skill` : words
}

/**
 * A run as a reader is shown it: its folder, so two runs of one version, or
 * of two versions given look-alike names, are told apart, then what it
 * tested: "2026-11-26-skill-v1-claude-haiku (v1 · draft a)".
 */
export function runShown(run: RunNamed): string {
  const words = versionWords(run)
  return words ? `${run.name} (${words})` : run.name
}

export const sampleDir = (caseId: string, index: number): string => `${caseId}-s${index}`

/** `<case>-s<n>` back to its parts; null for a name that is not a sample dir. */
export function parseSampleDir(name: string): { case: string; index: number } | null {
  const match = /^(.+)-s(\d+)$/.exec(name.replace(/\.md$/, ''))
  return match ? { case: match[1], index: Number(match[2]) } : null
}

/**
 * The case and attempt a sample is of: the case a grading of it names, when
 * one does, else the one its name gives (`<case>-s<n>`), else its whole name.
 * A name that numbers no attempt is the first.
 */
export function sampleOf(name: string, graded: string | null): { case: string; index: number } {
  const parsed = parseSampleDir(name)
  return { case: graded ?? parsed?.case ?? name, index: parsed?.index ?? 1 }
}
