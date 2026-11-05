import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import { App } from './App.tsx'
import { loadAi, loadChat } from './ai.ts'
import { loadPreferences } from './preferences.ts'
import './styles.css'

// The theme lands before the first render, so the app never paints in the wrong one.
await loadPreferences()
// The assistant's providers answer in their own time; nothing waits on them.
void loadAi()
void loadChat().catch(() => {})
createRoot(document.getElementById('root')!).render(<App />)
