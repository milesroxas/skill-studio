/** Write new outputs: pick cases, writers, samples and the configuration; watch the job. */
import { CONFIGURATIONS, type Configuration } from '@core/schemas.ts'
import { useState } from 'react'
import { api } from '../api.ts'
import { JobLogs } from '../components/Jobs.tsx'
import type { Ctx } from '../ctx.ts'
import { useToggleSet } from '../hooks.ts'
import { capital, runStamp, versionName } from '../model.ts'

interface WriterRow {
  id: number
  engine: string
  model: string
  effort: string
}

const CONFIG_HELP: Record<Configuration, string> = {
  with_skill: 'The agent has this skill installed.',
  without_skill: 'No skill installed: the baseline the skill has to beat.',
  old_skill: "A past run's copy of the skill, to test an edit against the version before it.",
}

export function Generate({ ctx }: { ctx: Ctx }) {
  const { state, jobs, toast } = ctx
  const engines = state.engines
  const first = engines.find((e) => e.available) ?? engines[0]
  const current = state.versions.current
  const withSkill = state.runs.filter((r) => r.hasSkill)
  const [cases, toggleCase] = useToggleSet(state.cases.map((c) => c.id))
  const [writers, setWriters] = useState<WriterRow[]>(
    first ? [{ id: 1, engine: first.id, model: first.defaultModel, effort: 'default' }] : [],
  )
  const [samples, setSamples] = useState(1)
  const [configuration, setConfiguration] = useState<Configuration>('with_skill')
  const [baseline, setBaseline] = useState(withSkill[0]?.name ?? '')
  const [skillName, setSkillName] = useState(current.changed ? '' : current.name)
  const [note, setNote] = useState('')
  const [grade, setGrade] = useState(true)
  const [busy, setBusy] = useState(false)
  const needsName = current.changed && !skillName.trim()
  const count = cases.size * writers.length * samples
  const missing = engines.filter((e) => !e.available)

  const setWriter = (i: number, patch: Partial<WriterRow>) =>
    setWriters((w) => w.map((row, k) => (k === i ? { ...row, ...patch } : row)))
  const submit = async () => {
    setBusy(true)
    try {
      await api.generate({
        cases: [...cases],
        configs: writers.map(({ engine, model, effort }) => ({ engine, model, effort })),
        samples,
        configuration,
        baselineRun: configuration === 'old_skill' ? baseline || null : null,
        skillName: skillName.trim() || null,
        note,
        grade,
      })
      toast('Started')
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`split ${jobs.length ? 'even' : 'single'}`}>
      <div className="panel">
        <div className="field">
          <h3>Skill version</h3>
          {current.changed ? (
            <>
              <label className="help" htmlFor="gen-name">
                The skill changed since the last run, so this run starts {current.version}. Name it
                in a few words.
              </label>
              <input
                id="gen-name"
                type="text"
                placeholder={`What changed in ${current.version}`}
                value={skillName}
                onChange={(e) => setSkillName(e.target.value)}
              />
            </>
          ) : (
            <p className="help">
              Runs use {current.version}
              {current.name ? ` · ${current.name}` : ''}, unchanged since its last run.
            </p>
          )}
        </div>

        <fieldset className="field">
          <legend>Cases</legend>
          {state.cases.map((c) => (
            <label key={c.id} className="check-row">
              <input type="checkbox" checked={cases.has(c.id)} onChange={() => toggleCase(c.id)} />
              <span>
                {c.title} <span className="mono muted small">{c.id}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className="field">
          <legend>Writers</legend>
          {writers.map((w, i) => {
            const engine = engines.find((e) => e.id === w.engine)
            return (
              <div key={w.id} className="writer-row">
                <select
                  aria-label="Agent"
                  value={w.engine}
                  onChange={(e) => {
                    const next = engines.find((x) => x.id === e.target.value)
                    setWriter(i, {
                      engine: e.target.value,
                      model: next?.defaultModel ?? '',
                      effort: 'default',
                    })
                  }}
                >
                  {engines.map((e) => (
                    <option key={e.id} value={e.id} disabled={!e.available}>
                      {e.label}
                      {e.available ? '' : ' (not set up)'}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Model"
                  list={`models-${w.id}`}
                  value={w.model}
                  onChange={(e) => setWriter(i, { model: e.target.value })}
                  placeholder="Model"
                />
                <datalist id={`models-${w.id}`}>
                  {(engine?.models ?? []).map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
                <select
                  aria-label="Effort"
                  value={w.effort}
                  onChange={(e) => setWriter(i, { effort: e.target.value })}
                >
                  <option value="default">Default effort</option>
                  {(engine?.efforts ?? []).map((ef) => (
                    <option key={ef} value={ef}>
                      {capital(ef)} effort
                    </option>
                  ))}
                </select>
                {writers.length > 1 ? (
                  <button
                    type="button"
                    className="ghost"
                    aria-label={`Remove writer ${i + 1}`}
                    onClick={() => setWriters((rows) => rows.filter((_, k) => k !== i))}
                  >
                    Remove
                  </button>
                ) : (
                  <span />
                )}
              </div>
            )
          })}
          <div className="actions">
            <button
              type="button"
              disabled={writers.length >= 4 || !first}
              onClick={() =>
                first &&
                setWriters((w) => [
                  ...w,
                  {
                    id: Math.max(0, ...w.map((x) => x.id)) + 1,
                    engine: first.id,
                    model: first.defaultModel,
                    effort: 'default',
                  },
                ])
              }
            >
              Add a writer
            </button>
          </div>
          {missing.map((e) => (
            <p key={e.id} className="help">
              {e.label} is not set up. {e.hint}
            </p>
          ))}
        </fieldset>

        <div className="form-grid">
          <label htmlFor="gen-samples">Samples per case</label>
          <input
            id="gen-samples"
            type="number"
            min={1}
            max={10}
            value={samples}
            onChange={(e) => setSamples(Math.max(1, Number(e.target.value) || 1))}
          />
          <label htmlFor="gen-config">Skill</label>
          <div className="stack">
            <select
              id="gen-config"
              value={configuration}
              onChange={(e) => setConfiguration(e.target.value as Configuration)}
            >
              {CONFIGURATIONS.map((c) => (
                <option key={c} value={c}>
                  {capital(c.replace('_', ' '))}
                </option>
              ))}
            </select>
            <span className="help">{CONFIG_HELP[configuration]}</span>
          </div>
          {configuration === 'old_skill' ? (
            <>
              <label htmlFor="gen-baseline">Copy from</label>
              <select
                id="gen-baseline"
                value={baseline}
                onChange={(e) => setBaseline(e.target.value)}
              >
                {withSkill.map((r) => (
                  <option key={r.name} value={r.name}>
                    {versionName(r)} · {runStamp(r)}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <label htmlFor="gen-note">Note</label>
          <input
            id="gen-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What this run is for"
          />
          <span />
          <label className="check-row">
            <input type="checkbox" checked={grade} onChange={(e) => setGrade(e.target.checked)} />
            <span>
              Grade when done{' '}
              <span className="muted">
                {state.jevKey ? 'with Jev' : '(code checks only: no Jev key)'}
              </span>
            </span>
          </label>
        </div>

        <div className="actions">
          <button
            type="button"
            className="primary"
            disabled={busy || needsName || !cases.size || !writers.length}
            onClick={submit}
          >
            Generate {count} output{count === 1 ? '' : 's'}
          </button>
          {needsName ? (
            <span className="help">Name {current.version} first.</span>
          ) : !cases.size ? (
            <span className="help">Pick at least one case.</span>
          ) : (
            <span className="help">
              {cases.size} case{cases.size === 1 ? '' : 's'} × {writers.length} writer
              {writers.length === 1 ? '' : 's'} × {samples} sample{samples === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>
      {jobs.length ? (
        <section className="section">
          <h2>Jobs</h2>
          <JobLogs jobs={jobs.slice(0, 6)} />
        </section>
      ) : null}
    </div>
  )
}
