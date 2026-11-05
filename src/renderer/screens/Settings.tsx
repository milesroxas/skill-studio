/**
 * Settings. Yours first: how the app looks and moves, how the editor opens
 * Markdown, how much the app explains itself, and the model the assistant
 * writes with, stored with your preferences and applied at once. Then the app's connections: Anthropic and
 * OpenAI, each by a key or by the CLI you are signed in to, and the TypeSafe
 * key Jev grades with. The desktop app keeps keys in the system keychain; a
 * key in the environment always wins and shows as such.
 */
import { AI_PROVIDERS, type AiProviderId, type AiProviderInfo } from '@domain/ai.ts'
import type { EditorMode, Hints, Motion, Preferences, Theme } from '@domain/preferences.ts'
import { SECRETS, type SecretId, type Settings } from '@domain/secrets.ts'
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import { loadAi, useAi } from '../ai.ts'
import { api } from '../api.ts'
import { EmptyState, Field, FormSection, Loading, Screen, Toolbar } from '../components/layout.tsx'
import { ModelControls } from '../components/ModelControls.tsx'
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
  onWelcome: () => void
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

const HINTS = [
  { value: 'show', label: 'Show' },
  { value: 'hide', label: 'Hide' },
] as const satisfies ReadonlyArray<{ value: Hints; label: string }>

export function SettingsScreen({ toast, onSaved, onWelcome }: Props) {
  const preferences = usePreferences()
  const settings = useFetch(() => api.settings(), [])
  const { providers, choice } = useAi()
  const ids = { theme: useId(), motion: useId(), editor: useId(), hints: useId() }
  const choose = (patch: Partial<Preferences>) =>
    setPreferences(patch).catch((e: Error) => toast(`Not saved: ${e.message}`))

  /** After a key changes: its status, what the providers offer, and the open skill's state. */
  const keyChanged = async () => {
    settings.reload()
    await Promise.all([loadAi(), onSaved()])
  }
  const keys = (id: SecretId, missing: string, provider?: AiProviderInfo) =>
    settings.error && !settings.data ? (
      <EmptyState
        size="compact"
        title="Could not read the key’s status"
        actions={
          <Button type="button" variant="outline" onClick={settings.reload}>
            Try again
          </Button>
        }
      >
        {settings.error}
      </EmptyState>
    ) : !settings.data ? (
      <Loading />
    ) : (
      <KeyField
        id={id}
        settings={settings.data}
        missing={missing}
        optional={Boolean(provider)}
        problem={provider?.problem}
        toast={toast}
        onSaved={keyChanged}
      />
    )
  const provider = (id: AiProviderId) => providers?.find((p) => p.id === id)

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

      <FormSection
        title="Help"
        hint="The help button at the top right of every screen stays, whatever you choose here."
      >
        <Field>
          <Label id={ids.hints}>Screen hints</Label>
          <Segmented<Hints>
            aria-labelledby={ids.hints}
            value={preferences.hints}
            onChange={(hints) => hints && choose({ hints })}
            options={HINTS}
          />
          <Hint>
            A hint says what a screen is for, in one line under the top bar, the first time you open
            it.
          </Hint>
        </Field>
        <Toolbar>
          <Button
            type="button"
            variant="outline"
            disabled={!preferences.hintsSeen.length}
            onClick={() => choose({ hintsSeen: [] })}
          >
            Show every hint again
          </Button>
          <Button type="button" variant="outline" onClick={onWelcome}>
            Open the welcome
          </Button>
        </Toolbar>
      </FormSection>

      <FormSection
        title="Assistant"
        hint="The model that writes with you, in the side panel and beside every text area. Both change it too."
      >
        {!providers ? (
          <Loading />
        ) : choice ? (
          <ModelControls />
        ) : (
          <Status tone="warning" detail="Connect Anthropic or OpenAI below to choose a model.">
            Not connected
          </Status>
        )}
      </FormSection>

      <FormSection
        title="Anthropic"
        hint="Two ways to reach Claude. Use either, or both: each shows its own models."
      >
        <CliStatus info={provider('claude-code')} />
        {keys('anthropic', AI_PROVIDERS.anthropic.about, provider('anthropic'))}
      </FormSection>

      <FormSection
        title="OpenAI"
        hint="Two ways to reach OpenAI’s models. Use either, or both: each shows its own models."
      >
        <CliStatus info={provider('codex')} />
        {keys('openai', AI_PROVIDERS.openai.about, provider('openai'))}
      </FormSection>

      <FormSection
        title="Jev key"
        hint={
          <>
            Jev, the judge behind every pack, is a <Link href="https://typesafe.ai">TypeSafe</Link>{' '}
            model. Without a key, grading runs code checks only and every judged layer stays empty.
          </>
        }
      >
        {keys('jev', 'Grading uses code checks only.')}
      </FormSection>
    </Screen>
  )
}

/** A CLI the app can write through: found on this computer or not, and where to get it. */
function CliStatus({ info }: { info: AiProviderInfo | undefined }) {
  if (!info) return <Loading />
  const def = AI_PROVIDERS[info.id]
  if (def.via !== 'cli') return null
  return (
    <Field>
      <Status
        tone={info.connected ? 'success' : 'muted'}
        detail={info.connected ? def.about : null}
      >
        {info.connected ? `${def.label} is installed` : `${def.label} is not installed`}
      </Status>
      {info.connected ? null : (
        <Hint>
          <Link href={def.install}>Install {def.label}</Link> and sign in with the{' '}
          <Code>{def.command}</Code> command to write on your plan, with no key.
        </Hint>
      )}
    </Field>
  )
}

interface KeyFieldProps {
  id: SecretId
  settings: Settings
  /** What having no key means, shown beside "No key". */
  missing: string
  /** The app works without this key, so its absence is no warning. */
  optional: boolean
  /** Why a key that is set does not work, such as one the provider refused. */
  problem?: string | null
  toast: (message: string) => void
  onSaved: () => Promise<void>
}

/** One key: where it comes from, and a field to store or replace it. */
function KeyField({ id, settings, missing, optional, problem, toast, onSaved }: KeyFieldProps) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const field = useId()
  const { placeholder, launchEnv } = SECRETS[id]
  const { set, source } = settings.keys[id]

  const save = async (next: string) => {
    setBusy(true)
    try {
      await api.setKey(id, next)
      setValue('')
      toast(next ? 'Key saved' : 'Key removed')
      await onSaved()
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Field>
        <Status
          tone={!set ? (optional ? 'muted' : 'warning') : problem ? 'destructive' : 'success'}
          detail={
            source === 'environment'
              ? 'Set in the environment, so it wins over a stored one.'
              : source === 'stored'
                ? 'Stored in the system keychain.'
                : missing
          }
        >
          {source === 'environment'
            ? 'From the environment'
            : source === 'stored'
              ? 'In the keychain'
              : 'No key'}
        </Status>
        {set && problem ? <Hint tone="destructive">{problem}</Hint> : null}
      </Field>
      {settings.canStore ? (
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault()
            if (value.trim()) void save(value.trim())
          }}
        >
          <Field>
            <Label htmlFor={field}>
              {source === 'stored' ? 'Replace the stored key' : 'Store a key'}
            </Label>
            <Input
              id={field}
              type="password"
              autoComplete="off"
              spellCheck={false}
              data-1p-ignore
              value={value}
              placeholder={placeholder}
              onChange={(event) => setValue(event.target.value)}
            />
          </Field>
          <Toolbar>
            <Button type="submit" disabled={busy || !value.trim()}>
              {busy ? 'Saving…' : 'Save key'}
            </Button>
            {source === 'stored' ? (
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
          This host keeps no key of its own. Set <Code>{launchEnv}</Code> in the environment (or in{' '}
          <Code>.env</Code> when running from a checkout) and start it again.
        </Hint>
      )}
    </>
  )
}
