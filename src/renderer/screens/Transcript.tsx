/** One sample's transcript: every step with its tool, arguments, result and timing. */
import type { TranscriptEvent, TranscriptKind } from '@domain/schemas.ts'
import { cva } from 'class-variance-authority'
import { api } from '../api.ts'
import { EmptyState, Screen, Section, Toolbar } from '../components/layout.tsx'
import { FilterGroup } from '../components/Segmented.tsx'
import { SelectBox } from '../components/SelectBox.tsx'
import { Code, Hint, Text } from '../components/text.tsx'
import type { Ctx } from '../ctx.ts'
import { useFetch, useToggleSet } from '../hooks.ts'
import { capital, money, runLabel, runStamp, sampleTail } from '../model.ts'

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`
const KINDS: TranscriptKind[] = ['system', 'text', 'thinking', 'tool', 'result', 'error']

export function Transcript({ ctx }: { ctx: Ctx }) {
  const { state, outputs, route, go } = ctx
  const run = route.params.get('run') ?? ''
  const sample = route.params.get('sample') ?? ''
  const [kinds, toggle] = useToggleSet(KINDS)
  const withTranscript = outputs.filter((o) => o.sample.hasTranscript)
  const current = withTranscript.find((o) => o.run.name === run && o.sample.name === sample) ?? null
  const events = useFetch(
    () => (run && sample ? api.transcript(run, sample) : Promise.resolve<TranscriptEvent[]>([])),
    [run, sample],
  )
  const meta = current?.run.meta?.samples.find((s) => s.dir === sample)
  const list = (events.data ?? []).filter((e) => kinds.has(e.kind))
  // Paths inside the sample directory read as ./outputs/... instead of the full absolute path.
  const root = current?.sample.path ?? ''
  const short = (text: string | undefined) =>
    root && text ? text.split(`${root}/`).join('./').split(root).join('.') : (text ?? '')
  const toolTime = (events.data ?? []).reduce((s, e) => s + (e.durationMs ?? 0), 0)

  return (
    <Screen>
      <Toolbar>
        <SelectBox
          aria-label="Sample"
          width="wide"
          value={current ? current.key : ''}
          placeholder="Pick a sample"
          onChange={(key) => {
            const o = withTranscript.find((x) => x.key === key)
            if (o) go('transcript', { run: o.run.name, sample: o.sample.name })
          }}
          options={withTranscript.map((o) => ({
            value: o.key,
            label: `${runLabel(o.run)} · ${o.caseId}${sampleTail(o)} · ${runStamp(o.run)}`,
          }))}
        />
        <FilterGroup
          aria-label="Show steps"
          values={kinds}
          onToggle={toggle}
          options={KINDS.map((k) => ({ value: k, label: capital(k) }))}
        />
      </Toolbar>
      {!current ? (
        <EmptyState title={withTranscript.length ? 'Pick a sample' : 'No transcripts yet'}>
          A transcript lists every step an agent took while writing one sample: what it read, what
          it ran and how long each took.
        </EmptyState>
      ) : (
        <Section>
          <Hint>
            {meta
              ? `${meta.model ?? current.run.meta?.writer.model ?? ''} · ${meta.seconds}s wall, ${seconds(toolTime)} in tools · ${meta.toolCalls} tool calls · ${meta.tokens ? `${meta.tokens.input.toLocaleString()} in, ${meta.tokens.output.toLocaleString()} out` : 'no token count'}${meta.costUsd !== null ? ` · ${money(meta.costUsd)}` : ''}${meta.error ? ` · ${meta.error}` : ''}`
              : state.skill.name}
          </Hint>
          {events.error ? <Hint>{events.error}</Hint> : null}
          <EventList>
            {list.map((e) => (
              <Event key={e.step} kind={e.kind} failed={Boolean(e.error)} at={seconds(e.at)}>
                {e.tool ? <b>{e.tool} </b> : null}
                {e.kind === 'tool' ? <Code>{short(e.args)}</Code> : null}
                {e.kind === 'result' ? (
                  <>
                    <Text tone="muted">{short(e.result)}</Text>
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
                    {short(e.text)}
                  </Text>
                ) : null}
              </Event>
            ))}
          </EventList>
        </Section>
      )}
    </Screen>
  )
}

const eventVariants = cva(
  'grid grid-cols-[44px_minmax(0,1fr)] gap-3 border-b px-3.5 py-1.5 text-xs last:border-b-0 md:grid-cols-[52px_60px_minmax(0,1fr)]',
  {
    variants: {
      kind: {
        system: '',
        text: '',
        thinking: '',
        tool: 'bg-muted',
        result: '',
        error: 'bg-destructive/10 dark:bg-destructive/20',
      },
      failed: {
        true: 'bg-destructive/10 dark:bg-destructive/20',
        false: '',
      },
    },
    defaultVariants: { failed: false },
  },
)

function EventList({ children }: { children: React.ReactNode }) {
  return <ol className="m-0 overflow-hidden rounded-lg border bg-card p-0">{children}</ol>
}

/** One step: when, what kind, and the body. On narrow screens the body drops under the time. */
function Event({
  kind,
  failed,
  at,
  children,
}: {
  kind: TranscriptKind
  failed: boolean
  at: string
  children: React.ReactNode
}) {
  return (
    <li className={eventVariants({ kind, failed })}>
      <Text tone="muted" tabular align="end">
        {at}
      </Text>
      <Text tone="muted" className="max-md:hidden">
        {kind}
      </Text>
      <span className="min-w-0 break-words max-md:col-span-full">{children}</span>
    </li>
  )
}
