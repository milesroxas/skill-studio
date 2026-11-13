/**
 * Which of the files an output wrote stands for it: the one grading judges
 * and Results opens first. Grading and Results both choose here, so the two
 * never disagree on an output nobody has graded yet.
 */
import { DELIVERABLE, OUTPUTS_DIR } from './prompt.ts'
import type { Artifact, ArtifactKind } from './schemas.ts'

/**
 * Kinds a pack made for them judges, most particular first. Markdown comes
 * after: the packs that read it judge any skill's output, so a page, a
 * picture or code beside a note is what the skill was asked to make.
 */
const PARTICULAR: readonly ArtifactKind[] = ['html', 'image', 'code']

/** A page that stands for the others beside it: `index.html`, or the preview a run asks for beside a component. */
const MAIN_PAGE = /(^|\/)(index|preview)\.html?$/i

/** The file the run's prompt names for the deliverable, in whatever format the request asked for: `outputs/output.md`. */
const NAMED_FILE = new RegExp(`^${OUTPUTS_DIR}/${DELIVERABLE}\\.[^/]+$`, 'i')

/** A file about the others beside it, read last among its kind. */
const ABOUT_FILE = /(^|\/)readme(\.[^/]*)?$/i

/** Lower is read first among files of one kind; name order breaks a tie. */
function rank(artifact: Artifact): number {
  if (MAIN_PAGE.test(artifact.file)) return 0
  // What the agent was told to write the piece to stands before a file it named itself.
  if (NAMED_FILE.test(artifact.file)) return 1
  if (ABOUT_FILE.test(artifact.file)) return 4
  // `.txt` counts as Markdown, but a note in plain text is seldom the piece itself.
  if (/\.txt$/i.test(artifact.file)) return 3
  return 2
}

/** The first artifact of `kind` by rank, then by the order given; null when there is none. */
function firstOf(artifacts: readonly Artifact[], kind: ArtifactKind): Artifact | null {
  let best: Artifact | null = null
  for (const artifact of artifacts)
    if (artifact.kind === kind && (!best || rank(artifact) < rank(best))) best = artifact
  return best
}

/**
 * The artifact the packs judge: the case's kind when it names one; else a
 * page, a picture or code when a pack of the skill judges that kind; else
 * Markdown; else a page, a picture or code, in that order; else the first
 * file. The order of the skill's packs does not matter. A page and its
 * script, `index.html` and `app.js`, are judged as the page, whatever the
 * skill is graded as.
 */
export function primaryArtifact(
  artifacts: readonly Artifact[],
  preferred: ArtifactKind | undefined,
  judged: readonly ArtifactKind[] = [],
): Artifact | null {
  const kinds = [
    ...(preferred ? [preferred] : []),
    ...PARTICULAR.filter((kind) => judged.includes(kind)),
    'markdown' as const,
    ...PARTICULAR,
  ]
  for (const kind of kinds) {
    const match = firstOf(artifacts, kind)
    if (match) return match
  }
  return artifacts[0] ?? null
}

/** True for a file a browser draws: a page or a picture. */
const isDrawn = (artifact: Pick<Artifact, 'kind'>): boolean =>
  artifact.kind === 'html' || artifact.kind === 'image'

/**
 * The file of an output a reader looks at rather than reads: `primary` when
 * it is a page or a picture, else the page it wrote (its main page first),
 * else a picture. Null for an output of text alone.
 */
export function drawnArtifact(
  artifacts: readonly Artifact[],
  primary: Artifact | null,
): Artifact | null {
  if (primary && isDrawn(primary)) return primary
  return firstOf(artifacts, 'html') ?? firstOf(artifacts, 'image')
}
