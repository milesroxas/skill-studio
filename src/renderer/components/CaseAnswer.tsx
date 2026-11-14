/**
 * The last answer to a case, beside the form that asks for it: a good answer
 * and its checks are easier to write with a real answer in view. It is the
 * answer Results opens the case on, with its score and what its run cost.
 */
import type { BenchConfig } from '@domain/schemas.ts'
import { type AttemptCost, duration, money, type Output, runTitle, totalOf } from '../model.ts'
import { usePageSize } from '../stage.ts'
import { ArtifactView } from './Artifact.tsx'
import { SplitSection, Toolbar } from './layout.tsx'
import { TotalChip } from './Scores.tsx'
import { Hint, Text } from './text.tsx'
import { Button } from './ui/button.tsx'

export function LastAnswer({
  output,
  cost,
  config,
  size,
  stale,
  onCompare,
}: {
  /** Null for a case not run yet. */
  output: Output | null
  cost: AttemptCost | null
  config: BenchConfig
  /** The size the case asks of a page, which it is shown at. */
  size: [number, number] | null
  /** The prompt or the files have changed since, and the change is not saved yet. */
  stale: boolean
  onCompare: () => void
}) {
  const page = usePageSize(size)
  const facts = output
    ? [
        runTitle(output.run, { short: true }),
        ...(cost ? [cost.model, money(cost.usd), duration(cost.seconds)] : []),
      ].join(' · ')
    : null
  return (
    <SplitSection aria-label="Last answer">
      <div className="flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1">
        <Text caps tone="muted">
          Last answer
        </Text>
        {facts ? (
          <Text size="xs" tone="muted" tabular>
            {facts}
          </Text>
        ) : null}
        {output ? (
          <span className="ml-auto">
            <TotalChip total={totalOf(output, config)} />
          </span>
        ) : null}
      </div>
      {output ? (
        <>
          {stale ? <Hint>Written before you changed the prompt or files.</Hint> : null}
          <figure
            className={
              output.primary?.kind === 'markdown'
                ? 'm-0 overflow-hidden rounded-md border bg-card px-5 py-4'
                : 'm-0 overflow-hidden rounded-md border bg-card'
            }
          >
            <ArtifactView
              run={output.run.name}
              sample={output.sample.name}
              artifact={output.primary}
              page={page}
            />
          </figure>
          <Toolbar>
            <Button type="button" variant="outline" size="sm" onClick={onCompare}>
              Compare in Results
            </Button>
          </Toolbar>
        </>
      ) : (
        <Hint>After a run, the answer shows here to write checks against.</Hint>
      )}
    </SplitSection>
  )
}
