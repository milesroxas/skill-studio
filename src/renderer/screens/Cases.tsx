/** Write the cases a run is made of: the prompt, what a good answer does, and the judge's checks. */

import type { Case, CaseDraft } from '@domain/schemas.ts'
import { isSlug, SLUG_RULE, slug } from '@domain/text.ts'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api.ts'
import { TextArea } from '../components/TextArea.tsx'
import type { Ctx } from '../ctx.ts'

const draftOf = (c: Case): CaseDraft => ({
  id: c.id,
  title: c.title === c.id ? '' : c.title,
  prompt: c.prompt,
  expectedOutcome: c.expectedOutcome,
  words: c.bench.words ?? null,
  graders: c.graders.map((g) => ({ id: g.id, statement: g.statement, weight: g.weight })),
})

const blank = (): CaseDraft => ({
  id: '',
  title: '',
  prompt: '',
  expectedOutcome: '',
  words: null,
  graders: [{ id: null, statement: '', weight: 1 }],
})

export function Cases({ ctx }: { ctx: Ctx }) {
  const { state, route, go, toast, reload } = ctx
  const cases = state.cases
  const isNew = route.params.get('new') === '1' || !cases.length
  const selected = isNew ? null : (cases.find((c) => c.id === route.params.get('id')) ?? cases[0])
  const base = useMemo(() => (selected ? draftOf(selected) : blank()), [selected])
  // By content: state reloads after every job, and an unchanged case must keep unsaved edits.
  const baseJson = JSON.stringify(base)
  const [draft, setDraft] = useState(base)
  const [idTouched, setIdTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const dirty = JSON.stringify(draft) !== baseJson

  useEffect(() => {
    setDraft(JSON.parse(baseJson))
    setIdTouched(false)
  }, [baseJson])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const pick = (params: Record<string, string>) => {
    if (dirty && !window.confirm('Leave this case? Your changes are not saved.')) return
    go('cases', params)
  }

  const set = (patch: Partial<CaseDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const setTitle = (title: string) =>
    set(isNew && !idTouched ? { title, id: slug(title, 40) } : { title })
  const setGrader = (i: number, patch: Partial<CaseDraft['graders'][number]>) =>
    set({ graders: draft.graders.map((g, k) => (k === i ? { ...g, ...patch } : g)) })

  const idError = draft.id && !isSlug(draft.id) ? SLUG_RULE : ''
  const taken = isNew && cases.some((c) => c.id === draft.id)
  const wordsError =
    draft.words && !(draft.words[0] >= 0 && draft.words[1] >= draft.words[0])
      ? 'The minimum must not be above the maximum.'
      : ''
  const canSave =
    dirty && draft.id && !idError && !taken && draft.prompt.trim() && !wordsError && !busy

  const save = async () => {
    if (!canSave) return
    setBusy(true)
    try {
      await api.saveCase(draft, isNew)
      await reload()
      toast(`Saved ${draft.id}`)
      go('cases', { id: draft.id })
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!selected) return
    if (
      !window.confirm(
        `Delete the case ${selected.id} and its folder? Past runs keep their outputs.`,
      )
    )
      return
    try {
      await api.deleteCase(selected.id)
      await reload()
      toast(`Deleted ${selected.id}`)
      go('cases')
    } catch (e) {
      toast((e as Error).message)
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      save()
    }
  }

  return (
    <div className="split cases">
      <form
        className="stack case-form"
        onKeyDown={onKey}
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        {!cases.length ? (
          <div className="intro">
            <h2>Write the first case</h2>
            <p className="help">
              A case is one task an agent gets with {state.skill.name} installed, and what a good
              answer to it does. A run writes every case, then a judge checks each answer.
            </p>
          </div>
        ) : (
          <h2>{isNew ? 'New case' : selected?.id}</h2>
        )}
        {selected?.source === 'evals.json' ? (
          <p className="note">
            This case comes from evals.json. Saving writes it as a case folder, which then takes its
            place.
          </p>
        ) : null}

        <div className="field">
          <label htmlFor="case-title">Title</label>
          <input
            id="case-title"
            value={draft.title}
            placeholder="Release note for the export change"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {isNew ? (
          <div className="field">
            <label htmlFor="case-id">Id</label>
            <input
              id="case-id"
              className="mono"
              value={draft.id}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={Boolean(idError || taken) || undefined}
              aria-describedby="case-id-help"
              onChange={(e) => {
                setIdTouched(true)
                set({ id: e.target.value })
              }}
            />
            <span id="case-id-help" className={`help${idError || taken ? ' bad' : ''}`}>
              {idError ||
                (taken
                  ? 'A case with this id exists.'
                  : 'The folder name. It cannot change later.')}
            </span>
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="case-prompt">Prompt</label>
          <TextArea
            id="case-prompt"
            rows={8}
            value={draft.prompt}
            aria-describedby="case-prompt-help"
            onChange={(e) => set({ prompt: e.target.value })}
          />
          <span id="case-prompt-help" className="help">
            Exactly what the agent is asked, as a user would ask it. Do not mention the skill.
          </span>
        </div>

        <div className="field">
          <label htmlFor="case-expected">A good answer</label>
          <TextArea
            id="case-expected"
            rows={3}
            value={draft.expectedOutcome}
            aria-describedby="case-expected-help"
            onChange={(e) => set({ expectedOutcome: e.target.value })}
          />
          <span id="case-expected-help" className="help">
            One or two sentences on what it does. You see this when you rate; the judge reads it
            too.
          </span>
        </div>

        <fieldset className="field">
          <legend>Checks</legend>
          <p className="help">
            One statement per line that a good answer makes true. The judge marks each one. Weight
            counts a check more.
          </p>
          {draft.graders.length ? (
            <div className="check check-head" aria-hidden="true">
              <span />
              <span>Statement</span>
              <span>Weight</span>
              <span />
            </div>
          ) : null}
          <ol className="checks">
            {draft.graders.map((g, i) => (
              <li key={g.id ?? `new-${i}`} className="check">
                <input
                  aria-label={`Check ${i + 1}`}
                  value={g.statement}
                  placeholder="The note says where to find the change."
                  onChange={(e) => setGrader(i, { statement: e.target.value })}
                />
                <label className="weight">
                  <span className="sr-only">Weight of check {i + 1}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={5}
                    value={g.weight}
                    onChange={(e) => setGrader(i, { weight: Number(e.target.value) || 1 })}
                  />
                </label>
                <button
                  type="button"
                  className="ghost"
                  aria-label={`Remove check ${i + 1}`}
                  onClick={() => set({ graders: draft.graders.filter((_, k) => k !== i) })}
                >
                  Remove
                </button>
              </li>
            ))}
          </ol>
          <div>
            <button
              type="button"
              onClick={() =>
                set({ graders: [...draft.graders, { id: null, statement: '', weight: 1 }] })
              }
            >
              Add a check
            </button>
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>Length</legend>
          <label className="check-row">
            <input
              type="checkbox"
              checked={Boolean(draft.words)}
              onChange={(e) => set({ words: e.target.checked ? [50, 300] : null })}
            />
            Score the answer's length in words
          </label>
          {draft.words ? (
            <div className="actions">
              <label className="picker">
                <span className="small muted">From</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={draft.words[0]}
                  onChange={(e) => set({ words: [Number(e.target.value), draft.words?.[1] ?? 0] })}
                />
              </label>
              <label className="picker">
                <span className="small muted">to</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={draft.words[1]}
                  onChange={(e) => set({ words: [draft.words?.[0] ?? 0, Number(e.target.value)] })}
                />
              </label>
              <span className="small muted">words</span>
            </div>
          ) : null}
          {wordsError ? <span className="help bad">{wordsError}</span> : null}
        </fieldset>

        {selected?.files.length ? (
          <div className="field">
            <span className="h3">Input files</span>
            <ul className="file-names mono small">
              {selected.files.map((f) => (
                <li key={f}>{f.split('/').at(-1)}</li>
              ))}
            </ul>
            <span className="help">The agent finds these in files/ next to the prompt.</span>
          </div>
        ) : null}

        <div className="form-foot">
          <button type="submit" className="primary" disabled={!canSave} title="Cmd/Ctrl+S">
            {isNew ? 'Add case' : 'Save case'}
          </button>
          {dirty && !isNew ? (
            <button type="button" className="ghost" onClick={() => setDraft(base)}>
              Revert
            </button>
          ) : null}
          {isNew && cases.length ? (
            <button type="button" className="ghost" onClick={() => pick({})}>
              Cancel
            </button>
          ) : null}
          <span className="spacer" />
          {selected?.dir ? (
            <button type="button" className="ghost danger" onClick={remove}>
              Delete case
            </button>
          ) : null}
        </div>
      </form>

      {cases.length ? (
        <aside className="panel sticky">
          <div className="section-head">
            <span className="h3">Cases</span>
            <span className="muted small tnum">{cases.length}</span>
            <span className="spacer" />
            <button type="button" onClick={() => pick({ new: '1' })} disabled={isNew}>
              New case
            </button>
          </div>
          <ul className="case-list">
            {cases.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="case-item"
                  aria-current={selected?.id === c.id ? 'true' : undefined}
                  onClick={() => pick({ id: c.id })}
                >
                  <span className="mono small">{c.id}</span>
                  <span className="sub">
                    {c.title !== c.id ? `${c.title} · ` : ''}
                    {c.graders.length} {c.graders.length === 1 ? 'check' : 'checks'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
    </div>
  )
}
