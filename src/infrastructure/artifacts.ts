import { readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
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
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      if (name.startsWith('.') || name === 'node_modules') continue
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else {
        const kind = artifactKind(name)
        if (kind) found.push({ file: relative(sampleDir, full), kind })
      }
    }
  }
  walk(outputs)
  return found
}

/** The artifact the packs judge: the case's kind when it names one, else the first markdown, else the first file. */
export function primaryArtifact(
  artifacts: Artifact[],
  preferred: ArtifactKind | undefined,
): Artifact | null {
  if (preferred) {
    const match = artifacts.find((a) => a.kind === preferred)
    if (match) return match
  }
  return artifacts.find((a) => a.kind === 'markdown') ?? artifacts[0] ?? null
}
