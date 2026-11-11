import { lstatSync, readdirSync, type Stats } from 'node:fs'
import { extname, join } from 'node:path'
import { OUTPUTS_DIR } from '@domain/prompt.ts'
import type { Artifact, ArtifactKind } from '@domain/schemas.ts'
import { isDir } from './fs.ts'

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

function artifactKind(file: string): ArtifactKind | null {
  const ext = extname(file).toLowerCase()
  if (file.endsWith('transcript.jsonl')) return 'transcript'
  if (KIND_BY_EXT[ext]) return KIND_BY_EXT[ext]
  if (CODE_EXT.has(ext)) return 'code'
  return null
}

/** Every artifact under `<sampleDir>/outputs/`, paths relative to the sample dir. */
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
      else if (entry.isFile()) {
        const kind = artifactKind(name)
        if (kind) found.push({ file, kind })
      }
    }
  }
  walk(outputs, OUTPUTS_DIR)
  return found
}
