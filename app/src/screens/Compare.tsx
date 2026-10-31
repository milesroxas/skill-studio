/** Two outputs side by side: scores, the artifacts, a word diff, votes and the leaderboard. */
import type { Rating } from '@core/bradley-terry.ts'
import type { Vote } from '@core/schemas.ts'
import { copyOf } from '@core/text.ts'
import { useEffect, useState } from 'react'
import { api } from '../api.ts'
import { ArtifactPicker, ArtifactView } from '../components/Artifact.tsx'
import { Delta, Flags, Layers, TotalChip } from '../components/Scores.tsx'
import type { Ctx } from '../ctx.ts'
import { wordDiffHtml } from '../diff.ts'
import { useFetch } from '../hooks.ts'
import {
  caseTitle,
  configurationTail,
  layersOf,
  type Output,
  outputByKey,
  outputLine,
  primaryOf,
  runName,
  runStamp,
  sampleTail,
  scoreOf,
  sizeLine,
  totalOf,
  versionName,
  writerName,
} from '../model.ts'

const VOTES: Vote[] = ['a', 'tie', 'b']

/** With no pair in the URL, open the first graded output against another sample of its case. */
function defaultPair(outputs: Output[]): [Output | null, Output | null] {
  const graded = outputs.filter((o) => o.result)
  for (const a of graded) {
    const b = graded.find((o) => o.caseId === a.caseId && o.key !== a.key)
    if (b) return [a, b]
  }
  return [graded[0] ?? outputs[0] ?? null, null]
}

export function Compare({ ctx }: { ctx: Ctx }) {
  const { state, config, outputs, route, go, toast, reload } = ctx
  const pinned = route.params.has('a') || route.params.has('b')
  const [fallbackA, fallbackB] = pinned ? [null, null] : defaultPair(outputs)
  const a = pinned ? outputByKey(outputs, route.params.get('a')) : fallbackA
  const b = pinned ? outputByKey(outputs, route.params.get('b')) : fallbackB
  const [diff, setDiff] = useState(false)
  const [criterion, setCriterion] = useState('overall')
  const board = useFetch(() => api.leaderboard(), [state])
  const layers = layersOf(config)
  // Both keys always go in the URL, so an empty B stays empty instead of falling back.
  const set = (slot: 'a' | 'b', key: string) =>
    go('compare', {
      a: slot === 'a' ? key : (a?.key ?? ''),
      b: slot === 'b' ? key : (b?.key ?? ''),
    })
  const name = criterion.trim() || 'overall'

  const human =
    a && b
      ? state.reviews.preferences.find(
          (p) => p.by === 'human' && p.criterion === name && sameTwo(p.a, p.b, a.key, b.key),
        )
      : null
  const humanVote: Vote | null = human ? (human.a === a?.key ? human.vote : flip(human.vote)) : null
  const jevVotes =
    a && b
      ? state.reviews.preferences.filter((p) => p.by === 'jev' && sameTwo(p.a, p.b, a.key, b.key))
      : []

  const vote = async (v: Vote) => {
    if (!a || !b) return
    try {
      await api.preference(a.key, b.key, name, v)
      toast('Vote saved')
      reload()
    } catch (e) {
      toast((e as Error).message)
    }
  }
  const askJev = async () => {
    if (!a || !b) return
    try {
      await api.pairwise(a.key, b.key, [name])
      toast('Jev is voting')
    } catch (e) {
      toast((e as Error).message)
    }
  }
  const boards = board.data ? Object.entries(board.data.boards) : []
  const sameCase = !a || !b || a.caseId === b.caseId

  if (!outputs.length)
    return (
      <div className="empty">
        <h2>Nothing to compare yet</h2>
        <p className="help">Compare reads two outputs side by side. Generate a run first.</p>
        <div className="actions">
          <button type="button" className="primary" onClick={() => go('generate')}>
            Open Generate
          </button>
        </div>
      </div>
    )

  return (
    <div className="screen">
      <div className="toolbar">
        <Picker label="A" outputs={outputs} value={a} onChange={(k) => set('a', k)} ctx={ctx} />
        <Picker label="B" outputs={outputs} value={b} onChange={(k) => set('b', k)} ctx={ctx} />
        {a && b ? (
          <>
            <fieldset className="seg" aria-label="View">
              <button type="button" aria-pressed={!diff} onClick={() => setDiff(false)}>
                Side by side
              </button>
              <button type="button" aria-pressed={diff} onClick={() => setDiff(true)}>
                Word diff
              </button>
            </fieldset>
            <button type="button" onClick={() => go('compare', { a: b.key, b: a.key })}>
              Swap
            </button>
          </>
        ) : null}
      </div>
      {!a ? (
        <div className="empty">
          <p className="help">Pick an output for A. Add one for B to compare and vote.</p>
        </div>
      ) : diff && b ? (
        <DiffCard a={a} b={b} />
      ) : (
        <div className="columns" style={{ ['--cols' as string]: b ? 2 : 1 }}>
          <Card output={a} other={b} slot="a" layers={layers} ctx={ctx} showCase={!sameCase} />
          {b ? (
            <Card output={b} other={a} slot="b" layers={layers} ctx={ctx} showCase={!sameCase} />
          ) : null}
        </div>
      )}
      {a && b ? (
        <section className="vote-box">
          <h3>Which is better?</h3>
          <div className="vote-row">
            <fieldset className="seg" aria-label="Your vote">
              {VOTES.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={humanVote === v}
                  onClick={() => vote(v)}
                >
                  {v === 'tie' ? 'Tie' : `${v.toUpperCase()} is better`}
                </button>
              ))}
            </fieldset>
            <label className="picker small muted">
              On
              <input
                type="text"
                value={criterion}
                onChange={(e) => setCriterion(e.target.value)}
                aria-label="Criterion"
              />
            </label>
            <span className="spacer" />
            <button
              type="button"
              disabled={!state.jevKey}
              title={state.jevKey ? undefined : 'Needs TYPESAFE_API_KEY'}
              onClick={askJev}
            >
              Ask Jev
            </button>
          </div>
          <BenchPick a={a} b={b} ctx={ctx} />
          {jevVotes.length ? (
            <ul className="small">
              {jevVotes.map((p) => (
                <li key={`${p.criterion}${p.at}`}>
                  On {p.criterion}, Jev picked{' '}
                  {p.vote === 'tie'
                    ? 'a tie'
                    : (p.a === a.key ? p.vote : flip(p.vote)).toUpperCase()}
                  {p.confidence !== undefined ? `, ${Math.round(p.confidence * 100)}% sure` : ''}.
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      {boards.length && board.data ? (
        <section className="section">
          <div className="section-head">
            <h2>Leaderboard</h2>
            <p className="help">
              Strength from pairwise votes. Jev and you agree on {board.data.agreement.agreed} of{' '}
              {board.data.agreement.compared} pairs you both voted on.
            </p>
          </div>
          {boards.map(([crit, { jev, human: hb }]) => (
            <div key={crit} className="boards">
              <h3>{crit}</h3>
              <div className="columns" style={{ ['--cols' as string]: 2 }}>
                <Board title="Your votes" rows={hb} ctx={ctx} />
                <Board title="Jev's votes" rows={jev} ctx={ctx} />
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  )
}

const flip = (v: Vote): Vote => (v === 'a' ? 'b' : v === 'b' ? 'a' : 'tie')
const sameTwo = (x: string, y: string, p: string, q: string) =>
  (x === p && y === q) || (x === q && y === p)

function Picker({
  label,
  outputs,
  value,
  onChange,
  ctx,
}: {
  label: string
  outputs: Output[]
  value: Output | null
  onChange: (key: string) => void
  ctx: Ctx
}) {
  const groups = new Map<string, Output[]>()
  for (const o of outputs) groups.set(o.caseId, [...(groups.get(o.caseId) ?? []), o])
  return (
    <label className="picker">
      <span className={`slot ${label.toLowerCase()}`}>{label}</span>
      <select value={value?.key ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">None</option>
        {[...groups.entries()].map(([caseId, list]) => (
          <optgroup key={caseId} label={`${caseId} · ${caseTitle(ctx.state, caseId)}`}>
            {list.map((o) => (
              <option key={o.key} value={o.key}>
                {versionName(o.run)} · {outputLine(o)}
                {configurationTail(o.run)}
                {` · ${runStamp(o.run)}`}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

function Card({
  output,
  other,
  slot,
  layers,
  ctx,
  showCase,
}: {
  output: Output
  other: Output | null
  slot: 'a' | 'b'
  layers: string[]
  ctx: Ctx
  showCase: boolean
}) {
  const { config, go } = ctx
  const scored = scoreOf(output, config)
  const otherScored = other ? scoreOf(other, config) : null
  const [artifact, setArtifact] = useState(primaryOf(output))
  useEffect(() => setArtifact(primaryOf(output)), [output])
  const delta =
    slot === 'b' && scored?.scores.total != null && otherScored?.scores.total != null
      ? scored.scores.total - otherScored.scores.total
      : null
  const size = sizeLine(output)
  return (
    <article className="card">
      <header className="card-head">
        <span className={`slot ${slot}`}>{slot.toUpperCase()}</span>
        <span className="title">{versionName(output.run)}</span>
        <span className="total">
          <TotalChip total={scored?.scores.total} />
          <Delta value={delta} />
        </span>
        <span className="meta">
          <span>
            {writerName(output.run.meta?.writer)} · {runStamp(output.run)}
            {sampleTail(output)}
          </span>
          {showCase ? <span>Case {output.caseId}</span> : null}
          {size ? <span>{size}</span> : null}
          <button type="button" className="link" onClick={() => go('blind', { key: output.key })}>
            Review
          </button>
          {output.sample.hasTranscript ? (
            <button
              type="button"
              className="link"
              onClick={() => go('transcript', { run: output.run.name, sample: output.sample.name })}
            >
              Transcript
            </button>
          ) : null}
        </span>
      </header>
      {scored ? (
        <>
          <Layers scored={scored} layers={layers} other={slot === 'b' ? otherScored : null} />
          <Flags flags={scored.flags} />
        </>
      ) : (
        <p className="help card-note">Not graded.</p>
      )}
      <ArtifactPicker artifacts={output.sample.artifacts} value={artifact} onChange={setArtifact} />
      <ArtifactView run={output.run.name} sample={output.sample.name} artifact={artifact} />
    </article>
  )
}

function DiffCard({ a, b }: { a: Output; b: Output }) {
  const pa = primaryOf(a)
  const pb = primaryOf(b)
  const textual = pa && pb && pa.kind !== 'image' && pb.kind !== 'image'
  const html = useFetch(async () => {
    if (!textual) return null
    const [x, y] = await Promise.all([
      api.artifactText(a.run.name, a.sample.name, pa.file),
      api.artifactText(b.run.name, b.sample.name, pb.file),
    ])
    return wordDiffHtml(copyOf(x), copyOf(y))
  }, [a.key, b.key])
  return (
    <article className="card">
      <header className="card-head">
        <span className="slot plain">Diff</span>
        <span className="title">
          {runName(a.run)} to {runName(b.run)}
        </span>
        <span />
        <span className="meta">Text only in A is struck through. Text only in B is marked.</span>
      </header>
      {!textual ? (
        <p className="help card-note">Word diff needs a text output on both sides.</p>
      ) : html.data === null ? (
        <p className="help card-note">{html.error ?? 'Loading…'}</p>
      ) : (
        // biome-ignore lint/security/noDangerouslySetInnerHtml: diff output is escaped
        <div className="diff" dangerouslySetInnerHTML={{ __html: html.data }} />
      )}
    </article>
  )
}

function BenchPick({ a, b, ctx }: { a: Output; b: Output; ctx: Ctx }) {
  const sa = totalOf(a, ctx.config)
  const sb = totalOf(b, ctx.config)
  if (sa === null || sb === null) return null
  const pick = sa === sb ? 'calls it a tie' : `prefers ${sa > sb ? 'A' : 'B'}`
  return (
    <p className="help">
      The bench {pick}: {sa} against {sb}.
    </p>
  )
}

function Board({ title, rows, ctx }: { title: string; rows: Rating[]; ctx: Ctx }) {
  return (
    <table className="grid-table">
      <thead>
        <tr>
          <th>{title}</th>
          <th className="num">Strength</th>
          <th className="num" title="Wins">
            W
          </th>
          <th className="num" title="Losses">
            L
          </th>
          <th className="num" title="Ties">
            T
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.length ? (
          rows.map((r) => (
            <tr key={r.id}>
              <td>
                <button
                  type="button"
                  className="link"
                  onClick={() => ctx.go('compare', { a: r.id })}
                >
                  {r.id}
                </button>
              </td>
              <td className="num">{r.score.toFixed(2)}</td>
              <td className="num">{r.wins}</td>
              <td className="num">{r.losses}</td>
              <td className="num">{r.ties}</td>
            </tr>
          ))
        ) : (
          <tr>
            <td className="muted" colSpan={5}>
              No votes yet
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
