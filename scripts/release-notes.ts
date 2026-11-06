/**
 * Print one version's entry from CHANGELOG.md. The release workflow runs it
 * twice for a tag: into `build/release-notes.md`, which electron-builder
 * writes into the update files so a running copy can show what an update
 * brings, and into the body of the GitHub release.
 *
 * `tsx scripts/release-notes.ts [version]`: the version defaults to the one in
 * package.json. It fails when the changelog has no entry for it, so a release
 * cannot go out without notes.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { releaseNotes } from '@domain/changelog.ts'

const root = join(import.meta.dirname, '..')
const read = (file: string): string => readFileSync(join(root, file), 'utf8')

const version = process.argv[2] ?? (JSON.parse(read('package.json')) as { version: string }).version
const notes = releaseNotes(read('CHANGELOG.md'), version)

if (notes === null) {
  console.error(
    `CHANGELOG.md has no entry for ${version}. Add "## [${version}] - <date>" with what changed.`,
  )
  process.exit(1)
}
console.log(notes)
