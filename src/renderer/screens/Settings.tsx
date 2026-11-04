/**
 * Settings: the TypeSafe key Jev grades with. The desktop app keeps it in the
 * system keychain; a key in the environment always wins and is shown as such.
 */
import { useState } from 'react'
import { api, type Settings } from '../api.ts'
import { useFetch } from '../hooks.ts'

interface Props {
  toast: (message: string) => void
  /** Called after a change, so the open skill's state picks the key up. */
  onSaved: () => Promise<void>
}

export function SettingsScreen({ toast, onSaved }: Props) {
  const { data, error, reload } = useFetch(() => api.settings(), [])
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async (next: string) => {
    setBusy(true)
    try {
      await api.setJevKey(next)
      setValue('')
      toast(next ? 'Key saved' : 'Key removed')
      reload()
      await onSaved()
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (error) return <p className="help">{error}</p>
  if (!data) return <p className="help">Loading…</p>
  return (
    <div className="panel settings">
      <h2>Jev key</h2>
      <p className="help">
        Jev, the judge behind every pack, is a <a href="https://typesafe.ai">TypeSafe</a> model.
        Without a key, grading runs code checks only and every judged layer stays empty.
      </p>
      <p className={`pill ${data.jevKey ? 'ok' : 'warn'}`}>{describe(data)}</p>
      {data.canStore ? (
        <form
          className="field"
          onSubmit={(event) => {
            event.preventDefault()
            if (value.trim()) void save(value.trim())
          }}
        >
          <label htmlFor="jev-key">
            {data.source === 'stored' ? 'Replace the stored key' : 'Store a key'}
          </label>
          <input
            id="jev-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            placeholder="ts_…"
            onChange={(event) => setValue(event.target.value)}
          />
          <div className="actions">
            <button type="submit" className="primary" disabled={busy || !value.trim()}>
              Save
            </button>
            {data.source === 'stored' ? (
              <button type="button" disabled={busy} onClick={() => void save('')}>
                Remove the stored key
              </button>
            ) : null}
          </div>
        </form>
      ) : (
        <p className="help">
          This host keeps no key of its own. Set <code>TYPESAFE_API_KEY</code> in the environment
          (or in <code>.env</code> when running from a checkout) and start it again.
        </p>
      )}
    </div>
  )
}

function describe(settings: Settings): string {
  if (settings.source === 'environment')
    return 'Key set in the environment; it wins over a stored one.'
  if (settings.source === 'stored') return 'Key stored in the system keychain.'
  return 'No key: grading uses code checks only.'
}
