/**
 * The changelog in a window of its own, as the desktop app shows it. The
 * window holds the changelog and nothing else, so it opens at once: none of
 * the app loads behind it. It takes the same update steps as the app's own
 * window, with the same question before a restart.
 */
import { useConfirm } from './components/confirm.tsx'
import { Toast } from './components/Toast.tsx'
import { useToast } from './hooks.ts'
import { Changelog } from './screens/Changelog.tsx'
import { useUpdateStep } from './updates.ts'

export function ChangelogApp() {
  const [toastShown, toast, dismissToast] = useToast()
  const [confirm, confirmDialog] = useConfirm()
  const step = useUpdateStep(confirm, toast)
  return (
    <>
      <Changelog onStep={step} />
      <Toast toast={toastShown} onDismiss={dismissToast} />
      {confirmDialog}
    </>
  )
}
