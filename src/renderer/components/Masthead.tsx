/**
 * The top of every screen: the app name, then whatever the screen puts beside
 * it, then its tabs. In the desktop app on macOS the title bar is hidden, so
 * the masthead doubles as the drag region and leaves room for the window buttons.
 */
import type { ReactNode } from 'react'
import { api } from '../api.ts'

const APP_NAME = 'Skill Studio'

export function Masthead({ children, tabs }: { children: ReactNode; tabs?: ReactNode }) {
  return (
    <header className="masthead" data-platform={api.platform}>
      <div className="topbar">
        <h1>{APP_NAME}</h1>
        {children}
      </div>
      {tabs}
    </header>
  )
}
