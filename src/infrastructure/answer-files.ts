/**
 * What one attempt of a run was asked and what it wrote, as text: the
 * request word for word as the agent got it, with what the app adds to every
 * request (such as "also write outputs/preview.html"), and each file it left
 * that is not a picture, in the order the run lists them. A file too large to
 * be text, or gone, is left out. Read for Fix with AI's sheet of evidence.
 */
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { assertInside, isFile } from './fs.ts'
import { readRunMeta, runDir, runSamples } from './runs.ts'

/** A file larger than this is not read: no sheet could hold it anyway. */
const TEXT_MAX = 2 * 1024 * 1024
const PICTURE = /\.(png|jpe?g|webp|gif|avif|bmp|ico|svgz)$/i

export interface AnswerText {
  /** The case the attempt answered. */
  caseId: string
  /** The request as the agent got it (`prompt.md`); null for a run that kept none. */
  request: string | null
  files: Array<{ path: string; text: string }>
}

/** The attempt `sample` of `run`. Throws when the run or the attempt is not there. */
export function answerText(skillDir: string, run: string, sample: string): AnswerText {
  const meta = readRunMeta(skillDir, run)
  const found = runSamples(runDir(skillDir, run)).find((s) => s.name === sample)
  const caseId = meta?.samples.find((s) => s.dir === sample)?.case
  if (!meta || !found || !caseId) throw new Error('This answer is no longer there.')
  const files = found.artifacts.flatMap(({ file }) => {
    if (PICTURE.test(file)) return []
    const path = assertInside(found.path, join(found.path, file))
    if (!isFile(path) || statSync(path).size > TEXT_MAX) return []
    return [{ path: file, text: readFileSync(path, 'utf8') }]
  })
  const prompt = join(found.path, 'prompt.md')
  const request = found.legacy || !isFile(prompt) ? null : readFileSync(prompt, 'utf8')
  return { caseId, request, files }
}
