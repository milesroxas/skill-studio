/**
 * A step offered while one skill was open, taken later: an Undo on the status
 * line outlives the screen that offered it. Every call addresses the skill
 * open at the time it is made, so a step taken after another skill was opened
 * would land in that one. It is refused instead.
 */
import { currentSkill } from './api.ts'
import type { Ctx } from './ctx.ts'

/**
 * Run `step` against the skill it was offered for, then read the skill again.
 * A failure is reported; so is a step taken once another skill is open.
 */
export const inSkill = (ctx: Ctx, step: () => Promise<unknown>) => (): void => {
  if (currentSkill() !== ctx.state.skill.path) {
    ctx.report('Open the skill again to undo this.', { tone: 'warning' })
    return
  }
  step().then(
    () => ctx.reload(),
    (e: Error) => ctx.report(e),
  )
}
