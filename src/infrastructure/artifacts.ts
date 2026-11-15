import { lstatSync, readdirSync, type Stats } from 'node:fs'
import { extname, join } from 'node:path'
import { OUTPUTS_DIR } from '@domain/prompt.ts'
import type { Artifact, ArtifactKind } from '@domain/schemas.ts'
import { isDir, readStart } from './fs.ts'

const KIND_BY_EXT: Record<string, ArtifactKind> = {
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.txt': 'markdown',
  '.html': 'html',
  '.htm': 'html',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
  '.gif': 'image',
  '.svg': 'image',
}

const CODE_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.css',
  '.scss',
  '.json',
  '.sh',
  '.go',
  '.rs',
  '.java',
  '.rb',
  '.yaml',
  '.yml',
  '.toml',
  '.sql',
  '.swift',
  '.kt',
])

/** How much of a file of a kind not listed is read to tell text from anything else. */
const SNIFF_BYTES = 8192

/**
 * Whether the file at `path` reads as text: its start is UTF-8 with no NUL
 * byte. A file that cannot be read is not text.
 */
function readsAsText(path: string): boolean {
  let start: Uint8Array
  try {
    start = readStart(path, SNIFF_BYTES)
  } catch {
    return false
  }
  if (start.includes(0)) return false
  try {
    // `stream` lets the start end part way through a character.
    new TextDecoder('utf-8', { fatal: true }).decode(start, { stream: true })
    return true
  } catch {
    return false
  }
}

/**
 * A file's kind by its name; one the lists do not name is text when it reads
 * as text (`.csv`, `.xml`, `.ipynb`, a file with no extension) and `other` when
 * it does not (`.pdf`, `.docx`), which Jev cannot read.
 */
function artifactKind(file: string, path: string): ArtifactKind {
  const ext = extname(file).toLowerCase()
  if (file.endsWith('transcript.jsonl')) return 'transcript'
  if (KIND_BY_EXT[ext]) return KIND_BY_EXT[ext]
  if (CODE_EXT.has(ext)) return 'code'
  return readsAsText(path) ? 'markdown' : 'other'
}

/** Every file under `<sampleDir>/outputs/`, hidden ones and `node_modules` apart, paths relative to the sample dir. */
export function detectArtifacts(sampleDir: string): Artifact[] {
  const outputs = join(sampleDir, OUTPUTS_DIR)
  if (!isDir(outputs)) return []
  const found: Artifact[] = []
  // The agent wrote this folder, so nothing in it is trusted: a link is never
  // followed (it may lead out of the sample, to nothing, or back on itself)
  // and an entry that cannot be read is passed over.
  const walk = (dir: string, prefix: string) => {
    let names: string[]
    try {
      names = readdirSync(dir).sort()
    } catch {
      return
    }
    for (const name of names) {
      if (name.startsWith('.') || name === 'node_modules') continue
      let entry: Stats
      try {
        entry = lstatSync(join(dir, name))
      } catch {
        continue
      }
      const file = `${prefix}/${name}`
      if (entry.isDirectory()) walk(join(dir, name), file)
      else if (entry.isFile()) found.push({ file, kind: artifactKind(name, join(dir, name)) })
    }
  }
  walk(outputs, OUTPUTS_DIR)
  return found
}
