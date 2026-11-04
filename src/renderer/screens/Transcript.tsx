/** One sample's transcript: every step with its tool, arguments, result and timing. */
import type { TranscriptEvent, TranscriptKind } from '@domain/schemas.ts'
import { api } from '../api.ts'
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
    <div className="screen">
      <div className="toolbar">
        <label className="picker">
          <span className="sr-only">Sample</span>
          <select
            value={current ? current.key : ''}
            onChange={(e) => {
              const o = withTranscript.find((x) => x.key === e.target.value)
              if (o) go('transcript', { run: o.run.name, sample: o.sample.name })
            }}
          >
            <option value="">Pick a sample</option>
            {withTranscript.map((o) => (
              <option key={o.key} value={o.key}>
                {runLabel(o.run)} · {o.caseId}
                {sampleTail(o)}
                {` · ${runStamp(o.run)}`}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="seg filters" aria-label="Show steps">
          {KINDS.map((k) => (
            <button key={k} type="button" aria-pressed={kinds.has(k)} onClick={() => toggle(k)}>
              {capital(k)}
            </button>
          ))}
        </fieldset>
      </div>
      {!current ? (
        <div className="empty">
          <h2>{withTranscript.length ? 'Pick a sample' : 'No transcripts yet'}</h2>
          <p className="help">
            A transcript lists every step an agent took while writing one sample: what it read, what
            it ran and how long each took.
          </p>
        </div>
      ) : (
        <section className="section">
          <p className="help">
            {meta
              ? `${meta.model ?? current.run.meta?.writer.model ?? ''} · ${meta.seconds}s wall, ${seconds(toolTime)} in tools · ${meta.toolCalls} tool calls · ${meta.tokens ? `${meta.tokens.input.toLocaleString()} in, ${meta.tokens.output.toLocaleString()} out` : 'no token count'}${meta.costUsd !== null ? ` · ${money(meta.costUsd)}` : ''}${meta.error ? ` · ${meta.error}` : ''}`
              : state.skill.name}
          </p>
          {events.error ? <p className="help">{events.error}</p> : null}
          <ol className="transcript">
            {list.map((e) => (
              <li key={e.step} className={`event ${e.kind}${e.error ? ' is-error' : ''}`}>
                <span className="at">{seconds(e.at)}</span>
                <span className="kind">{e.kind}</span>
                <span className="body">
                  {e.tool ? <b>{e.tool} </b> : null}
                  {e.kind === 'tool' ? <code>{short(e.args)}</code> : null}
                  {e.kind === 'result' ? (
                    <>
                      <span className="muted">{short(e.result)}</span>
                      {e.durationMs !== undefined ? (
                        <small className="muted"> {seconds(e.durationMs)}</small>
                      ) : null}
                    </>
                  ) : null}
                  {e.text ? <span className="text">{short(e.text)}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
