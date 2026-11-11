/**
 * The desktop app's own updates, as a window sees them: the state the main
 * process holds, kept in step by what it pushes, and the one step each state
 * offers. A browser has no app to update. There the state is `unsupported`
 * for good, and nothing here reaches out.
 */
import { newlyReady, stepFor, type UpdateState, type UpdateStep } from '@domain/update.ts'
import { useCallback, useEffect, useRef } from 'react'
import { homepage } from '../../package.json'
import { api } from './api.ts'
import type { Confirm } from './components/confirm.tsx'
import type { Reporter } from './hooks.ts'
import { createStore, useStore } from './store.ts'

const host = api.updates

/** The version running, as the updater knows it. Empty in a browser, which shows it nowhere. */
export const APP_VERSION = host?.version ?? ''
export const RELEASES_URL = `${homepage}/releases`
/** One release's page on GitHub, for notes the app cannot show itself. */
export const releaseUrl = (release: string): string => `${RELEASES_URL}/tag/v${release}`

const updates = createStore<UpdateState>({ status: 'unsupported' })
const set = updates.set

/**
 * Ask where the updates stand, and keep in step from then on. Call before the
 * first render, so no window paints a state it is not in.
 */
export async function loadUpdates(): Promise<void> {
  if (!host) return
  host.watch(set)
  try {
    set(await host.request('state'))
  } catch {
    // A host that cannot answer shows no update.
  }
}

export function useUpdate(): UpdateState {
  return useStore(updates)
}

const STEP_LABELS: Record<UpdateStep, string> = {
  check: 'Check for updates',
  download: 'Download update',
  install: 'Restart to update',
}

/** The one step a state offers, and what the button that takes it says. */
export interface UpdateOffer {
  step: UpdateStep
  label: string
}

export function offerOf(state: UpdateState): UpdateOffer | null {
  const step = stepFor(state)
  if (!step) return null
  return { step, label: state.status === 'error' ? 'Try again' : STEP_LABELS[step] }
}

/** One step at a time: a second click while the first is being asked about does nothing. */
let taking = false

/**
 * Take a step. A restart ends whatever the app is running, so it asks first
 * when something is.
 */
async function take(step: UpdateStep, confirm: Confirm): Promise<void> {
  if (!host || taking) return
  taking = true
  try {
    if (step === 'install') {
      const running = (await api.jobs()).some((job) => job.status === 'running')
      const agreed =
        !running ||
        (await confirm({
          title: 'Restart while a run is going?',
          description: 'Restarting stops the run. You can also update later: it waits for you.',
          action: 'Restart',
          destructive: true,
        }))
      if (!agreed) return
    }
    set(await host.request(step))
  } finally {
    taking = false
  }
}

/** A way to take an update step from a button: it asks before a restart, and says when it fails. */
export function useUpdateStep(confirm: Confirm, report: Reporter): (step: UpdateStep) => void {
  return useCallback((step) => void take(step, confirm).catch(report), [confirm, report])
}

/** Open the changelog's window and look for a newer release; the window shows the check as it runs. */
export function checkForUpdates(): void {
  if (!host) return
  host.openChangelog()
  void host.request('check').then(set, () => {})
}

const VERSION_KEY = 'skill-studio.version'

/**
 * True once, in the first window opened after an update: the version running
 * is not the one this computer last ran.
 */
function takeUpdatedNotice(): boolean {
  const last = localStorage.getItem(VERSION_KEY)
  localStorage.setItem(VERSION_KEY, APP_VERSION)
  return host !== undefined && last !== null && last !== APP_VERSION
}

/**
 * The two moments worth a notice in the app's window. An update ready to
 * install, when its download finishes and whenever the window opens on one: it
 * stays on the status line until dismissed, since the download ends on its own
 * time and a passing notice is easy to miss. And the first launch of a new
 * version: it worked, and here is what changed.
 */
export function useUpdateNotices(report: Reporter, take: (step: UpdateStep) => void): void {
  const state = useUpdate()
  // Null until the first look, so a window that opens on a ready update says so.
  const before = useRef<UpdateState['status'] | null>(null)

  useEffect(() => {
    if (takeUpdatedNotice())
      report(`Updated to Skill Studio ${APP_VERSION}`, {
        action: { label: 'What’s new', run: () => host?.openChangelog() },
      })
  }, [report])

  useEffect(() => {
    const ready = newlyReady(before.current, state)
    before.current = state.status
    if (ready)
      report(`Skill Studio ${ready.version} is ready to install`, {
        action: { label: 'Restart', run: () => take('install') },
        stays: true,
      })
  }, [state, report, take])
}
