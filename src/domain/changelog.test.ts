import { describe, expect, it } from 'vitest'
import { releaseNotes, releasesOf } from './changelog.ts'

const FILE = `# Changelog

What changed in each release.

## [Unreleased]

### Added

- Something still in the works.

## [1.2.0] - 2026-11-05

### Added

- Updates in one click.

### Fixed

- A window that opened off screen.

## 1.1.0

- Brackets and a date are optional.

## [1.0.0] - 2026-10-01

[1.2.0]: https://example.com/compare/v1.1.0...v1.2.0
[1.0.0]: https://example.com/releases/v1.0.0
`

describe('releasesOf', () => {
  it('reads each release with its date and notes, newest first as written', () => {
    expect(releasesOf(FILE)).toEqual([
      {
        version: '1.2.0',
        date: '2026-11-05',
        notes:
          '### Added\n\n- Updates in one click.\n\n### Fixed\n\n- A window that opened off screen.',
      },
      { version: '1.1.0', date: null, notes: '- Brackets and a date are optional.' },
      { version: '1.0.0', date: '2026-10-01', notes: '' },
    ])
  })

  it('leaves out work that is not released, and the text above the first release', () => {
    const versions = releasesOf(FILE).map((release) => release.version)
    expect(versions).not.toContain('Unreleased')
    expect(releasesOf('# Changelog\n\nNothing yet.\n')).toEqual([])
  })

  it('reads a file with Windows line endings', () => {
    expect(releasesOf('## [1.0.0] - 2026-10-01\r\n\r\n- One change.\r\n')).toEqual([
      { version: '1.0.0', date: '2026-10-01', notes: '- One change.' },
    ])
  })
})

describe('releaseNotes', () => {
  it('finds one version, prerelease names included', () => {
    expect(releaseNotes('## [0.1.0-beta.2] - 2026-11-05\n\n- A change.\n', '0.1.0-beta.2')).toBe(
      '- A change.',
    )
  })

  it('is null for a version with no entry, or an entry that says nothing', () => {
    expect(releaseNotes(FILE, '9.9.9')).toBeNull()
    expect(releaseNotes(FILE, '1.0.0')).toBeNull()
    expect(releaseNotes(FILE, 'Unreleased')).toBeNull()
  })
})
