import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import { api } from './api.ts'
import { loadPreferences } from './preferences.ts'
import { placeOf } from './route.ts'
import { loadUpdates } from './updates.ts'
import './styles.css'

// The theme lands before the first render, so the app never paints in the wrong one.
// So does where the app's updates stand: a window never shows a state it is not in.
await Promise.all([loadPreferences(), loadUpdates()])
const root = createRoot(document.getElementById('root')!)

// The desktop app opens the welcome in a small window of its own. That window
// loads the welcome alone: it is the first thing a newcomer sees, so it should
// not wait on the app behind it.
const { screen } = placeOf(window.location.hash)
if (api.openWelcome && screen === 'welcome') {
  document.title = 'Welcome to Skill Studio'
  const { WelcomeApp } = await import('./WelcomeApp.tsx')
  root.render(<WelcomeApp />)
} else if (api.updates && screen === 'changelog') {
  // The changelog has a window of its own too, and loads as little.
  document.title = 'What’s New'
  const { ChangelogApp } = await import('./ChangelogApp.tsx')
  root.render(<ChangelogApp />)
} else {
  const [{ App }, { loadAi, loadChat }] = await Promise.all([
    import('./App.tsx'),
    import('./ai.ts'),
  ])
  // The assistant's providers answer in their own time; nothing waits on them.
  void loadAi()
  void loadChat().catch(() => {})
  root.render(<App />)
}
