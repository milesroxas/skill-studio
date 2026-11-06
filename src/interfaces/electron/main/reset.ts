/**
 * Starting over without leaving the app: the windows close, the backend
 * stops, what the app keeps is deleted, and the app opens as it does the first
 * time. The order is the point. A page or a backend still running would write
 * its state back after the delete, so both are gone before anything is removed.
 *
 * The steps come in from outside and nothing here imports Electron, so the
 * order is tested with stand-ins.
 */

export interface ResetSteps {
  /** Close every window at once, with nothing saved on the way out. */
  closeWindows(): void
  /** Stop the backend; resolves once its process is gone. */
  stopBackend(): Promise<void>
  /** Delete what the app keeps: its own folder, the window's place, the page's storage. */
  clear(): Promise<void>
  /** Start the backend again and show what a launch shows. */
  open(): void
  /** Say that the reset failed. No window is left to say it in. */
  report(error: unknown): void
}

export interface Reset {
  /** Start over. A call while a reset is under way joins it. */
  run(): Promise<void>
  /** True from the moment the windows close until the app opens again. */
  running(): boolean
}

export function createReset(steps: ResetSteps): Reset {
  let running = false
  let current: Promise<void> = Promise.resolve()

  const reset = async (): Promise<void> => {
    try {
      steps.closeWindows()
      await steps.stopBackend()
      await steps.clear()
    } catch (error) {
      steps.report(error)
    } finally {
      // Whatever happened, the app is never left with no window and no backend.
      running = false
      steps.open()
    }
  }

  return {
    run: () => {
      if (!running) {
        running = true
        current = reset()
      }
      return current
    },
    running: () => running,
  }
}
