/**
 * The steps an agent took on one output: what it read, what it ran, what it
 * said, and how long each took. Read it when a score surprises you: did the
 * agent read the skill at all? Loaded when asked for, since most outputs are
 * read without it.
 */
import type { SampleMeta, TranscriptKind } from '@domain/schemas.ts'
import { useMemo } from 'react'
import { api } from '../api.ts'
import { useFetch, useToggleSet } from '../hooks.ts'
import { capital, money } from '../model.ts'
import { EmptyState, Loading, ReadFailed, Rows } from './layout.tsx'
import { FilterGroup } from './Segmented.tsx'
import { TranscriptEvent } from './TranscriptEvent.tsx'
import { Code, Hint, Text } from './text.tsx'

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`
const KINDS: TranscriptKind[] = ['system', 'text', 'thinking', 'tool', 'result', 'error']

export function TranscriptList({
  run,
  sample,
  root,
  meta,
}: {
  run: string
  sample: string
  /** The sample's own folder: a path inside it reads as ./outputs/... */
  root: string
  /** What the run recorded about this sample: its time, cost and tokens. */
  meta: SampleMeta | null
}) {
  const [kinds, toggle] = useToggleSet(KINDS)
  const key = `${run}/${sample}`
  const events = useFetch(() => api.transcript(run, sample).then((list) => ({ key, list })), [key])
  // The last transcript stays in hand while the next loads; never show it under the new name.
  const loaded = events.data?.key === key ? events.data.list : null
  // Every path is shortened once per transcript, not on each render: a long one has hundreds of steps.
  const steps = useMemo(() => {
    const short = (text: string | undefined) =>
      root && text ? text.split(`${root}/`).join('./').split(root).join('.') : (text ?? '')
    return (loaded ?? []).map((e) => ({
      ...e,
      args: short(e.args),
      result: short(e.result),
      text: short(e.text),
    }))
  }, [loaded, root])
  const list = steps.filter((e) => kinds.has(e.kind))
  const toolTime = (loaded ?? []).reduce((s, e) => s + (e.durationMs ?? 0), 0)

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <FilterGroup
        aria-label="Show steps"
        values={kinds}
        onToggle={toggle}
        options={KINDS.map((k) => ({ value: k, label: capital(k) }))}
      />
      {meta ? (
        <Hint tabular>
          {[
            meta.model,
            `${meta.seconds}s, ${seconds(toolTime)} of it in tools`,
            `${meta.toolCalls} tool calls`,
            meta.tokens
              ? `${meta.tokens.input.toLocaleString()} tokens in, ${meta.tokens.output.toLocaleString()} out`
              : null,
            meta.costUsd === null ? null : money(meta.costUsd),
            meta.error,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Hint>
      ) : null}
      {loaded ? null : events.error ? (
        <ReadFailed
          size="compact"
          title="Could not read the transcript"
          retrying={events.loading}
          onRetry={events.reload}
        >
          {events.error}
        </ReadFailed>
      ) : (
        <Loading />
      )}
      {!loaded ? null : list.length ? (
        <Rows>
          {list.map((e) => (
            <TranscriptEvent
              key={e.step}
              kind={e.kind}
              failed={Boolean(e.error)}
              at={seconds(e.at)}
            >
              {e.tool ? <b>{e.tool} </b> : null}
              {e.kind === 'tool' ? <Code>{e.args}</Code> : null}
              {e.kind === 'result' ? (
                <>
                  <Text tone="muted">{e.result}</Text>
                  {e.durationMs !== undefined ? (
                    <Text tone="muted" size="xs">
                      {' '}
                      {seconds(e.durationMs)}
                    </Text>
                  ) : null}
                </>
              ) : null}
              {e.text ? (
                <Text wrap="pre" tone={e.kind === 'thinking' ? 'muted' : 'default'}>
                  {e.text}
                </Text>
              ) : null}
            </TranscriptEvent>
          ))}
        </Rows>
      ) : (
        <EmptyState size="compact">
          {loaded.length
            ? 'No steps of the kinds shown. Turn more on above.'
            : 'This transcript has no steps.'}
        </EmptyState>
      )}
    </div>
  )
}
