/**
 * The output as a picture: what a page looks like when it is opened, or the
 * picture the agent made. Every pack that looks at an output looks at the same
 * one, so two packs never judge two different pictures of one page.
 */
import { join } from 'node:path'
import { isJevFormat } from '@domain/image.ts'
import { type Readable, readForJev } from '../images.ts'
import type { JudgeInput } from '../types.ts'

/** The page drawn at one of `RENDER_SIZES`, when grading drew it. */
export const renderOf = (input: JudgeInput, id: 'desktop' | 'phone'): Readable | null =>
  input.renders.find((r) => r.size.id === id)?.read ?? null

/** The picture judged when it is a PNG or JPEG, else the first the agent left; null when it left none. */
export function agentPicture(
  input: Pick<JudgeInput, 'primary' | 'artifacts'>,
): { kind: string; file: string } | null {
  const jevPicture = (a: { kind: string; file: string }) =>
    a.kind === 'image' && isJevFormat(a.file)
  return (
    (input.primary && jevPicture(input.primary) ? input.primary : null) ??
    input.artifacts.find(jevPicture) ??
    null
  )
}

/** The agent's picture read for Jev: the copy drawn to fit where there is one, else the file itself. */
function shotOf(input: JudgeInput): Readable | null {
  const shot = agentPicture(input)
  if (!shot) return null
  return input.fitted?.file === shot.file
    ? input.fitted.read
    : readForJev(join(input.dir, shot.file))
}

/**
 * The picture Jev looks at for this output, or why it cannot be read; null
 * when the output has none. A page is the page as the app drew it: that is
 * what the reader sees, and an agent's own screenshot may be of something
 * else, or from before its last change, so it stands in only where no picture
 * Jev reads was drawn. An output that is no page is the picture the agent made.
 */
export function pictureOf(input: JudgeInput): Readable | null {
  const drawn = input.primary?.kind === 'html' ? renderOf(input, 'desktop') : null
  return drawn?.image ? drawn : (shotOf(input) ?? drawn)
}
