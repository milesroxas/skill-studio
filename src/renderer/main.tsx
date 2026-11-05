import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import { App } from './App.tsx'
import { loadPreferences } from './preferences.ts'
import './styles.css'

// The theme lands before the first render, so the app never paints in the wrong one.
await loadPreferences()
createRoot(document.getElementById('root')!).render(<App />)
