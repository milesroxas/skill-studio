/** Promote an output to `evals/anchors/` with a label and the layers a bad anchor must fail. */
import { useState } from 'react'
import { api } from '../api.ts'
import { useToggleSet } from '../hooks.ts'
import { capital, type Output, primaryOf } from '../model.ts'

interface Props {
  output: Output
  layers: string[]
  badLayers?: string[]
  about?: string
  onDone: (message: string) => void
}

export function AnchorForm({ output, layers, badLayers = [], about = '', onDone }: Props) {
  const [label, setLabel] = useState<'good' | 'bad'>(badLayers.length ? 'bad' : 'good')
  const [tests, toggle] = useToggleSet(badLayers.length ? [...badLayers, 'total'] : [])
  const [note, setNote] = useState(about.split('\n')[0])
  const [busy, setBusy] = useState(false)
  const primary = primaryOf(output)
  const submit = async () => {
    if (!primary) return
    setBusy(true)
    try {
      const { saved } = await api.anchor({
        run: output.run.name,
        sample: output.sample.name,
        file: primary.file,
        case: output.caseId,
        label,
        tests: label === 'bad' ? [...tests] : [],
        about: note,
      })
      onDone(`Anchor saved: ${saved}`)
    } catch (e) {
      onDone(`Not saved: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="anchor-form">
      <fieldset className="seg fill" aria-label="Anchor label">
        <button
          type="button"
          className="good"
          aria-pressed={label === 'good'}
          onClick={() => setLabel('good')}
        >
          Good example
        </button>
        <button
          type="button"
          className="bad"
          aria-pressed={label === 'bad'}
          onClick={() => setLabel('bad')}
        >
          Bad example
        </button>
      </fieldset>
      {label === 'bad' ? (
        <fieldset className="field">
          <legend className="help">
            A bad anchor must score below the case's good anchor on each layer ticked.
          </legend>
          <div className="actions small">
            {[...layers, 'total'].map((layer) => (
              <label key={layer} className="check-row">
                <input type="checkbox" checked={tests.has(layer)} onChange={() => toggle(layer)} />
                {capital(layer)}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <input
        type="text"
        aria-label="What it shows"
        placeholder="What it shows, in a line"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="actions">
        <button type="button" disabled={busy || !primary} onClick={submit}>
          Save anchor
        </button>
      </div>
    </div>
  )
}
