/**
 * What changed in each release, in a window of its own. At its head, where the
 * app's updates stand and the one step that moves them on: the same step the
 * sidebar offers, with room to say more. Under it, every release with its
 * number, its day and its notes, newest first.
 *
 * The notes come from CHANGELOG.md, built into the app, so they read offline
 * and always match the copy running. An update that is not installed yet
 * brings its own entry with it and stands above the rest.
 */
import { type Release, releasesOf } from '@domain/changelog.ts'
import { type UpdateState, type UpdateStep, updateIn } from '@domain/update.ts'
import { useMemo } from 'react'
import changelog from '../../../CHANGELOG.md?raw'
import { api } from '../api.ts'
import { Spacer } from '../components/layout.tsx'
import { Prose } from '../components/Prose.tsx'
import { StatusLine } from '../components/StatusLine.tsx'
import { Heading, Hint, Link, Text } from '../components/text.tsx'
import { ProgressLine } from '../components/Update.tsx'
import { Button } from '../components/ui/button.tsx'
import type { Notice } from '../hooks.ts'
import { cn } from '../lib/utils.ts'
import { useArrived } from '../motion.ts'
import { APP_VERSION, offerOf, RELEASES_URL, releaseUrl, useUpdate } from '../updates.ts'

const TITLE = 'What’s New'

/** The window's one column: a reading width, in the middle when the window is pulled wider. */
const COLUMN = 'mx-auto w-full max-w-140'

/** A changelog's day has no time of day, so it is read as written, not shifted into the reader's zone. */
const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/
const formatDay = (date: string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'long',
    ...(DAY_ONLY.test(date) ? { timeZone: 'UTC' } : {}),
  }).format(new Date(date))

const formatTime = (at: number): string =>
  new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(at)

interface Standing {
  title: string
  detail: string | null
  /** The detail reports a failure. */
  failed?: boolean
}

/** Where the updates stand, in a line and the line under it. */
function standingOf(state: UpdateState): Standing {
  switch (state.status) {
    case 'unsupported':
      return {
        title: 'This copy does not update itself',
        detail: 'New versions are on the releases page.',
      }
    case 'idle':
      return state.checkedAt === null
        ? { title: `Skill Studio ${APP_VERSION}`, detail: 'Not checked for a newer version yet.' }
        : {
            title: 'Skill Studio is up to date',
            detail: `${APP_VERSION} is the newest version. Checked at ${formatTime(state.checkedAt)}.`,
          }
    case 'checking':
      return { title: 'Checking for updates…', detail: null }
    case 'available':
      return {
        title: `Version ${state.update.version} is available`,
        detail: `You have ${APP_VERSION}.`,
      }
    case 'downloading':
      return {
        title: `Downloading version ${state.update.version}`,
        detail: `${Math.round(state.percent)}% done. Keep working: it downloads in the background.`,
      }
    case 'ready':
      return {
        title: `Version ${state.update.version} is ready to install`,
        detail: 'Restart Skill Studio to finish. It is back in a moment.',
      }
    case 'installing':
      return { title: 'Restarting to update…', detail: null }
    case 'error':
      return {
        title: state.update ? 'The update did not go through' : 'Could not check for updates',
        detail: state.message,
        failed: true,
      }
  }
}

/**
 * The updates in one band: where they stand, and the step in hand at its end.
 * The step that installs something is the default button; looking again is outline.
 * The band stays at the head of the window while the notes scroll under it, so
 * the step is in reach from any release. Its ground runs the window's width,
 * over the margin the notes hang their bullets in; its rules keep to the column.
 */
function UpdateBand({ state, onStep }: { state: UpdateState; onStep: (step: UpdateStep) => void }) {
  const arrived = useArrived(state.status)
  const { title, detail, failed } = standingOf(state)
  const offer = offerOf(state)
  const downloading = state.status === 'downloading'
  return (
    <section aria-label="Updates" className="sticky top-0 z-1 -mx-8 bg-background px-8">
      <div className={cn(COLUMN, 'relative flex min-h-18 items-center gap-4 border-y py-3.5')}>
        {/* The status region stays mounted so a change in it is read out; the percentage is not in it. */}
        <div role="status" className="flex min-w-0 flex-1 flex-col">
          <div
            key={state.status}
            className={cn(
              'flex flex-col gap-0.5',
              arrived && 'animate-in duration-200 ease-out-strong fade-in-0 slide-in-from-bottom-1',
            )}
          >
            <Text as="p" weight="medium">
              {title}
            </Text>
            {detail ? (
              <Hint
                tone={failed ? 'destructive' : 'default'}
                tabular
                aria-live={downloading ? 'off' : undefined}
              >
                {detail}
              </Hint>
            ) : null}
          </div>
        </div>
        {offer ? (
          <Button
            type="button"
            size="sm"
            variant={offer.step === 'check' ? 'outline' : 'default'}
            onClick={() => onStep(offer.step)}
          >
            {offer.label}
          </Button>
        ) : state.status === 'unsupported' ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => api.openExternal(RELEASES_URL)}
          >
            Open releases
          </Button>
        ) : null}
        <ProgressLine
          percent={downloading ? state.percent : state.status === 'available' ? 0 : 100}
          active={downloading}
        />
      </div>
    </section>
  )
}

interface Entry extends Release {
  /** `new`: not installed yet. `installed`: the version running. */
  mark: 'new' | 'installed' | null
}

/** The releases the app was built with, under the update in hand when it is not among them. */
function entriesOf(bundled: Release[], state: UpdateState): Entry[] {
  const incoming = updateIn(state)
  const known = bundled.map(
    (release): Entry => ({
      ...release,
      mark: release.version === APP_VERSION ? 'installed' : null,
    }),
  )
  if (!incoming || bundled.some((release) => release.version === incoming.version)) return known
  return [
    { version: incoming.version, date: incoming.date, notes: incoming.notes ?? '', mark: 'new' },
    ...known,
  ]
}

function ReleaseEntry({ entry, arrived }: { entry: Entry; arrived: boolean }) {
  return (
    <li
      className={cn(
        'flex flex-col gap-3 border-b py-6 last:border-b-0',
        arrived && 'animate-in duration-300 ease-out-strong fade-in-0 slide-in-from-top-2',
      )}
    >
      {/* The mark is a word beside the number, not a pill: the band above already carries the one filled shape. */}
      <header className="flex items-baseline gap-2">
        <Heading level={2} tabular>
          {entry.version}
        </Heading>
        {entry.mark ? (
          <Text size="xs" tone="muted">
            {entry.mark === 'new' ? 'New' : 'Installed'}
          </Text>
        ) : null}
        <Spacer />
        {entry.date ? (
          <Text as="p" size="xs" tone="muted">
            <time dateTime={entry.date}>{formatDay(entry.date)}</time>
          </Text>
        ) : null}
      </header>
      {entry.notes ? (
        <Prose text={entry.notes} density="notes" />
      ) : (
        <Hint>
          This release came without notes the app can show.{' '}
          <Link href={releaseUrl(entry.version)}>Read about it on GitHub</Link>.
        </Hint>
      )}
    </li>
  )
}

export function Changelog({
  onStep,
  notice,
  onDismiss,
}: {
  onStep: (step: UpdateStep) => void
  notice: Notice | null
  onDismiss: () => void
}) {
  const state = useUpdate()
  const bundled = useMemo(() => releasesOf(changelog), [])
  const entries = entriesOf(bundled, state)
  // The update's own entry slides in when a check finds it while the window is open.
  const incoming = entries[0]?.mark === 'new' ? entries[0].version : ''
  const arrived = useArrived(incoming)
  return (
    <div data-platform={api.platform} className="flex h-dvh flex-col overflow-hidden bg-background">
      {/* macOS hides the title bar: this strip moves the window and names it. Elsewhere the title bar does. */}
      <header
        data-drag
        className="hidden h-12 shrink-0 items-center justify-center in-data-[platform=darwin]:flex"
      >
        {/* The heading below names the page for a screen reader; this one is for the eye. */}
        <Text size="ui" weight="medium" tone="muted" aria-hidden="true">
          {TITLE}
        </Text>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-8 pt-6 pb-8 [scrollbar-gutter:stable_both-edges] in-data-[platform=darwin]:pt-0">
        <h1 className="sr-only">{TITLE} in Skill Studio</h1>
        <UpdateBand state={state} onStep={onStep} />
        <div className={COLUMN}>
          <ol className="m-0 flex list-none flex-col p-0">
            {entries.map((entry) => (
              <ReleaseEntry
                key={entry.version}
                entry={entry}
                arrived={arrived && entry.mark === 'new'}
              />
            ))}
          </ol>
          <Hint measure="none" className="border-t pt-5">
            Every release, with its downloads, is on <Link href={RELEASES_URL}>GitHub</Link>.
          </Hint>
        </div>
      </main>
      <StatusLine notice={notice} onDismiss={onDismiss} />
    </div>
  )
}
