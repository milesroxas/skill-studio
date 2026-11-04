/**
 * The top of every screen: the app name, then whatever the screen puts beside
 * it, then its tabs. In the desktop app on macOS the title bar is hidden, so
 * the masthead doubles as the drag region and leaves room for the window buttons.
 * On wide screens it stays put and lets content pass under it.
 */
import type { ReactNode } from 'react'
import { api } from '../api.ts'
import { Text } from './text.tsx'
import { Button } from './ui/button.tsx'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs.tsx'

const APP_NAME = 'Skill Studio'

export function Masthead({ children, tabs }: { children: ReactNode; tabs?: ReactNode }) {
  return (
    <header
      data-slot="masthead"
      data-platform={api.platform}
      className="border-b bg-background pt-[env(safe-area-inset-top,0px)] pr-[max(16px,env(safe-area-inset-right,0px))] pl-[max(16px,env(safe-area-inset-left,0px))] data-[platform=darwin]:pl-[84px] md:sticky md:top-0 md:z-header md:bg-background/80 md:backdrop-blur-md md:backdrop-saturate-150"
    >
      <div className="flex min-h-12 flex-wrap items-center gap-3 in-data-[platform=darwin]:min-h-13">
        <h1 className="m-0 font-mono text-[13px] font-semibold tracking-tight">{APP_NAME}</h1>
        {children}
      </div>
      {tabs}
    </header>
  )
}

export interface Crumb {
  label: string
  go: () => void
}

/** Where the reader is: the places above, then the current one. */
export function Crumbs({
  path,
  current,
  title,
}: {
  path: Crumb[]
  current: ReactNode
  title?: string
}) {
  return (
    <nav aria-label="Location" className="flex min-w-0 items-center gap-2">
      {path.map((crumb) => (
        <span key={crumb.label} className="contents">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-mx-1.5 px-1.5 text-muted-foreground"
            onClick={crumb.go}
          >
            {crumb.label}
          </Button>
          <Text tone="faint" aria-hidden="true">
            /
          </Text>
        </span>
      ))}
      <Text weight="semibold" truncate aria-current="page" title={title}>
        {current}
      </Text>
    </nav>
  )
}

export interface Step {
  id: string
  label: string
  /** Its status, shown small beside the label. */
  meta?: string | null
}

/** The loop as numbered tabs, left to right, each with its status. */
export function StepTabs({
  steps,
  value,
  onChange,
}: {
  steps: Step[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <Tabs value={value} onValueChange={onChange}>
      <TabsList
        variant="line"
        aria-label="Steps"
        className="-mx-2 h-10 w-full justify-start overflow-x-auto overscroll-x-contain [scrollbar-width:none]"
      >
        {steps.map((step, i) => (
          <TabsTrigger key={step.id} value={step.id} className="flex-none gap-1.5">
            <Text tone="faint" font="mono" size="xs" weight="medium">
              {i + 1}
            </Text>
            {step.label}
            {step.meta ? (
              <Text tone="faint" size="xs" tabular>
                {step.meta}
              </Text>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
