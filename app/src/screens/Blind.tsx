/** Blind review: judge an output before its scores or its run are shown, then reveal and save. */
import type { Artifact } from '@core/schemas.ts'
import { useEffect, useState } from 'react'
import { api } from '../api.ts'
import { AnchorForm } from '../components/AnchorForm.tsx'
import { ArtifactPicker, ArtifactView } from '../components/Artifact.tsx'
import { Flags, Layers, TotalChip } from '../components/Scores.tsx'
import type { Ctx } from '../ctx.ts'
import { useFetch } from '../hooks.ts'
import {
  capital,
  caseTitle,
  layersOf,
  type Output,
  outputByKey,
  outputLine,
  primaryOf,
  reviewOf,
  scoreOf,
  sizeLine,
  versionName,
} from '../model.ts'

type Mark = 'good' | 'bad'

export function Blind({ ctx }: { ctx: Ctx }) {
  const { state, config, outputs, toast, reload, route, go } = ctx
  const queue = useFetch(() => api.queue(), [state])
  const wanted = route.params.get('key')
  const [key, setKey] = useState<string | null>(wanted)
  const [revealed, setRevealed] = useState(false)
  const [rating, setRating] = useState<number | null>(null)
  const [marks, setMarks] = useState<Record<string, Mark>>({})
  const [note, setNote] = useState('')
  const [anchor, setAnchor] = useState(false)
  const [artifact, setArtifact] = useState<Artifact | null>(null)
  const layers = layersOf(config)

  const items = queue.data ?? []
  const reviewed = outputs.filter((o) => o.result && reviewOf(state, o.key))
  const current = key ?? items[0]?.key ?? null
  const output = outputByKey(outputs, current)
  const open = (next: string | null) => {
    setKey(next)
    go('blind', next ? { key: next } : {})
  }

  useEffect(() => {
    if (!current) return
    const saved = reviewOf(state, current)
    setRating(saved?.rating ?? null)
    setMarks(saved?.layers ?? {})
    setNote(saved?.note ?? '')
    setRevealed(Boolean(saved))
    setAnchor(false)
  }, [current, state])
  useEffect(() => setArtifact(output ? primaryOf(output) : null), [output])

  if (!output)
    return (
      <div className="empty">
        <h2>{items.length ? 'Pick an output to review' : 'Every graded output has a review'}</h2>
        <p className="help">
          The queue holds graded outputs you have not reviewed, the judge's least certain first.
          Grade a run to add more.
        </p>
        <div className="actions">
          <button type="button" onClick={() => go('overview')}>
            Open Overview
          </button>
        </div>
        <ReviewedList reviewed={reviewed} current={current} open={open} />
      </div>
    )

  const scored = scoreOf(output, config)
  const position = items.findIndex((i) => i.key === current)
  const next = () =>
    open((items[position + 1] ?? items.find((i) => i.key !== current))?.key ?? null)
  const save = async () => {
    try {
      await api.review(output.key, { rating, layers: marks, note })
      toast('Saved')
      // Pin the output: it leaves the queue once reviewed.
      setKey(output.key)
      setRevealed(true)
      await reload()
    } catch (e) {
      toast(`Not saved: ${(e as Error).message}`)
    }
  }
  const mark = (layer: string, value: Mark) =>
    setMarks((prev) => {
      const marked = { ...prev }
      if (marked[layer] === value) delete marked[layer]
      else marked[layer] = value
      return marked
    })
  const testCase = state.cases.find((c) => c.id === output.caseId)
  const size = sizeLine(output)
  const canSkip = items.some((i) => i.key !== current)

  return (
    <div className="split">
      <article className="card">
        <header className="card-head">
          <span className="slot plain">
            {position >= 0 ? `${position + 1} of ${items.length}` : 'Reviewed'}
          </span>
          <span className="title">
            {revealed ? (
              <>
                {versionName(output.run)} <span className="muted">· {outputLine(output)}</span>
              </>
            ) : (
              <>
                {caseTitle(state, output.caseId)}{' '}
                <span className="muted mono small">{output.caseId}</span>
              </>
            )}
          </span>
          <span className="total">
            {revealed ? <TotalChip total={scored?.scores.total} /> : null}
          </span>
          {size || !revealed ? (
            <span className="meta">
              {!revealed ? <span>Scores and writer stay hidden until you save</span> : null}
              {size ? <span>{size}</span> : null}
            </span>
          ) : null}
        </header>
        {revealed && scored ? (
          <>
            <Layers scored={scored} layers={layers} />
            <Flags flags={scored.flags} />
          </>
        ) : null}
        {testCase ? (
          <details className="prompt-box">
            <summary>
              The prompt{testCase.graders.length ? ' and what the case checks' : ''}
            </summary>
            <pre>{testCase.prompt}</pre>
            {testCase.expectedOutcome ? (
              <p className="help">Expected: {testCase.expectedOutcome}</p>
            ) : null}
            {testCase.graders.length ? (
              <ul>
                {testCase.graders.map((g) => (
                  <li key={g.id}>{g.statement}</li>
                ))}
              </ul>
            ) : null}
          </details>
        ) : null}
        <ArtifactPicker
          artifacts={output.sample.artifacts}
          value={artifact}
          onChange={setArtifact}
        />
        <ArtifactView run={output.run.name} sample={output.sample.name} artifact={artifact} />
      </article>
      <aside className="panel sticky">
        <fieldset className="field">
          <legend>Your rating</legend>
          <div className="seg fill">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className="tnum"
                aria-pressed={rating === n}
                onClick={() => setRating(rating === n ? null : n)}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="help">1 is unusable, 5 ships as is.</p>
        </fieldset>
        <fieldset className="field">
          <legend>By layer</legend>
          <div className="marks">
            {layers.map((layer) => (
              <div key={layer} className="mark-row">
                <span>{capital(layer)}</span>
                <span className="bench">{revealed ? (scored?.scores[layer] ?? '–') : ''}</span>
                <fieldset className="seg" aria-label={capital(layer)}>
                  <button
                    type="button"
                    className="good"
                    aria-pressed={marks[layer] === 'good'}
                    onClick={() => mark(layer, 'good')}
                  >
                    Good
                  </button>
                  <button
                    type="button"
                    className="bad"
                    aria-pressed={marks[layer] === 'bad'}
                    onClick={() => mark(layer, 'bad')}
                  >
                    Bad
                  </button>
                </fieldset>
              </div>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label className="h3" htmlFor="review-note">
            Note
          </label>
          <textarea
            id="review-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What works, what you would change, what the skill should have done"
          />
        </div>
        <div className="field">
          <div className="actions">
            <button type="button" className="primary" onClick={save}>
              {revealed ? 'Save' : 'Save and reveal'}
            </button>
            <button type="button" onClick={next} disabled={!canSkip}>
              {revealed ? 'Next' : 'Skip'}
            </button>
          </div>
          {revealed ? (
            <div className="actions small">
              <button
                type="button"
                className="link"
                onClick={() => go('compare', { a: output.key })}
              >
                Compare with another output
              </button>
              <button type="button" className="link" onClick={() => setAnchor((a) => !a)}>
                Make it an anchor
              </button>
            </div>
          ) : (
            <div className="actions small">
              <button type="button" className="link" onClick={() => setRevealed(true)}>
                Reveal without saving
              </button>
            </div>
          )}
          {revealed && anchor ? (
            <AnchorForm
              output={output}
              layers={layers}
              badLayers={Object.entries(marks)
                .filter(([, v]) => v === 'bad')
                .map(([l]) => l)}
              about={note}
              onDone={(m) => {
                toast(m)
                setAnchor(false)
                reload()
              }}
            />
          ) : null}
        </div>
        <div className="field">
          <h3>
            Queue <span className="muted tnum">{items.length}</span>
          </h3>
          {items.length ? (
            <div className="queue">
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`row${item.key === current ? ' current' : ''}`}
                  aria-current={item.key === current ? 'true' : undefined}
                  onClick={() => open(item.key)}
                >
                  <span className="name">
                    {item.result.case ?? item.result.sample}
                    <small>
                      {item.result.confidence === null
                        ? 'Judge certainty unknown'
                        : `Judge ${Math.round(item.result.confidence * 100)}% sure`}
                      {item.caseSpread ? ` · spread ${item.caseSpread}` : ''}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="help">Empty: every graded output has a review.</p>
          )}
          <ReviewedList reviewed={reviewed} current={current} open={open} />
        </div>
      </aside>
    </div>
  )
}

function ReviewedList({
  reviewed,
  current,
  open,
}: {
  reviewed: Output[]
  current: string | null
  open: (key: string) => void
}) {
  if (!reviewed.length) return null
  return (
    <details>
      <summary className="help">Reviewed ({reviewed.length})</summary>
      <div className="queue">
        {reviewed.map((o) => (
          <button
            key={o.key}
            type="button"
            className={`row${o.key === current ? ' current' : ''}`}
            onClick={() => open(o.key)}
          >
            <span className="name">
              {o.caseId}
              <small>{outputLine(o)}</small>
            </span>
          </button>
        ))}
      </div>
    </details>
  )
}
