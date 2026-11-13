/**
 * Where a file a sample wrote is served, and the sizes a page is rendered at
 * for grading. Pure: the app's scheme, the web server and the renderer build
 * and read the same addresses.
 *
 * A file is addressed by path, `/<skill>/<run>/<sample>/<file>`, so a page the
 * agent wrote loads the files beside it by their relative names, as it would
 * from disk: `app.js` beside `outputs/index.html` is
 * `/<skill>/<run>/<sample>/outputs/app.js`.
 */
import type { PageLayout } from './layout.ts'

/** One file of one sample. `skill` is the skill's path, or empty for the first one served. */
export interface ArtifactAddress {
  skill: string
  run: string
  sample: string
  /** Sample-relative, such as `outputs/index.html`. */
  file: string
}

/**
 * The meta tag `st serve` puts in the app's page, holding the key a sample's
 * file is asked for under (`/api/artifact/<key>/...`): a page an agent wrote
 * loads the files beside it with no cookie, so the key in the path stands in.
 */
export const ARTIFACT_KEY_META = 'skill-studio-artifact-key'

/** The query a page is asked for with when Results shows it on the stage: see `withStageBridge`. */
export const STAGE_PARAM = 'stage'

/** The path of a file, every part encoded; the skill's own slashes stay inside its first segment. */
export function artifactPath(address: ArtifactAddress): string {
  const head = [address.skill, address.run, address.sample].map(encodeURIComponent)
  const file = address.file.split('/').map(encodeURIComponent)
  return `/${[...head, ...file].join('/')}`
}

/** The file a path names; null for a path that is not one: too short, or not decodable. */
export function artifactAddress(pathname: string): ArtifactAddress | null {
  const parts = pathname.split('/').slice(1)
  if (parts.length < 4) return null
  try {
    const [skill, run, sample, ...file] = parts.map(decodeURIComponent)
    if (!run || !sample || file.some((part) => !part)) return null
    return { skill, run, sample, file: file.join('/') }
  } catch {
    return null
  }
}

/** A size a page is rendered at, for the grading to look at. */
export interface RenderSize {
  id: 'desktop' | 'phone'
  width: number
  height: number
}

/**
 * The two widths a page is looked at. Each side stays inside what Jev reads
 * (280 to 1568 pixels), and the phone is tall so more of the page shows.
 */
export const RENDER_SIZES: readonly RenderSize[] = [
  { id: 'desktop', width: 1280, height: 960 },
  { id: 'phone', width: 390, height: 1200 },
]

/** A page as one window drew it. */
export interface DrawnPage {
  /** A PNG of exactly the window's pixels, scaled down whole when a side is past the 1568 Jev reads. */
  png: Uint8Array
  /** The elements the window drew, as it measured them; null when the page could not be measured. */
  layout: PageLayout | null
}

/**
 * Draws a page a sample wrote in a window of one size, and measures what it
 * drew. Only the desktop app has a browser to draw with; the CLI and
 * `st serve` grade without one.
 */
export type PageRenderer = (
  page: ArtifactAddress,
  size: { width: number; height: number },
) => Promise<DrawnPage>
