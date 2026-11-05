/**
 * The welcome in a window of its own, as the desktop app shows it. The window
 * holds the welcome and nothing else, so none of the app loads behind it. A
 * way out hands over to the app's window: the welcome fades while that one
 * comes up, and the main process closes this one once the app is in view.
 */
import { useState } from 'react'
import { api } from './api.ts'
import { Toast } from './components/Toast.tsx'
import { useToast } from './hooks.ts'
import { useStartPractice } from './practice.ts'
import { usePreferences } from './preferences.ts'
import { Welcome } from './screens/Welcome.tsx'

export function WelcomeApp() {
  const [toastShown, toast, dismissToast] = useToast()
  // Fixed when the window opens: the app marks the welcome seen as it opens, behind this one.
  const [first] = useState(!usePreferences().welcomed)
  const [leaving, setLeaving] = useState(false)
  const enter = (skill: string | null) => {
    setLeaving(true)
    api.enterApp?.(skill)
  }
  const [starting, startPractice] = useStartPractice(enter, toast)
  return (
    <>
      <Welcome
        first={first}
        starting={starting}
        leaving={leaving}
        onStart={startPractice}
        onLeave={() => enter(null)}
      />
      <Toast toast={toastShown} onDismiss={dismissToast} />
    </>
  )
}
