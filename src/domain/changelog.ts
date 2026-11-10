/**
 * The project's changelog, read from CHANGELOG.md. That one file is the
 * source of every release note: the app shows it, the release workflow writes
 * the tagged version's entry into the GitHub release, and the same entry
 * travels to running copies inside the update files.
 *
 * The file follows Keep a Changelog: one `## [version] - date` heading per
 * release, newest first, with what changed under it.
 */

export interface Release {
  version: string
  /** The day it was released, `YYYY-MM-DD`; null when the heading gives none. */
  date: string | null
  /** What changed, as Markdown. */
  notes: string
}

/**
 * `## [1.2.0] - 2026-11-05`, with or without the brackets and the date, and
 * with anything after the date, such as `[YANKED]`. A version starts with a
 * digit (after a `v`, if it has one), or is the word for work not yet released: any other `##` heading,
 * such as `## Notes`, is text of the release it stands in.
 */
const HEADING =
  /^## \[?(v?\d[^\]\s]*|unreleased)\]?(?:\s+[-–—]\s+(\d{4}-\d{2}-\d{2})(?:\s.*)?)?\s*$/i
/** A link definition at the foot of the file, such as `[1.2.0]: https://…`. */
const LINK_DEFINITION = /^\[[^\]]+\]:\s+\S+$/
/** Work that is not in a release yet. It has no version, so it is no release. */
const UNRELEASED = 'unreleased'

/** Every release in the file, in the order written. */
export function releasesOf(markdown: string): Release[] {
  const releases: Release[] = []
  let open: { version: string; date: string | null; lines: string[] } | null = null
  const close = () => {
    if (open && open.version.toLowerCase() !== UNRELEASED)
      releases.push({ version: open.version, date: open.date, notes: open.lines.join('\n').trim() })
  }
  for (const line of markdown.split(/\r?\n/)) {
    const heading = HEADING.exec(line)
    if (heading) {
      close()
      open = { version: heading[1], date: heading[2] ?? null, lines: [] }
    } else if (open && !LINK_DEFINITION.test(line)) open.lines.push(line)
  }
  close()
  return releases
}

/** One version's entry, or null when the file has none or it says nothing. */
export const releaseNotes = (markdown: string, version: string): string | null =>
  releasesOf(markdown).find((release) => release.version === version)?.notes || null
