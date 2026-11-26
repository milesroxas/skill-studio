/**
 * The lines between a command and the drawing host, the Electron process
 * with no window that `st run`, `st grade` and `st serve` draw pages with:
 * one JSON line for each page asked for, and one back for each, matched by
 * `id`. Pure: the host and the command's side read and write the same lines.
 */
import type { ArtifactAddress } from './artifact-address.ts'
import type { PageLayout } from './layout.ts'

/**
 * The start of the name of a host's profile folder in the system's temp
 * folder, which goes on with its process id and a dash. The host makes it,
 * and the command removes what is left of it once the host's process is gone.
 */
export const PROFILE_PREFIX = 'skill-studio-draw-'

/** The names in `names` of the profile folders of the host with process id `pid`, and of no other. */
export const profilesOf = (names: readonly string[], pid: number): string[] =>
  names.filter((name) => name.startsWith(`${PROFILE_PREFIX}${pid}-`))

/** One line the command writes to the host. */
export type HostRequest =
  | { id: string; page: ArtifactAddress; width: number; height: number }
  /** 1.8: a page of the command's own, by its `file:` address. */
  | { id: string; file: string; width: number; height: number }

/** One line the host writes back. */
export type HostReply =
  | { id: string; png: string; layout: PageLayout | null }
  | { id: string; error: string }

const objectOf = (line: string): Record<string, unknown> | null => {
  try {
    const value: unknown = JSON.parse(line)
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

const isText = (value: unknown): value is string => typeof value === 'string'
const isSize = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

/** The request a line holds; null for a line that is not one, which the host passes over. */
export function requestOf(line: string): HostRequest | null {
  const raw = objectOf(line)
  if (!raw || !isText(raw.id) || !isSize(raw.width) || !isSize(raw.height)) return null
  const { id, width, height } = raw
  if (isText(raw.file)) return { id, file: raw.file, width, height }
  const page = raw.page as Partial<Record<keyof ArtifactAddress, unknown>> | null
  if (!page || typeof page !== 'object') return null
  const { skill, run, sample, file } = page
  if (!isText(skill) || !skill || !isText(run) || !isText(sample) || !isText(file)) return null
  return { id, page: { skill, run, sample, file }, width, height }
}

/**
 * The reply a line holds; null for a line that is not one. The layout is
 * left as sent: the command's side reads it with `readLayout`.
 */
export function replyOf(line: string): HostReply | null {
  const raw = objectOf(line)
  if (!raw || !isText(raw.id)) return null
  if (isText(raw.error)) return { id: raw.id, error: raw.error }
  if (!isText(raw.png)) return null
  return { id: raw.id, png: raw.png, layout: (raw.layout ?? null) as PageLayout | null }
}
