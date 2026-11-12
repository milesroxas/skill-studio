/**
 * Write the notices for the open-source code the packaged app ships, so it
 * carries each package's license text as those licenses require. `pnpm build`
 * runs it after `electron-vite build`, and electron-builder copies the file into
 * the app's resources folder (`extraResources` in electron-builder.yml).
 *
 * Two kinds of package ship:
 * - bundled: code Vite folded into `out/main`, `out/preload` and `out/renderer`.
 *   Each build writes the packages it bundled to `.vite/licenses.json` (`build.license`
 *   in electron.vite.config.ts).
 * - inlined: packages a stylesheet in `src/renderer` names in an `@import` or
 *   `@plugin`, which Tailwind folds into the CSS where Vite cannot see them. The
 *   script reads the stylesheets, so a new import is listed with no change here.
 * - installed: every `dependencies` entry and what it needs in turn, which
 *   electron-builder copies into the app as they are.
 *
 * Electron's and Chromium's notices are not listed here: electron-builder keeps
 * them in the app as `LICENSE.electron.txt` and `LICENSES.chromium.html`.
 *
 * It fails when a shipped package has neither a license name nor a license file,
 * so nothing goes out whose terms are unknown.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

type Notice = { name: string; version: string; identifier?: string; text?: string }

type Manifest = {
  name: string
  version?: string
  license?: string | { type?: string }
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

const root = join(import.meta.dirname, '..')
const output = join(root, 'out', 'licenses', 'THIRD-PARTY-LICENSES.txt')
const BUILDS = ['main', 'preload', 'renderer']
const LICENSE_FILE = /^(licen[cs]e|copying)/i
const RENDERER = join(root, 'src', 'renderer')
/** `@import "pkg";`, `@import 'pkg/file.css';`, `@plugin "pkg";`: a package, not a path or a URL. */
const CSS_PACKAGE = /@(?:import|plugin)\s+(?:url\(\s*)?["']([^"'./][^"':]*)["']/g

const readManifest = (dir: string): Manifest =>
  JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Manifest

/** The folder of `name` as Node would find it from `from`: the nearest `node_modules` holding it. */
function findPackage(name: string, from: string): string | null {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate)
    if (dirname(dir) === dir) return null
  }
}

function noticeOf(dir: string): Notice {
  const { name, version = '0.0.0', license } = readManifest(dir)
  const identifier = typeof license === 'string' ? license : license?.type
  const file = readdirSync(dir).find((entry) => LICENSE_FILE.test(entry))
  return {
    name,
    version,
    ...(identifier ? { identifier: identifier.trim() } : {}),
    ...(file ? { text: readFileSync(join(dir, file), 'utf8').trim() } : {}),
  }
}

/** Every package in the production dependency tree, as electron-builder packs it. */
function installed(): Notice[] {
  const seen = new Set<string>()
  const notices: Notice[] = []
  const visit = (dir: string, required: string[], optional: string[]): void => {
    for (const name of [...required, ...optional]) {
      const found = findPackage(name, dir)
      if (found === null) {
        if (optional.includes(name)) continue
        throw new Error(`${name}, needed by ${readManifest(dir).name}, is not installed.`)
      }
      if (seen.has(found)) continue
      seen.add(found)
      notices.push(noticeOf(found))
      const manifest = readManifest(found)
      visit(
        found,
        Object.keys(manifest.dependencies ?? {}),
        Object.keys(manifest.optionalDependencies ?? {}),
      )
    }
  }
  const manifest = readManifest(root)
  visit(
    root,
    Object.keys(manifest.dependencies ?? {}),
    Object.keys(manifest.optionalDependencies ?? {}),
  )
  return notices
}

function bundled(): Notice[] {
  return BUILDS.flatMap((build) => {
    const file = join(root, 'out', build, '.vite', 'licenses.json')
    if (!existsSync(file)) throw new Error(`${file} is missing. Run electron-vite build first.`)
    return JSON.parse(readFileSync(file, 'utf8')) as Notice[]
  })
}

/** A package's name from what an import names: `@scope/pkg/x.css` is `@scope/pkg`, `pkg/x.css` is `pkg`. */
const packageName = (specifier: string): string =>
  specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/')

function inlined(): Notice[] {
  const sheets = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' }).filter((file) =>
    file.endsWith('.css'),
  )
  return sheets.flatMap((sheet) => {
    const css = readFileSync(join(RENDERER, sheet), 'utf8')
    return [...css.matchAll(CSS_PACKAGE)].map(([, specifier = '']) => {
      const name = packageName(specifier)
      const found = findPackage(name, root)
      if (found === null) throw new Error(`${name}, imported by ${sheet}, is not installed.`)
      return noticeOf(found)
    })
  })
}

const byKey = new Map<string, Notice>()
for (const notice of [...bundled(), ...inlined(), ...installed()]) {
  const key = `${notice.name}@${notice.version}`
  if (!byKey.has(key)) byKey.set(key, notice)
}
const notices = [...byKey.values()].sort(
  (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
)

const unknown = notices.filter((notice) => !notice.identifier && !notice.text)
if (unknown.length > 0) {
  console.error(
    `No license found for ${unknown.map((n) => `${n.name}@${n.version}`).join(', ')}. ` +
      'Check its terms before it ships.',
  )
  process.exit(1)
}

const RULE = '-'.repeat(72)
const sections = notices.map((notice) =>
  [
    RULE,
    `${notice.name} ${notice.version}${notice.identifier ? ` (${notice.identifier})` : ''}`,
    '',
    notice.text ?? `Licensed under ${notice.identifier}. The package ships no license file.`,
  ].join('\n'),
)
const header = [
  'Skill Studio includes the open-source software listed below, each under its own license.',
  "Electron's and Chromium's notices ship with the app as LICENSE.electron.txt and",
  'LICENSES.chromium.html.',
].join('\n')

mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, `${header}\n\n${sections.join('\n\n')}\n`)
console.log(`Wrote the notices for ${notices.length} packages to ${output}.`)
