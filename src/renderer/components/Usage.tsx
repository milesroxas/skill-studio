/**
 * What the assistant has spent: requests and tokens today and over the last
 * 30 days, by model, with a way out to each provider's own page for the bill
 * or the plan's limits. The counts are this app's; the provider's page is the
 * record.
 */
import {
  AI_PROVIDERS,
  compactCount,
  USAGE_DAYS,
  type UsageSummary,
  type UsageTotals,
} from '@domain/ai.ts'
import { ChartNoAxesColumnIcon } from 'lucide-react'
import { useAi } from '../ai.ts'
import { api } from '../api.ts'
import { useFetch } from '../hooks.ts'
import { plural } from '../model.ts'
import { Loading, ReadFailed } from './layout.tsx'
import { Text } from './text.tsx'
import { Button } from './ui/button.tsx'
import {
  Popover,
  PopoverContent,
  PopoverLabel,
  PopoverSection,
  PopoverTrigger,
} from './ui/popover.tsx'

const tokens = (totals: UsageTotals): string =>
  `${compactCount(totals.input)} in · ${compactCount(totals.output)} out`

/** One row: what was counted and how many requests, then the tokens they read and wrote. */
function Line({ label, sub, totals }: { label: string; sub?: string; totals: UsageTotals }) {
  return (
    <div className="flex items-baseline gap-3 px-2 py-1.5 text-ui">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate" title={label}>
          {label}
        </span>
        <Text size="xs" tone="muted" truncate>
          {sub ? `${sub} · ` : ''}
          {plural(totals.requests, 'request')}
        </Text>
      </span>
      <Text size="xs" tabular className="shrink-0">
        {tokens(totals)}
      </Text>
    </div>
  )
}

function UsageReport({ summary }: { summary: UsageSummary }) {
  const { providers } = useAi()
  const connected = (providers ?? []).filter((p) => p.connected)
  return (
    <>
      <PopoverSection>
        <Line label="Today" totals={summary.today} />
        <Line label={`Last ${USAGE_DAYS} days`} totals={summary.month} />
      </PopoverSection>
      {summary.models.length ? (
        <PopoverSection scroll>
          <PopoverLabel>By model, last {USAGE_DAYS} days</PopoverLabel>
          {summary.models.map((row) => (
            <Line
              key={`${row.provider}:${row.model}`}
              label={row.model}
              sub={AI_PROVIDERS[row.provider].label}
              totals={row}
            />
          ))}
        </PopoverSection>
      ) : null}
      {connected.length ? (
        <PopoverSection>
          <PopoverLabel>Bills and plan limits</PopoverLabel>
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-2 pb-1.5">
            {connected.map((p) => {
              const { label, usageUrl } = AI_PROVIDERS[p.id]
              return usageUrl ? (
                <Button
                  key={p.id}
                  type="button"
                  variant="link-muted"
                  size="inline-sm"
                  onClick={() => api.openExternal(usageUrl)}
                >
                  {label}
                </Button>
              ) : null
            })}
          </div>
        </PopoverSection>
      ) : null}
    </>
  )
}

function UsageLoader() {
  const { data, error, loading, reload } = useFetch(() => api.aiUsage(), [])
  if (error && !data)
    return (
      <ReadFailed
        size="compact"
        title="Could not read the usage"
        retrying={loading}
        onRetry={reload}
      >
        {error}
      </ReadFailed>
    )
  return data ? <UsageReport summary={data} /> : <Loading />
}

/** The assistant's usage, one click away. It reads the log each time it opens. */
export function UsageButton() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Usage" title="Usage">
          <ChartNoAxesColumnIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" size="menu">
        <UsageLoader />
      </PopoverContent>
    </Popover>
  )
}
