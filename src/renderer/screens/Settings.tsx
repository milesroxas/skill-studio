/**
 * Settings. Yours first: how the app looks and moves, how the editor opens
 * Markdown, how much the app explains itself, whether it looks for its own
 * updates, and the model the assistant writes with, stored with your
 * preferences and applied at once. Then the app's connections: Anthropic and
 * OpenAI, each by its CLI first and by an API key as well, and the TypeSafe
 * key Jev grades with. The desktop app keeps keys in the system keychain; a
 * key in the environment always wins and shows as such. Last, in a copy made
 * for testing only, the way to start the app over.
 */
import { AI_PROVIDERS, AI_VENDORS, mainProviderOf } from '@domain/ai.ts'
import type {
  EditorMode,
  Hints,
  Motion,
  Preferences,
  Theme,
  UpdateMode,
} from '@domain/preferences.ts'
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import { loadAi, useAi } from '../ai.ts'
import { api } from '../api.ts'
import { KeySlot, NO_JEV_KEY, useKeys, VendorRoutes } from '../components/Connections.tsx'
import { Field, FormSection, Loading, ReadFailed, Screen, Toolbar } from '../components/layout.tsx'
import { ModelControls } from '../components/ModelControls.tsx'
import { ResetDialog } from '../components/ResetDialog.tsx'
import { Segmented } from '../components/Segmented.tsx'
import { Status } from '../components/Status.tsx'
import { Hint, Link } from '../components/text.tsx'
import { Button } from '../components/ui/button.tsx'
import { Label } from '../components/ui/label.tsx'
import type { Reporter } from '../hooks.ts'
import { savePreference, usePreferences } from '../preferences.ts'
import { APP_VERSION, checkForUpdates } from '../updates.ts'

interface Props {
  /** A run is going: starting over would stop it, and the question says so. */
  running: boolean
  report: Reporter
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

const UPDATE_MODES = [
  { value: 'auto', label: 'Automatically' },
  { value: 'manual', label: 'When I ask' },
] as const satisfies ReadonlyArray<{ value: UpdateMode; label: string }>

export function SettingsScreen({ running, report, onSaved, onWelcome }: Props) {
  const preferences = usePreferences()
  const { keys, changed } = useKeys(onSaved)
  const { providers, choice, problem } = useAi()
  const ids = {
    theme: useId(),
    motion: useId(),
    editor: useId(),
    hints: useId(),
    updates: useId(),
  }
  const choose = (patch: Partial<Preferences>) => savePreference(patch, report)

  return (
    <Screen width="form">
      <FormSection title="Appearance">
        <Field>
          <Label id={ids.theme}>Theme</Label>
          <Segmented<Theme>
            aria-labelledby={ids.theme}
            value={preferences.theme}
            onChange={(theme) => theme && choose({ theme })}
            options={THEMES}
          />
          <Hint>System follows your computer’s setting.</Hint>
        </Field>
        <Field>
          <Label id={ids.motion}>Motion</Label>
          <Segmented<Motion>
            aria-labelledby={ids.motion}
            value={preferences.motion}
            onChange={(motion) => motion && choose({ motion })}
            options={MOTIONS}
          />
          <Hint>Reduce turns off animations.</Hint>
        </Field>
      </FormSection>

      <FormSection title="Editor">
        <Field>
          <Label id={ids.editor}>Open Markdown as</Label>
          <Segmented<EditorMode>
            aria-labelledby={ids.editor}
            value={preferences.editorMode}
            onChange={(editorMode) => editorMode && choose({ editorMode })}
            options={EDITOR_MODES}
          />
          <Hint>Formatted shows headings and lists styled. Markdown shows the plain text.</Hint>
        </Field>
      </FormSection>

      <FormSection title="Help">
        <Field>
          <Label id={ids.hints}>Screen hints</Label>
          <Segmented<Hints>
            aria-labelledby={ids.hints}
            value={preferences.hints}
            onChange={(hints) => hints && choose({ hints })}
            options={HINTS}
          />
          <Hint>A hint is one line under the top bar that says what a screen is for.</Hint>
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

      {/* A browser has no app to update: `st serve` moves with the checkout it runs from. */}
      {api.updates ? (
        <FormSection title="Updates" hint={`You have Skill Studio ${APP_VERSION}.`}>
          <Field>
            <Label id={ids.updates}>Look for new versions</Label>
            <Segmented<UpdateMode>
              aria-labelledby={ids.updates}
              value={preferences.updates}
              onChange={(updates) => updates && choose({ updates })}
              options={UPDATE_MODES}
            />
            <Hint>
              Automatically checks when the app opens and every few hours, and downloads in the
              background. You choose when to restart. Nothing about you or your skills is sent.
            </Hint>
          </Field>
          <Toolbar>
            <Button type="button" variant="outline" onClick={checkForUpdates}>
              Check for updates
            </Button>
          </Toolbar>
        </FormSection>
      ) : null}

      <FormSection title="Assistant" hint="The AI model that writes with you.">
        {problem ? (
          <ReadFailed
            size="compact"
            title="Could not read the providers"
            onRetry={() => void loadAi()}
          >
            {problem}
          </ReadFailed>
        ) : !providers ? (
          <Loading />
        ) : choice ? (
          <ModelControls />
        ) : (
          <Status tone="warning" detail="Set up Claude Code or Codex below to choose a model.">
            Not connected
          </Status>
        )}
      </FormSection>

      {AI_VENDORS.map((vendor) => (
        <FormSection
          key={vendor}
          title={vendor}
          hint={`${AI_PROVIDERS[mainProviderOf(vendor)].label} runs on your own account, with no key. An API key works too.`}
        >
          <VendorRoutes vendor={vendor} keys={keys} report={report} onSaved={changed} />
        </FormSection>
      ))}

      <FormSection
        title="Jev key"
        hint={
          <>
            Jev grades every output against your rules and checks. It needs a{' '}
            <Link href="https://typesafe.ai">TypeSafe</Link> key.
          </>
        }
      >
        <KeySlot
          id="jev"
          keys={keys}
          missing={NO_JEV_KEY}
          optional={false}
          report={report}
          onSaved={changed}
        />
      </FormSection>

      {/* Only a copy made for testing can start over: a development build, or a prerelease. */}
      {api.reset ? <StartOver reset={api.reset} running={running} report={report} /> : null}
    </Screen>
  )
}

/**
 * The way back to a first launch, to test a release as a newcomer meets it.
 * The button only asks: the dialog says what goes and what stays.
 */
function StartOver({
  reset,
  running,
  report,
}: {
  reset: () => Promise<void>
  running: boolean
  report: Reporter
}) {
  const [asking, setAsking] = useState(false)
  const [resetting, setResetting] = useState(false)
  const confirm = () => {
    setAsking(false)
    setResetting(true)
    // When it works this window closes with the rest, so only a refusal comes back.
    reset().catch((e: Error) => {
      report(`Not reset: ${e.message}`, { tone: 'destructive' })
      setResetting(false)
    })
  }

  return (
    <FormSection
      title="Start over"
      hint="Put Skill Studio back to how it opens the first time, to test a release from its first launch. Only test versions have this."
    >
      <Toolbar>
        <Button
          type="button"
          variant="destructive-outline"
          busy={resetting}
          busyLabel="Resetting…"
          onClick={() => setAsking(true)}
        >
          Reset Skill Studio…
        </Button>
      </Toolbar>
      <ResetDialog
        open={asking}
        running={running}
        onCancel={() => setAsking(false)}
        onConfirm={confirm}
      />
    </FormSection>
  )
}
