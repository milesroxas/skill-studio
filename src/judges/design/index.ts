/**
 * The design judge pack: Jev looks at the output as a picture. A page is the
 * page as the desktop app draws it, in a window the case's size or a
 * desktop's, which is what Results shows the reader; for a case that asks,
 * the app also draws it at phone width, and Jev says whether it fits. The CLI
 * and `st serve` have no browser to draw with, so there it looks at the first
 * PNG or JPEG the agent left in outputs/, and says nothing when there is none.
 *
 * It asks only what any visual must be: one clear main point and nothing
 * broken. Anything else is the skill's rule or the case's check to
 * state, which the generic pack marks: a page is not always a web page, and a
 * mockup or a slide owes the web no lang, landmark or heading order.
 */
import { noul } from '@typesafe-ai/sdk'
import type { JevState } from '../jev.ts'
import { pictureOf, renderOf } from '../shared/picture.ts'
import { asksJev, noulOf, optionalAnswer, requestState } from '../shared/questions.ts'
import type { JudgePack } from '../types.ts'
import { type DesignRaw, designScoring } from './score.ts'

export const designPack: JudgePack<DesignRaw> = {
  ...designScoring,
  version: 3,
  label: 'Design: a look at the output as a picture',
  renders: true,
  async judge(input, ctx) {
    const read = pictureOf(input)
    const phoneRead = input.primary?.kind === 'html' ? renderOf(input, 'phone') : null
    const shot = read?.image ?? null
    const phone = phoneRead?.image ?? null
    // A picture Jev would refuse is left out and said, so a missing look is never read as a pass.
    const problems = [
      read?.problem ? `screenshot not judged: ${read.problem}` : null,
      phoneRead?.problem ? `phone screenshot not judged: ${phoneRead.problem}` : null,
    ].filter((p): p is string => p !== null)
    const unread = problems.length ? problems.join('; ') : null
    if (!shot || !asksJev(input, ctx)) return unread ? { jev: null, unread } : null
    const state: JevState = { ...requestState(input), screenshot: shot }
    if (phone) state.phone = phone
    const questions = {
      hierarchy: noul(
        'Does `screenshot` have one clear main point, with the rest subordinate to it?',
        {
          true: 'One element reads as the main point by size, position or contrast, and the other parts support it.',
          false: 'Several parts compete to be the main point, or there is no main point at all.',
        },
      ),
      // Broken, not bare: a wireframe's grey blocks and a mockup's empty margins are made that way.
      finished: noul('Is `screenshot` free of anything broken?', {
        true: 'Text is readable, and nothing overlaps another thing by accident, runs out of its box or is cut off by the edge. Plain blocks standing in for content are not broken.',
        false:
          'Text overlaps or cannot be read, something runs out of its box or is cut off by the edge, a picture is missing, or the whole thing is blank or unstyled.',
      }),
      ...(phone
        ? {
            phone: noul('Does `phone` show the page working on a phone, drawn 390 px wide?', {
              true: 'Everything fits the width and reads: nothing is cut off at the side, runs past the edge so the page scrolls sideways, or overlaps.',
              false:
                'Something is cut off at the side, runs past the edge so the page scrolls sideways, overlaps, or is too small to read.',
            }),
          }
        : {}),
    }
    const answers = await ctx.jev.ask(state, questions)
    const jev: DesignRaw['jev'] = {
      hierarchy: noulOf(answers, 'hierarchy'),
      finished: noulOf(answers, 'finished'),
      // Asked only of a page drawn at phone width; one Jev left out is null, and the other answers stand.
      phone: phone ? optionalAnswer(() => noulOf(answers, 'phone')) : null,
    }
    return unread ? { jev, unread } : { jev }
  },
}
