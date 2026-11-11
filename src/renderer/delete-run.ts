/**
 * Deleting one run from Results: ask first, delete, close its row, and offer
 * Undo on the status line. The button stays busy until the delete lands.
 */
import { useState } from 'react'
import { api } from './api.ts'
import type { Ctx } from './ctx.ts'
import { inSkill } from './in-skill.ts'
import { deleteBlocked, deleteRunDialog } from './model.ts'

export interface DeleteRun {
  deleting: boolean
  /** The run is being written or deleted, or a grading is starting: Regrade waits. */
  held: boolean
  /** Why the run cannot be deleted now, for the button's title; undefined when it can. */
  blocked: string | undefined
  remove: () => Promise<void>
}

export function useDeleteRun(
  ctx: Ctx,
  /** The run's name: it is looked up when the delete is asked for, so this can run before the row knows it. */
  run: string,
  /** Jobs on the run: one writing or grading it still changes it on disk, so it can go once that is over. */
  jobs: { writing: boolean; grading: boolean; waiting: boolean },
  closed: () => void,
): DeleteRun {
  const [deleting, setDeleting] = useState(false)
  const { state, outputs, confirm, report, reload } = ctx
  const remove = async () => {
    const view = state.runs.find((r) => r.name === run)
    if (!view) return
    const dialog = deleteRunDialog(state, view, outputs)
    if (!(await confirm({ ...dialog, action: 'Delete', destructive: true }))) return
    setDeleting(true)
    try {
      const gone = await api.deleteRun(run)
      closed()
      await reload()
      report('Run deleted', {
        // Taken once another skill is open, it would look for the run there.
        undo: inSkill(ctx, async () => {
          await api.undeleteRun(gone.undo)
          report('Run restored')
        }),
      })
    } catch (e) {
      report(e as Error)
    } finally {
      setDeleting(false)
    }
  }
  return {
    deleting,
    held: jobs.waiting || jobs.writing || deleting,
    blocked: deleteBlocked(jobs),
    remove,
  }
}
