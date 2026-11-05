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
