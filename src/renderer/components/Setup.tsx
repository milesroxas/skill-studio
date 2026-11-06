/**
 * The welcome's setup, after the tour: where your skills are, a model to
 * write with, and the judge's key. One thing per step, each in the welcome's
 * own window, with no trip to Settings.
 *
 * Every step checks first what Skill Studio can already reach, and asks only
 * for what is missing. All three checks start when the setup opens, so each
 * step has its answer by the time it is reached.
 *
 * The way forward is one button. While a step still has something to set up,
 * the step's own control is the filled one and the way forward reads
 * "Configure later". Once it is set, the way forward fills and reads
 * "Continue", or "Start practice" on the last step.
 */
import { AI_PROVIDERS, AI_VENDORS, type AiVendor, readyProviders } from '@domain/ai.ts'
import { isPractice } from '@domain/library.ts'
import { ArrowRightIcon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { loadAi, useAi } from '../ai.ts'
import { api } from '../api.ts'
import { SETUP_STEPS, type SetupId } from '../help.ts'
import { useFetch } from '../hooks.ts'
import { plural } from '../model.ts'
import { KeySlot, useKeys, VendorRoutes } from './Connections.tsx'
import { Folders } from './Folders.tsx'
import { Field, ReadFailed } from './layout.tsx'
import { Segmented } from './Segmented.tsx'
import { Status } from './Status.tsx'
import { Hint } from './text.tsx'
import { Button } from './ui/button.tsx'
import { Label } from './ui/label.tsx'
import { StepFrame, StepPanel } from './WelcomeStep.tsx'

type Toast = (message: string) => void

const VENDORS = AI_VENDORS.map((vendor) => ({ value: vendor, label: vendor }))

/** What the last step's way forward leads to, said beside it once everything is set. */
const PRACTICE_HINT =
  'Practice comes next: about five minutes, nothing to type, and it changes nothing your agents use.'

export function Setup({
  index,
  from,
  busy,
  toast,
  onShow,
  onBack,
  onStart,
}: {
  index: number
  from: number
  /** The practice skill is being opened, or the welcome is on its way out. */
  busy: boolean
  toast: Toast
  onShow: (index: number) => void
  /** Back from the first step, to the tour. */
  onBack: () => void
  /** On from the last step: open the practice skill. */
  onStart: () => void
}) {
  const library = useFetch(() => api.library(), [])
  const { keys, changed } = useKeys()
  const { providers } = useAi()
  // This window may be the only one open: nothing else has asked the providers yet.
  useEffect(() => void loadAi(), [])

  const found = library.data?.skills.filter((s) => !isPractice(s)).length ?? 0
  const done: Record<SetupId, boolean> = {
    folders: Boolean(library.data && (found > 0 || library.data.workspaces.length > 0)),
    assistant: Boolean(providers && readyProviders(providers).length > 0),
    jev: Boolean(keys.data?.keys.jev.set),
  }

  const step = SETUP_STEPS[index]
  const last = index === SETUP_STEPS.length - 1
  const set = done[step.id]
  const saveFolders = (list: string[], said: string) =>
    api.setWorkspaces(list).then(
      () => {
        toast(said)
        library.reload()
      },
      (e: Error) => toast(e.message),
    )

  return (
    <StepFrame
      label="Set up"
      id={step.id}
      index={index}
      from={from}
      title={step.title}
      say={step.say}
      hint={
        set
          ? last
            ? PRACTICE_HINT
            : null
          : last
            ? `${step.later} Practice comes next.`
            : step.later
      }
      back={
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => (index === 0 ? onBack() : onShow(index - 1))}
        >
          Back
        </Button>
      }
      next={
        // One button on every step, so it keeps the focus and its place from the first step to the last.
        <Button
          type="button"
          variant={set ? 'default' : 'outline'}
          autoFocus
          disabled={busy}
          onClick={() => (last ? onStart() : onShow(index + 1))}
        >
          {!set ? (
            'Configure later'
          ) : !last ? (
            <>
              Continue
              <ArrowRightIcon aria-hidden="true" />
            </>
          ) : busy ? (
            'Starting…'
          ) : (
            'Start practice'
          )}
        </Button>
      }
    >
      <StepPanel>
        {step.id === 'folders' ? (
          library.error && !library.data ? (
            <ReadFailed size="compact" title="Could not look for skills" onRetry={library.reload}>
              {library.error}
            </ReadFailed>
          ) : !library.data ? (
            <Status tone="muted">Looking for skills…</Status>
          ) : (
            <>
              <Status
                tone={found ? 'success' : 'muted'}
                detail={found ? null : 'Add the folder your projects live in.'}
              >
                {found ? `${plural(found, 'skill')} found` : 'No skills found yet'}
              </Status>
              <Folders
                workspaces={library.data.workspaces}
                save={saveFolders}
                toast={toast}
                variant={set ? 'outline' : 'default'}
              />
            </>
          )
        ) : step.id === 'assistant' ? (
          <Assistant keys={keys} toast={toast} onSaved={changed} />
        ) : (
          <KeySlot
            id="jev"
            keys={keys}
            missing="Grading runs code checks only."
            optional={false}
            replace={false}
            toast={toast}
            onSaved={changed}
          />
        )}
      </StepPanel>
    </StepFrame>
  )
}

/**
 * A model to write with: the ones ready now, or, when there is none, both
 * ways to reach one vendor's models, one vendor at a time.
 */
function Assistant({
  keys,
  toast,
  onSaved,
}: {
  keys: ReturnType<typeof useKeys>['keys']
  toast: Toast
  onSaved: () => Promise<void>
}) {
  const { providers, problem } = useAi()
  const [vendor, setVendor] = useState<AiVendor>(AI_VENDORS[0])
  const label = useId()

  if (problem && !providers)
    return (
      <ReadFailed size="compact" title="Could not check for a model" onRetry={() => void loadAi()}>
        {problem}
      </ReadFailed>
    )
  if (!providers) return <Status tone="muted">Checking for a model…</Status>

  const ready = readyProviders(providers)
  if (ready.length)
    return (
      <>
        {ready.map((p) => (
          <Status key={p.id} tone="success" detail={AI_PROVIDERS[p.id].about}>
            {AI_PROVIDERS[p.id].label} is ready
          </Status>
        ))}
        <Hint>Settings can connect another, or change the model.</Hint>
      </>
    )

  return (
    <>
      <Status tone="warning" detail="Connect one to write with the assistant.">
        No model connected
      </Status>
      <Field>
        <Label id={label}>Connect</Label>
        <Segmented<AiVendor>
          aria-labelledby={label}
          value={vendor}
          onChange={(next) => next && setVendor(next)}
          options={VENDORS}
        />
      </Field>
      <VendorRoutes vendor={vendor} keys={keys} replace={false} toast={toast} onSaved={onSaved} />
    </>
  )
}
