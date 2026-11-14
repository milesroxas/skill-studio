/**
 * How much of the lift above it is checked on the skill as it is now, at the
 * foot of All cases' head. While a case is behind it is a band of the filled
 * button's ink across the column, square to it, with the one step that checks
 * the rest; once every case is checked it is one plain line. The band shows
 * only while it has something to ask, so it is seen when it comes.
 */
import { plural } from '../model.ts'
import { Text } from './text.tsx'
import { Button } from './ui/button.tsx'

/** What the band's button runs: the cases behind, counted against the ones checked. */
const runLabel = (behind: number, checked: number, version: string): string =>
  checked === 0
    ? behind === 1
      ? `Run it on ${version}`
      : `Run all ${behind} on ${version}`
    : behind === 1
      ? `Run the other case on ${version}`
      : `Run the other ${behind} on ${version}`

export function Coverage({
  checked,
  total,
  version,
  scored,
  onRun,
}: {
  /** How many of the skill's cases have a score on `version`. */
  checked: number
  /** How many cases the skill has. */
  total: number
  /** The version a run would test now. */
  version: string
  /** A case behind has a score from an earlier version: the one thing the band warns of. */
  scored: boolean
  /** Open Run on the cases behind. */
  onRun: () => void
}) {
  const behind = total - checked
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
          {checked === 0
            ? `No case has run on ${version} yet.`
            : `${checked} of ${plural(total, 'case')} checked on ${version}.`}
        </Text>
        {scored ? (
          <span className="text-primary-foreground/70">
            {' '}
            Scores from earlier versions may no longer hold.
          </span>
        ) : null}
      </Text>
      <Button type="button" variant="inverse" size="sm" onClick={onRun}>
        {runLabel(behind, checked, version)}
      </Button>
    </div>
  )
}
