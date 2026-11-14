/**
 * How much of the lift above it is checked on the skill as it is now, at the
 * foot of All cases' head. While a case is behind it is a band of the filled
 * button's ink across the column, square to it, with the one step that checks
 * the rest; once every case is checked it is one plain line. The band shows
 * only while it has something to ask, so it is seen when it comes.
 *
 * A case whose run on this version only waits to be graded needs no run. The
 * band says how many wait, its button runs the others, and once only those
 * are left the button grades them.
 */
import { plural } from '../model.ts'
import { Text } from './text.tsx'
import { Button } from './ui/button.tsx'

/** What the band's button runs: the cases with no run on the version, counted against the ones that have one. */
const runLabel = (unrun: number, ran: number, version: string): string =>
  ran === 0
    ? unrun === 1
      ? `Run it on ${version}`
      : `Run all ${unrun} on ${version}`
    : unrun === 1
      ? `Run the other case on ${version}`
      : `Run the other ${unrun} on ${version}`

export function Coverage({
  checked,
  total,
  version,
  scored,
  onRun,
  ungraded,
}: {
  /** How many of the skill's cases have a score on `version`. */
  checked: number
  /** How many cases the skill has. */
  total: number
  /** The version a run would test now. */
  version: string
  /** A case behind has a score from an earlier version: the one thing the band warns of. */
  scored: boolean
  /** Open Run on the cases behind that have no run on `version`. */
  onRun: () => void
  /** The cases behind whose run on `version` only waits to be graded, and the step that grades them. */
  ungraded: {
    cases: number
    /** How many runs those cases wait on. */
    runs: number
    /** A grade of each of those runs is being started, or is still going. */
    busy: boolean
    /** A grade of some run is being started: one start at a time. */
    waiting: boolean
    start: () => void
  }
}) {
  const behind = total - checked
  const unrun = behind - ungraded.cases
  if (!behind)
    return (
      <Text as="p" size="ui" tone="muted" tabular className="pb-5">
        <Text tone="default" weight="medium">
          {total === 1 ? 'The case' : `All ${total} cases`}
        </Text>{' '}
        {total === 1 ? 'is' : 'are'} checked on {version}.
      </Text>
    )
  return (
    <div
      data-slot="band"
      // The keyboard's line is the ring's color, which is the band's own: here it takes the band's text.
      className="-mx-6 flex flex-wrap items-center gap-x-5 gap-y-2 bg-primary px-6 py-3.5 text-primary-foreground [--ring:var(--primary-foreground)]"
    >
      <Text as="p" size="ui" tabular className="min-w-0 flex-1 basis-64 text-pretty">
        <Text weight="medium">
          {checked > 0
            ? `${checked} of ${plural(total, 'case')} checked on ${version}.`
            : ungraded.cases
              ? `No case has a score on ${version} yet.`
              : `No case has run on ${version} yet.`}
        </Text>
        {/* One thing said after the count: what waits on a grading, else what an old score is worth. */}
        {ungraded.cases || scored ? (
          <span className="text-primary-foreground/70">
            {' '}
            {ungraded.cases
              ? `${ungraded.cases} ${ungraded.cases === 1 ? 'is' : 'are'} waiting to be graded.`
              : 'Scores from earlier versions may no longer hold.'}
          </span>
        ) : null}
      </Text>
      {unrun ? (
        <Button type="button" variant="inverse" size="sm" onClick={onRun}>
          {runLabel(unrun, total - unrun, version)}
        </Button>
      ) : (
        <Button
          type="button"
          variant="inverse"
          size="sm"
          disabled={ungraded.waiting}
          busy={ungraded.busy}
          busyLabel="Grading…"
          onClick={ungraded.start}
        >
          {`Grade ${plural(ungraded.runs, 'run')}`}
        </Button>
      )}
    </div>
  )
}
