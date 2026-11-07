/**
 * The changelog in a window of its own, as the desktop app shows it. The
 * window holds the changelog and nothing else, so it opens at once: none of
 * the app loads behind it. It takes the same update steps as the app's own
 * window, with the same question before a restart.
 */
import { useConfirm } from './components/confirm.tsx'
import { useNotice } from './hooks.ts'
import { Changelog } from './screens/Changelog.tsx'
import { useUpdateStep } from './updates.ts'

export function ChangelogApp() {
  const [notice, report, dismissNotice] = useNotice()
  const [confirm, confirmDialog] = useConfirm()
  const step = useUpdateStep(confirm, report)
  return (
    <>
      <Changelog onStep={step} notice={notice} onDismiss={dismissNotice} />
      {confirmDialog}
    </>
  )
}
