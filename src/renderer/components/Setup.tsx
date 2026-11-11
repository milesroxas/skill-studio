/**
 * The welcome's one setup step, before the walkthrough: Jev's key, which
 * grades the practice skill's notes. The welcome shows it only while the key
 * is missing. Everything else the app can connect waits for where it is first
 * needed: where skills are found in the Library, a model in Write with AI, and
 * all of it in Settings.
 *
 * The way forward is one button. While the key is missing, the key's own
 * control is the filled one and the way forward reads "Configure later". Once
 * it is set, the way forward fills and reads "Start the walkthrough".
 */
import { SETUP_STEP } from '../help.ts'
import type { Reporter } from '../hooks.ts'
import { KeySlot, NO_JEV_KEY, type useKeys } from './Connections.tsx'
import { StepFrame, StepPanel } from './WelcomeStep.tsx'

export function Setup({
  keys,
  changed,
  busy,
  report,
  onBack,
  onStart,
}: ReturnType<typeof useKeys> & {
  /** The practice skill is being opened, or the welcome is on its way out. */
  busy: boolean
  report: Reporter
  /** Back to where the reader came from: the opening or the tour. */
  onBack: () => void
  /** On: open the walkthrough. */
  onStart: () => void
}) {
  const set = Boolean(keys.data?.keys.jev.set)
  return (
    <StepFrame
      label="Set up"
      id="jev"
      title={SETUP_STEP.title}
      say={SETUP_STEP.say}
      busy={busy}
      onBack={onBack}
      next={{
        variant: set ? 'default' : 'outline',
        label: set ? 'Start the walkthrough' : 'Configure later',
        onClick: onStart,
        busyLabel: 'Starting…',
      }}
    >
      <StepPanel>
        <KeySlot
          id="jev"
          keys={keys}
          missing={NO_JEV_KEY}
          optional={false}
          replace={false}
          report={report}
          onSaved={changed}
        />
      </StepPanel>
    </StepFrame>
  )
}
