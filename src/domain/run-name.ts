import type { Configuration } from './schemas.ts'
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
