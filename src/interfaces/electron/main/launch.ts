/**
 * What a window loads and where it stands, worked out without Electron so it
 * can be tested.
 */

/** A place in the page for a window to open on. */
export interface Target {
  /** The skill to open, by path. */
  skill?: string
  /** The screen to show, as the page names it in its hash. */
  screen?: string
}

/**
 * The page's URL for a place in it. The skill rides in the query, where the
 * page reads it once and remembers it; the screen is the hash the page routes by.
 */
export function pageUrl(base: string, { skill, screen }: Target = {}): string {
  const url = new URL(base)
  if (skill) url.searchParams.set('skill', skill)
  if (screen) url.hash = `/${screen}`
  return url.toString()
}

export interface Size {
  width: number
  height: number
}

export interface Area extends Size {
  x: number
  y: number
}

/**
 * Where a window of `size` stands over `anchor`, kept whole inside `bounds`.
 * It is centered side to side. `rise` says how much of the spare height goes
 * above it: half over another window, less on an empty display, where a window
 * in the exact middle reads as sitting low. A display smaller than the window
 * shrinks it.
 */
export function placed(size: Size, anchor: Area, bounds: Area, rise = 0.5): Area {
  const width = Math.min(size.width, bounds.width)
  const height = Math.min(size.height, bounds.height)
  const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high)
  return {
    x: Math.round(
      clamp(anchor.x + (anchor.width - width) / 2, bounds.x, bounds.x + bounds.width - width),
    ),
    y: Math.round(
      clamp(
        anchor.y + (anchor.height - height) * rise,
        bounds.y,
        bounds.y + bounds.height - height,
      ),
    ),
    width,
    height,
  }
}

/** The window bounds a saved file holds, or null when its text is damaged. */
export function boundsOf(text: string): Area | null {
  try {
    const { x, y, width, height } = (JSON.parse(text) ?? {}) as Partial<Area>
    return [x, y, width, height].every(Number.isFinite) ? ({ x, y, width, height } as Area) : null
  } catch {
    return null
  }
}

/**
 * The dev server's address, for a development copy only. A packaged app loads
 * its page from its own archive whatever its environment says: the variable
 * would otherwise hand the preload's bridge to any page it names.
 */
export const devUrlOf = (
  packaged: boolean,
  env: Readonly<Record<string, string | undefined>>,
): string | undefined => (packaged ? undefined : env.ELECTRON_RENDERER_URL || undefined)

/**
 * Chromium switches that open the page, and with it the preload's bridge, to
 * a debugger outside the app. Node's own (`--inspect` and the like,
 * `NODE_OPTIONS`) are turned off by the fuses in electron-builder.yml; these
 * are Chromium's, which no fuse covers.
 */
const DEBUG_SWITCHES = [
  'remote-debugging-port',
  'remote-debugging-pipe',
  'remote-debugging-address',
  'remote-allow-origins',
] as const

/**
 * True when a packaged app was started with a switch that opens it to a
 * debugger: it then quits before it opens a window. A development copy is
 * debugged from outside as a matter of course, so there every switch stands.
 */
export const opensToDebugger = (packaged: boolean, hasSwitch: (name: string) => boolean): boolean =>
  packaged && DEBUG_SWITCHES.some((name) => hasSwitch(name))
