import type { UpdateState } from '@domain/update.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUpdater, type UpdateSource } from './updater.ts'

const RELEASE = { version: '1.2.0', releaseDate: '2026-11-05T12:00:00.000Z', releaseNotes: '- A' }
const UPDATE = { version: '1.2.0', date: RELEASE.releaseDate, notes: '- A' }

/** A stand-in for electron-updater: it records what it is asked and reports what a test tells it to. */
class FakeSource {
  autoDownload = true
  active = true
  checks = 0
  downloads = 0
  installs = 0
  /** What `quitAndInstall` throws, when a test wants it to fail. */
  refuses: Error | null = null
  private readonly listeners = new Map<string, (value: never) => void>()

  isUpdaterActive(): boolean {
    return this.active
  }
  checkForUpdates(): Promise<unknown> {
    this.checks += 1
    return Promise.resolve(null)
  }
  downloadUpdate(): Promise<unknown> {
    this.downloads += 1
    return Promise.resolve([])
  }
  quitAndInstall(): void {
    this.installs += 1
    if (this.refuses) throw this.refuses
  }
  on(event: string, listener: (value: never) => void): this {
    this.listeners.set(event, listener)
    return this
  }
  emit(event: string, value?: unknown): void {
    this.listeners.get(event)?.(value as never)
  }
}

function setup(configure: (source: FakeSource) => void = () => {}) {
  const source = new FakeSource()
  configure(source)
  const states: UpdateState[] = []
  const updater = createUpdater({
    source: source as UpdateSource,
    onState: (state) => states.push(state),
    now: () => 1000,
  })
  return { source, states, updater }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createUpdater', () => {
  it('starts idle in a copy that can update itself, unsupported in one that cannot', () => {
    expect(setup().updater.state()).toEqual({ status: 'idle', checkedAt: null })
    const dev = setup((source) => {
      source.active = false
    })
    expect(dev.updater.state()).toEqual({ status: 'unsupported' })
    dev.updater.check(true)
    dev.updater.follow('auto')
    vi.advanceTimersByTime(24 * 60 * 60 * 1000)
    expect(dev.source.checks).toBe(0)
  })

  it('downloads what a check finds and waits for the restart', () => {
    const { source, states, updater } = setup()
    updater.follow('auto')
    updater.check(false)
    source.emit('checking-for-update')
    source.emit('update-available', RELEASE)
    source.emit('download-progress', { percent: 40 })
    source.emit('update-downloaded', RELEASE)
    // Found and downloading land as one change: no window shows "available" for an instant.
    expect(states).toEqual([
      { status: 'checking' },
      { status: 'downloading', update: UPDATE, percent: 0 },
      { status: 'downloading', update: UPDATE, percent: 40 },
      { status: 'ready', update: UPDATE },
    ])
    updater.install()
    expect(source.installs).toBe(1)
    expect(updater.state()).toEqual({ status: 'installing', update: UPDATE })
  })

  it('waits for a go-ahead to download when told to wait', () => {
    const { source, updater } = setup()
    updater.follow('manual')
    expect(source.autoDownload).toBe(false)
    updater.check(true)
    source.emit('checking-for-update')
    source.emit('update-available', RELEASE)
    expect(updater.state()).toEqual({ status: 'available', update: UPDATE })
    expect(source.downloads).toBe(0)
    updater.download()
    expect(source.downloads).toBe(1)
    expect(updater.state()).toEqual({ status: 'downloading', update: UPDATE, percent: 0 })
  })

  it('says when a check last found nothing newer', () => {
    const { source, updater } = setup()
    updater.check(true)
    source.emit('checking-for-update')
    source.emit('update-not-available', RELEASE)
    expect(updater.state()).toEqual({ status: 'idle', checkedAt: 1000 })
  })

  it('looks on its own after launch and every few hours, only in auto', () => {
    const { source, updater } = setup()
    updater.follow('auto')
    expect(source.checks).toBe(0)
    vi.advanceTimersByTime(15_000)
    expect(source.checks).toBe(1)
    vi.advanceTimersByTime(4 * 60 * 60 * 1000)
    expect(source.checks).toBe(2)
    updater.follow('manual')
    vi.advanceTimersByTime(24 * 60 * 60 * 1000)
    expect(source.checks).toBe(2)
  })

  it('keeps a failure nobody asked about to itself', () => {
    const { source, states, updater } = setup()
    updater.check(false)
    source.emit('checking-for-update')
    source.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED'))
    expect(states.at(-1)).toEqual({ status: 'idle', checkedAt: null })
  })

  it('tries again soon after a look of its own fails, in auto only', () => {
    const { source, updater } = setup()
    updater.follow('auto')
    vi.advanceTimersByTime(15_000)
    expect(source.checks).toBe(1)
    source.emit('checking-for-update')
    source.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED'))
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(source.checks).toBe(2)

    const manual = setup()
    manual.updater.follow('manual')
    manual.updater.check(false)
    manual.source.emit('checking-for-update')
    manual.source.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED'))
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(manual.source.checks).toBe(1)
  })

  it('leaves a failure someone saw to them, and drops the retry when a look starts', () => {
    const { source, updater } = setup()
    updater.follow('auto')
    vi.advanceTimersByTime(15_000)
    source.emit('checking-for-update')
    source.emit('update-not-available', RELEASE)
    expect(source.checks).toBe(1)

    updater.check(true)
    source.emit('checking-for-update')
    source.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED'))
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(source.checks).toBe(2)

    updater.check(false)
    source.emit('checking-for-update')
    source.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED'))
    // A look someone asks for before the retry is due takes its place.
    updater.check(true)
    source.emit('checking-for-update')
    source.emit('update-not-available', RELEASE)
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(source.checks).toBe(4)
  })

  it('shows a failure to whoever asked, even when the step began on its own', () => {
    const { source, updater } = setup()
    updater.check(false)
    source.emit('checking-for-update')
    // Asked for while the first check is still out: no second one starts, and this one is now watched.
    updater.check(true)
    expect(source.checks).toBe(1)
    source.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED'))
    expect(updater.state()).toEqual({
      status: 'error',
      message: 'Could not reach GitHub. Check the connection and try again.',
      update: null,
    })
  })

  it('offers the download again when one that began on its own fails', () => {
    const { source, updater } = setup()
    updater.follow('auto')
    updater.check(false)
    source.emit('checking-for-update')
    source.emit('update-available', RELEASE)
    source.emit('error', new Error('net::ERR_CONNECTION_RESET'))
    expect(updater.state()).toEqual({ status: 'available', update: UPDATE })
    updater.download()
    source.emit('error', new Error('net::ERR_CONNECTION_RESET'))
    expect(updater.state()).toMatchObject({ status: 'error', update: UPDATE })
    updater.download()
    expect(source.downloads).toBe(2)
    expect(updater.state()).toMatchObject({ status: 'downloading', percent: 0 })
  })

  it('does not look again while a downloaded release waits for its restart', () => {
    const { source, updater } = setup()
    updater.check(false)
    source.emit('checking-for-update')
    source.emit('update-available', RELEASE)
    source.emit('update-downloaded', RELEASE)
    updater.check(true)
    expect(source.checks).toBe(1)
  })

  it('does nothing when asked for a step the state does not offer', () => {
    const { source, states, updater } = setup()
    updater.download()
    updater.install()
    expect(source.downloads).toBe(0)
    expect(source.installs).toBe(0)
    expect(states).toEqual([])
  })

  it('hears the system refuse a release after the download', () => {
    // On macOS the release is verified only after the updater calls it downloaded.
    const refusal = new Error('Cannot update while running on a read-only volume.')
    const quiet = setup()
    quiet.updater.check(false)
    quiet.source.emit('checking-for-update')
    quiet.source.emit('update-available', RELEASE)
    quiet.source.emit('update-downloaded', RELEASE)
    quiet.source.emit('error', refusal)
    expect(quiet.updater.state()).toEqual({ status: 'available', update: UPDATE })

    const asked = setup()
    asked.updater.check(true)
    asked.source.emit('checking-for-update')
    asked.source.emit('update-available', RELEASE)
    asked.source.emit('update-downloaded', RELEASE)
    asked.source.emit('error', refusal)
    expect(asked.updater.state()).toMatchObject({ status: 'error', update: UPDATE })
    expect(asked.updater.state()).toHaveProperty('message', expect.stringMatching(/Applications/))
  })

  it('hears a failure while it waits for the restart to begin', () => {
    const { source, updater } = setup()
    updater.check(false)
    source.emit('checking-for-update')
    source.emit('update-available', RELEASE)
    source.emit('update-downloaded', RELEASE)
    updater.install()
    // The download began on its own, but the restart was asked for: its failure is shown.
    source.emit('error', new Error('Could not get code signature for running application'))
    expect(updater.state()).toMatchObject({ status: 'error', update: UPDATE })
  })

  it('keeps the clock running when told the same mode again', () => {
    const { source, updater } = setup()
    updater.follow('auto')
    vi.advanceTimersByTime(10_000)
    // Any preference change tells the updater its mode again; the first look is not put off.
    updater.follow('auto')
    vi.advanceTimersByTime(5_000)
    expect(source.checks).toBe(1)
  })

  it('reports a restart that could not begin', () => {
    const { source, updater } = setup((fake) => {
      fake.refuses = new Error('The installer could not be started.')
    })
    updater.check(false)
    source.emit('checking-for-update')
    source.emit('update-available', RELEASE)
    source.emit('update-downloaded', RELEASE)
    updater.install()
    expect(updater.state()).toMatchObject({ status: 'error', update: UPDATE })
  })
})
