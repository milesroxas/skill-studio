/**
 * Settings: the TypeSafe key Jev grades with. The desktop app keeps it in the
 * system keychain; a key in the environment always wins and is shown as such.
 */
import { useState } from 'react'
import { api, type Settings } from '../api.ts'
import { Field, FormSection, Screen, Toolbar } from '../components/layout.tsx'
import { Status } from '../components/Status.tsx'
import { Code, Hint, Link } from '../components/text.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { Label } from '../components/ui/label.tsx'
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

  if (error) return <Hint>{error}</Hint>
  if (!data) return <Hint>Loading…</Hint>
  return (
    <Screen width="form">
      <FormSection
        title="Jev key"
        hint={
          <>
            Jev, the judge behind every pack, is a <Link href="https://typesafe.ai">TypeSafe</Link>{' '}
            model. Without a key, grading runs code checks only and every judged layer stays empty.
          </>
        }
      >
        <Status tone={data.jevKey ? 'success' : 'warning'} detail={describe(data)}>
          {data.source === 'environment'
            ? 'From the environment'
            : data.source === 'stored'
              ? 'In the keychain'
              : 'No key'}
        </Status>
        {data.canStore ? (
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault()
              if (value.trim()) void save(value.trim())
            }}
          >
            <Field>
              <Label htmlFor="jev-key">
                {data.source === 'stored' ? 'Replace the stored key' : 'Store a key'}
              </Label>
              <Input
                id="jev-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={value}
                placeholder="ts_…"
                onChange={(event) => setValue(event.target.value)}
              />
            </Field>
            <Toolbar>
              <Button type="submit" disabled={busy || !value.trim()}>
                Save
              </Button>
              {data.source === 'stored' ? (
                <Button
                  type="button"
                  variant="destructive-ghost"
                  disabled={busy}
                  onClick={() => void save('')}
                >
                  Remove the stored key
                </Button>
              ) : null}
            </Toolbar>
          </form>
        ) : (
          <Hint>
            This host keeps no key of its own. Set <Code>TYPESAFE_API_KEY</Code> in the environment
            (or in <Code>.env</Code> when running from a checkout) and start it again.
          </Hint>
        )}
      </FormSection>
    </Screen>
  )
}

function describe(settings: Settings): string {
  if (settings.source === 'environment')
    return 'Set in the environment, so it wins over a stored one.'
  if (settings.source === 'stored') return 'Stored in the system keychain.'
  return 'Grading uses code checks only.'
}
