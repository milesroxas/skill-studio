/** The bench knobs: weights, thresholds, packs and pack keys. Every output rescores as they move. */
import { DEFAULT_CONFIG } from '@core/config.ts'
import type { BenchConfig } from '@core/schemas.ts'
import { scorers } from '@judges/scorers.ts'
import { api } from '../api.ts'
import { Delta, TotalChip } from '../components/Scores.tsx'
import type { Ctx } from '../ctx.ts'
import {
  capital,
  chipClass,
  layersOf,
  mergedConfig,
  type Output,
  runName,
  runStamp,
  scoreOf,
} from '../model.ts'

type KnobValue = number | Record<string, number>

/** Keys every bench has; Knobs shows them in their own groups, not as pack knobs. */
const RESERVED = new Set(Object.keys(DEFAULT_CONFIG))

/** Each pack's numeric knobs and their defaults, so a knob's range follows its default, not its current value. */
const PACK_KNOBS: Array<{ pack: string; key: string; defaults: KnobValue }> = scorers.flatMap(
  (pack) =>
    Object.entries(pack.defaults).flatMap(([key, value]) =>
      !RESERVED.has(key) && isKnob(value) ? [{ pack: pack.id, key, defaults: value }] : [],
    ),
)

export function Knobs({ ctx }: { ctx: Ctx }) {
  const { state, config, setConfig, outputs, toast, reload } = ctx
  const saved = mergedConfig(state.savedConfig)
  const layers = layersOf(config)
  const dirty = JSON.stringify(config) !== JSON.stringify(saved)
  const set = (patch: Partial<BenchConfig>) => setConfig({ ...config, ...patch })
  const setWeight = (layer: string, value: number) =>
    set({ weights: { ...config.weights, [layer]: value } })
  const togglePack = (id: string) => {
    const packs = config.packs.includes(id)
      ? config.packs.filter((p) => p !== id)
      : [...config.packs, id]
    if (!packs.length) return
    // Re-merge so the pack's defaults come and go with it.
    setConfig(mergedConfig({ ...config, packs }))
  }
  const save = async () => {
    try {
      const { saved: path } = await api.config(config)
      toast(`Saved ${path}`)
      await reload()
    } catch (e) {
      toast((e as Error).message)
    }
  }
  const knobs = Object.entries(config).flatMap(([key, value]) =>
    !RESERVED.has(key) && isKnob(value)
      ? [{ key, value, known: PACK_KNOBS.find((k) => k.key === key) ?? null }]
      : [],
  )
  const graded = outputs.filter((o) => o.result)

  return (
    <div className="split knobs">
      <div className="panel">
        <div className="toolbar">
          {dirty ? (
            <>
              <button type="button" className="primary" onClick={save}>
                Save to {state.paths.bench}
              </button>
              <button type="button" onClick={() => setConfig(saved)}>
                Discard changes
              </button>
            </>
          ) : (
            <p className="help">
              Saved in {state.paths.bench}. Move a setting and every output rescores at once.
            </p>
          )}
        </div>

        <fieldset className="field">
          <legend>Packs</legend>
          {scorers.map((pack) => (
            <label key={pack.id} className="check-row">
              <input
                type="checkbox"
                checked={config.packs.includes(pack.id)}
                disabled={config.packs.length === 1 && config.packs.includes(pack.id)}
                onChange={() => togglePack(pack.id)}
              />
              <span>
                {capital(pack.id)}{' '}
                <small className="muted">{pack.layers.map(capital).join(', ')}</small>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="knob-group">
          <h3>Layer weights</h3>
          <p className="help">
            Points per layer. A layer with no score drops out and the rest rescale.
          </p>
          {layers.map((layer) => (
            <Knob
              key={layer}
              label={capital(layer)}
              value={config.weights[layer] ?? 0}
              min={0}
              max={60}
              step={1}
              onChange={(v) => setWeight(layer, v)}
            />
          ))}
        </div>

        <div className="knob-group">
          <h3>Thresholds</h3>
          <Knob
            label="Yes at"
            about="A judge answer reads as yes at this probability or above."
            value={config.yes}
            min={0.3}
            max={0.8}
            step={0.05}
            onChange={(v) => set({ yes: v })}
          />
          <Knob
            label="Unsure below"
            about="Verdicts less certain than this are listed as unsure."
            value={config.sure}
            min={0.3}
            max={0.9}
            step={0.05}
            onChange={(v) => set({ sure: v })}
          />
          <Knob
            label="Good at"
            about="Insights counts a layer score this high or higher as good."
            value={config.agreeAt}
            min={40}
            max={95}
            step={5}
            onChange={(v) => set({ agreeAt: v })}
          />
        </div>

        {knobs.length ? (
          <div className="knob-group">
            <h3>Judge pack settings</h3>
            {knobs.map(({ key, value, known }) =>
              typeof value === 'number' ? (
                <Knob
                  key={key}
                  label={humanize(key)}
                  title={key}
                  value={value}
                  {...rangeOf(typeof known?.defaults === 'number' ? known.defaults : value)}
                  onChange={(v) => set({ [key]: v })}
                />
              ) : (
                <div key={key} className="knob-group">
                  <span className="small muted" title={key}>
                    {known && known.key !== known.pack
                      ? `${capital(known.pack)}: ${humanize(key)}`
                      : humanize(key)}
                  </span>
                  {Object.entries(value).map(([sub, v]) => {
                    const base =
                      known && typeof known.defaults === 'object' ? known.defaults[sub] : undefined
                    return (
                      <Knob
                        key={sub}
                        label={humanize(sub)}
                        title={`${key}.${sub}`}
                        value={v}
                        {...rangeOf(base ?? v)}
                        onChange={(n) => set({ [key]: { ...value, [sub]: n } })}
                      />
                    )
                  })}
                </div>
              ),
            )}
          </div>
        ) : null}

        <details>
          <summary className="small">
            Rules:{' '}
            {config.rules
              ? `${config.rules.length} chosen in bench.json`
              : `${state.rules.length} read from SKILL.md bullets`}
          </summary>
          {config.rules ? null : (
            <p className="help">Set "rules" in bench.json to choose them by hand.</p>
          )}
          <ol className="small">
            {state.rules.map((r) => (
              <li key={r.id}>
                {r.text} <span className="muted">({r.section})</span>
              </li>
            ))}
          </ol>
        </details>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Rescored</h2>
          <p className="help">
            {dirty
              ? 'Every graded output under these knobs. The change from the saved knobs sits beside each total.'
              : 'Every graded output under the saved knobs.'}
          </p>
        </div>
        {graded.length ? (
          <div className="scroll-x">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Output</th>
                  {layers.map((l) => (
                    <th key={l} className="num">
                      {capital(l)}
                    </th>
                  ))}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {graded.map((o) => (
                  <Row key={o.key} output={o} config={config} saved={saved} layers={layers} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="help">No graded outputs yet.</p>
        )}
      </section>
    </div>
  )
}

function Row({
  output,
  config,
  saved,
  layers,
}: {
  output: Output
  config: BenchConfig
  saved: BenchConfig
  layers: string[]
}) {
  const now = scoreOf(output, config)
  const was = scoreOf(output, saved)
  const delta =
    now?.scores.total != null && was?.scores.total != null ? now.scores.total - was.scores.total : 0
  return (
    <tr>
      <td>
        {runName(output.run)}
        <span className="sub">
          {output.caseId} · {runStamp(output.run)}
          {output.samples > 1 ? ` · sample ${output.index}` : ''}
        </span>
      </td>
      {layers.map((l) => (
        <td key={l} className={`num ${chipClass(now?.scores[l])}`}>
          {now?.scores[l] ?? '–'}
        </td>
      ))}
      <td className="num">
        <TotalChip total={now?.scores.total} />
        <Delta value={delta} />
      </td>
    </tr>
  )
}

function Knob({
  label,
  about,
  title,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  about?: string
  title?: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <label className="knob" title={title}>
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <input
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {about ? <span className="about">{about}</span> : null}
    </label>
  )
}

function isKnob(value: unknown): value is KnobValue {
  if (typeof value === 'number') return true
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === 'number')
  )
}

/** Whole-number knobs (counts, seconds, characters) step by 1; fractions step by 0.05. */
function rangeOf(base: number): { min: number; max: number; step: number } {
  if (Number.isInteger(base) && base >= 1)
    return { min: 0, max: Math.max(10, Math.ceil((base * 2.5) / 10) * 10), step: 1 }
  return { min: 0, max: base > 1 ? Math.ceil(base * 2) : 1, step: 0.05 }
}

/** "maxRetries" reads as "Max retries". */
const humanize = (key: string): string =>
  capital(key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())
