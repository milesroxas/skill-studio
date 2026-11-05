/**
 * Settings. Yours first: how the app looks and moves, and how the editor
 * opens Markdown, stored with your preferences and applied at once. Then the
 * app's: the TypeSafe key Jev grades with. The desktop app keeps the key in
 * the system keychain; a key in the environment always wins and shows as such.
 */
import type { EditorMode, Motion, Preferences, Theme } from '@domain/preferences.ts'
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import { api, type Settings } from '../api.ts'
import { EmptyState, Field, FormSection, Loading, Screen, Toolbar } from '../components/layout.tsx'
import { Segmented } from '../components/Segmented.tsx'
import { Status } from '../components/Status.tsx'
import { Code, Hint, Link } from '../components/text.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { Label } from '../components/ui/label.tsx'
import { useFetch } from '../hooks.ts'
import { setPreferences, usePreferences } from '../preferences.ts'

interface Props {
  toast: (message: string) => void
  /** Called after a change, so the open skill's state picks the key up. */
  onSaved: () => Promise<void>
}

const THEMES = [
  {
    value: 'system',
    label: (
      <>
        <MonitorIcon aria-hidden="true" />
        System
      </>
    ),
  },
  {
    value: 'light',
    label: (
      <>
        <SunIcon aria-hidden="true" />
        Light
      </>
    ),
  },
  {
    value: 'dark',
    label: (
      <>
        <MoonIcon aria-hidden="true" />
        Dark
      </>
    ),
  },
] as const satisfies ReadonlyArray<{ value: Theme; label: ReactNode }>

const MOTIONS = [
  { value: 'system', label: 'Follow the system' },
  { value: 'reduced', label: 'Reduce' },
] as const satisfies ReadonlyArray<{ value: Motion; label: string }>

const EDITOR_MODES = [
  { value: 'formatted', label: 'Formatted' },
  { value: 'markdown', label: 'Markdown' },
] as const satisfies ReadonlyArray<{ value: EditorMode; label: string }>

export function SettingsScreen({ toast, onSaved }: Props) {
  const preferences = usePreferences()
  const ids = { theme: useId(), motion: useId(), editor: useId() }
  const choose = (patch: Partial<Preferences>) =>
    setPreferences(patch).catch((e: Error) => toast(`Not saved: ${e.message}`))

  return (
    <Screen width="form">
      <FormSection title="Appearance" hint="How Skill Studio looks and moves on this computer.">
        <Field>
          <Label id={ids.theme}>Theme</Label>
          <Segmented<Theme>
            aria-labelledby={ids.theme}
            value={preferences.theme}
            onChange={(theme) => theme && choose({ theme })}
            options={THEMES}
          />
          <Hint>System follows your computer’s light or dark setting as it changes.</Hint>
        </Field>
        <Field>
          <Label id={ids.motion}>Motion</Label>
          <Segmented<Motion>
            aria-labelledby={ids.motion}
            value={preferences.motion}
            onChange={(motion) => motion && choose({ motion })}
            options={MOTIONS}
          />
          <Hint>Reduce turns off transitions and animations, whatever the system asks for.</Hint>
        </Field>
      </FormSection>

      <FormSection title="Editor" hint="How the Write screen opens a skill’s Markdown files.">
        <Field>
          <Label id={ids.editor}>Open Markdown as</Label>
          <Segmented<EditorMode>
            aria-labelledby={ids.editor}
            value={preferences.editorMode}
            onChange={(editorMode) => editorMode && choose({ editorMode })}
            options={EDITOR_MODES}
          />
          <Hint>
            Formatted styles headings, lists and emphasis in place. Markdown shows the source. The
            switch above the editor changes this too.
          </Hint>
        </Field>
      </FormSection>

      <JevKey toast={toast} onSaved={onSaved} />
    </Screen>
  )
}

/** The key Jev grades with: where it comes from, and a field to store or replace it. */
function JevKey({ toast, onSaved }: Props) {
  const { data, error, reload } = useFetch(() => api.settings(), [])
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const id = useId()

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

  return (
    <FormSection
      title="Jev key"
      hint={
        <>
          Jev, the judge behind every pack, is a <Link href="https://typesafe.ai">TypeSafe</Link>{' '}
          model. Without a key, grading runs code checks only and every judged layer stays empty.
        </>
      }
    >
      {error && !data ? (
        <EmptyState
          size="compact"
          title="Could not read the key’s status"
          actions={
            <Button type="button" variant="outline" onClick={reload}>
              Try again
            </Button>
          }
        >
          {error}
        </EmptyState>
      ) : !data ? (
        <Loading />
      ) : (
        <>
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
                <Label htmlFor={id}>
                  {data.source === 'stored' ? 'Replace the stored key' : 'Store a key'}
                </Label>
                <Input
                  id={id}
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
                  {busy ? 'Saving…' : 'Save key'}
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
              This host keeps no key of its own. Set <Code>TYPESAFE_API_KEY</Code> in the
              environment (or in <Code>.env</Code> when running from a checkout) and start it again.
            </Hint>
          )}
        </>
      )}
    </FormSection>
  )
}

function describe(settings: Settings): string {
  if (settings.source === 'environment')
    return 'Set in the environment, so it wins over a stored one.'
  if (settings.source === 'stored') return 'Stored in the system keychain.'
  return 'Grading uses code checks only.'
}
