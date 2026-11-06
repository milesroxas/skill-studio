import { describe, expect, it } from 'vitest'
import {
  isUpdateRequest,
  nextUpdateState,
  releasedAgo,
  stepFor,
  type Update,
  type UpdateEvent,
  type UpdateState,
  updateOf,
  updateProblem,
} from './update.ts'

const update: Update = { version: '1.2.0', date: '2026-11-05T12:00:00.000Z', notes: '- A fix' }
const idle: UpdateState = { status: 'idle', checkedAt: null }

const run = (state: UpdateState, ...events: UpdateEvent[]): UpdateState =>
  events.reduce(nextUpdateState, state)

describe('nextUpdateState', () => {
  it('walks a release from found to restarting', () => {
    const found = run(idle, { type: 'checking' }, { type: 'found', update })
    expect(found).toEqual({ status: 'available', update })
    const downloading = run(found, { type: 'downloading' }, { type: 'progress', percent: 42.5 })
    expect(downloading).toEqual({ status: 'downloading', update, percent: 42.5 })
    const ready = run(downloading, { type: 'downloaded', update })
    expect(ready).toEqual({ status: 'ready', update })
    expect(run(ready, { type: 'installing' })).toEqual({ status: 'installing', update })
  })

  it('records when a check found nothing newer', () => {
    expect(run(idle, { type: 'checking' }, { type: 'none', at: 1234 })).toEqual({
      status: 'idle',
      checkedAt: 1234,
    })
  })

  it('never takes back a release in hand when a new check starts', () => {
    const states: UpdateState[] = [
      { status: 'available', update },
      { status: 'error', message: 'x', update },
      { status: 'downloading', update, percent: 10 },
      { status: 'ready', update },
      { status: 'installing', update },
    ]
    for (const state of states) expect(nextUpdateState(state, { type: 'checking' })).toBe(state)
  })

  it('takes a newer release over the one at rest, and lets a withdrawn one go', () => {
    const newer = { ...update, version: '1.3.0' }
    const atRest: UpdateState[] = [
      { status: 'available', update },
      { status: 'error', message: 'x', update },
    ]
    for (const state of atRest) {
      expect(run(state, { type: 'found', update: newer })).toEqual({
        status: 'available',
        update: newer,
      })
      expect(run(state, { type: 'none', at: 5 })).toEqual({ status: 'idle', checkedAt: 5 })
    }
  })

  it('keeps the bar from running back, and inside 0 to 100', () => {
    const at = (percent: number): UpdateState => ({ status: 'downloading', update, percent })
    expect(run(at(60), { type: 'progress', percent: 20 })).toEqual(at(60))
    expect(run(at(60), { type: 'progress', percent: 250 })).toEqual(at(100))
    expect(run(at(0), { type: 'progress', percent: Number.NaN })).toEqual(at(0))
  })

  it('shows a failure someone asked about, with the release still in hand', () => {
    const failed: UpdateEvent = { type: 'failed', message: 'No luck', quiet: false }
    expect(run({ status: 'checking' }, failed)).toEqual({
      status: 'error',
      message: 'No luck',
      update: null,
    })
    expect(run({ status: 'downloading', update, percent: 30 }, failed)).toEqual({
      status: 'error',
      message: 'No luck',
      update,
    })
    expect(run({ status: 'installing', update }, failed)).toEqual({
      status: 'error',
      message: 'No luck',
      update,
    })
  })

  it('hears a failure after the download: the system checks a release last', () => {
    const ready: UpdateState = { status: 'ready', update }
    expect(run(ready, { type: 'failed', message: 'Not signed', quiet: false })).toEqual({
      status: 'error',
      message: 'Not signed',
      update,
    })
    expect(run(ready, { type: 'failed', message: 'Not signed', quiet: true })).toEqual({
      status: 'available',
      update,
    })
  })

  it('falls back without a word when nobody asked', () => {
    const failed: UpdateEvent = { type: 'failed', message: 'Offline', quiet: true }
    expect(run({ status: 'checking' }, failed)).toEqual(idle)
    expect(run({ status: 'downloading', update, percent: 30 }, failed)).toEqual({
      status: 'available',
      update,
    })
  })

  it('tries again from an error: the download when a release is in hand, a check when not', () => {
    const withUpdate: UpdateState = { status: 'error', message: 'x', update }
    expect(run(withUpdate, { type: 'downloading' })).toEqual({
      status: 'downloading',
      update,
      percent: 0,
    })
    const without: UpdateState = { status: 'error', message: 'x', update: null }
    expect(nextUpdateState(without, { type: 'downloading' })).toBe(without)
    expect(run(without, { type: 'checking' })).toEqual({ status: 'checking' })
  })

  it('ignores what does not fit the state', () => {
    expect(nextUpdateState(idle, { type: 'installing' })).toBe(idle)
    expect(nextUpdateState(idle, { type: 'progress', percent: 5 })).toBe(idle)
    expect(nextUpdateState(idle, { type: 'failed', message: 'x', quiet: false })).toBe(idle)
    const found: UpdateState = { status: 'available', update }
    expect(nextUpdateState(found, { type: 'failed', message: 'x', quiet: false })).toBe(found)
  })

  it('stays unsupported whatever is reported', () => {
    const unsupported: UpdateState = { status: 'unsupported' }
    expect(run(unsupported, { type: 'checking' }, { type: 'found', update })).toBe(unsupported)
  })
})

describe('stepFor', () => {
  it('offers the one step that moves each state on', () => {
    expect(stepFor(idle)).toBe('check')
    expect(stepFor({ status: 'available', update })).toBe('download')
    expect(stepFor({ status: 'ready', update })).toBe('install')
  })

  it('tries the failed step again: the download with a release in hand, the check without', () => {
    expect(stepFor({ status: 'error', message: 'x', update })).toBe('download')
    expect(stepFor({ status: 'error', message: 'x', update: null })).toBe('check')
  })

  it('offers nothing while a step is under way, or where updates are not supported', () => {
    expect(stepFor({ status: 'checking' })).toBeNull()
    expect(stepFor({ status: 'downloading', update, percent: 5 })).toBeNull()
    expect(stepFor({ status: 'installing', update })).toBeNull()
    expect(stepFor({ status: 'unsupported' })).toBeNull()
  })
})

describe('updateOf', () => {
  it('keeps the notes this project wrote into the release', () => {
    expect(
      updateOf({ version: '1.2.0', releaseDate: update.date, releaseNotes: '\n### Fixed\n- A\n' }),
    ).toEqual({ version: '1.2.0', date: update.date, notes: '### Fixed\n- A' })
  })

  it('drops notes it cannot show: HTML from the feed, a list, nothing', () => {
    expect(updateOf({ version: '1', releaseNotes: '<p>Full Changelog</p>' }).notes).toBeNull()
    expect(updateOf({ version: '1', releaseNotes: [{ version: '1', note: 'x' }] }).notes).toBeNull()
    expect(updateOf({ version: '1', releaseNotes: '   ' }).notes).toBeNull()
    expect(updateOf({ version: '1' }).notes).toBeNull()
  })

  it('drops a date it cannot read', () => {
    expect(updateOf({ version: '1', releaseDate: 'soon' }).date).toBeNull()
    expect(updateOf({ version: '1', releaseDate: 7 }).date).toBeNull()
  })
})

describe('updateProblem', () => {
  it('names a known cause and its next step', () => {
    expect(updateProblem(new Error('net::ERR_INTERNET_DISCONNECTED\n    at stack'))).toMatch(
      /reach GitHub/,
    )
    expect(updateProblem(new Error('Cannot update while running on a read-only volume.'))).toMatch(
      /Applications folder/,
    )
    expect(updateProblem(new Error('sha512 checksum mismatch, expected a, got b'))).toMatch(
      /did not pass its check/,
    )
  })

  it('gives anything else its first line, cut to fit', () => {
    expect(updateProblem(new Error('No published versions on GitHub\n<xml>'))).toBe(
      'No published versions on GitHub',
    )
    expect(updateProblem(new Error('x'.repeat(400)))).toHaveLength(160)
    expect(updateProblem(undefined)).toMatch(/could not be finished/)
  })
})

describe('isUpdateRequest', () => {
  it('knows the requests a window may make, and nothing else', () => {
    expect(isUpdateRequest('install')).toBe(true)
    expect(isUpdateRequest('quit')).toBe(false)
    expect(isUpdateRequest(undefined)).toBe(false)
  })
})

describe('releasedAgo', () => {
  const at = Date.parse('2026-11-05T12:00:00.000Z')
  const since = (ms: number) => releasedAgo('2026-11-05T12:00:00.000Z', at + ms)
  const MINUTE = 60_000
  const DAY = 24 * 60 * MINUTE

  it('counts in the largest unit that fits', () => {
    expect(since(20_000)).toBe('just now')
    expect(since(24 * MINUTE)).toBe('24m ago')
    expect(since(5 * 60 * MINUTE)).toBe('5h ago')
    expect(since(3 * DAY)).toBe('3d ago')
    expect(since(42 * DAY)).toBe('6w ago')
    expect(since(800 * DAY)).toBe('2y ago')
  })

  it('says nothing for a release with no day, a day it cannot read, or one still to come', () => {
    expect(releasedAgo(null, at)).toBeNull()
    expect(releasedAgo('soon', at)).toBeNull()
    expect(since(-MINUTE)).toBeNull()
  })
})
