/**
 * Fix with AI, on a rule an answer broke: the row's button, and the popover
 * that hangs from it. The popover opens as the fix is asked for and is
 * written in it: one line on what in the answer broke the rule, then the rule
 * with the change marked. Apply and run saves the rule's new text in SKILL.md
 * and runs this case once more, with the model that wrote the answer, as a
 * new version named after the fix. The run is an ordinary run: its answer
 * shows here when it is graded, as the case's newest.
 *
 * A click elsewhere drops the draft and stops one still being written; while
 * the fix is applied and the run starts, the popover stays.
 */
import type { AiRun } from '@domain/ai.ts'
import { fixVersionName, readFixText, replaceRule, ruleSource, unchanged } from '@domain/fix.ts'
import { withoutListMark } from '@domain/improve.ts'
import type { Verdict } from '@domain/pack.ts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { startFix } from '../ai.ts'
import { api } from '../api.ts'
import type { Ctx } from '../ctx.ts'
import { compareTexts } from '../diff.ts'
import { useJobStart } from '../job-start.ts'
import { modelShort, type Output } from '../model.ts'
import { useHeldRun } from '../started-run.ts'
import { DiffLines, WordDiff } from './DiffLines.tsx'
import { Toolbar } from './layout.tsx'
import { TurningRibbon } from './TurningRibbon.tsx'
import { Hint, Text } from './text.tsx'
import { Button } from './ui/button.tsx'
import { Popover, PopoverAnchor, PopoverContent, PopoverSection } from './ui/popover.tsx'

const SKILL_MD = 'SKILL.md'

const REPLACE_EDITS = {
  title: 'Replace your unsaved changes to SKILL.md?',
  description: 'The fix is applied to SKILL.md as saved. Your unsaved changes to it are dropped.',
  action: 'Replace',
  destructive: true,
}

export function FixWithAi({
  ctx,
  output,
  verdict,
}: {
  ctx: Ctx
  output: Output
  verdict: Verdict
}) {
  const { report, jobs, files, drafts, confirm, reload } = ctx
  const [open, setOpen] = useState(false)
  const draft = useHeldRun((run: AiRun) => run)
  const mine = useMemo(
    () => jobs.filter((j) => j.skillPath === ctx.state.skill.path),
    [jobs, ctx.state.skill.path],
  )
  const run = useJobStart(mine, 'generate', report)
  const [applying, setApplying] = useState(false)
  const writer = output.run.meta?.writer ?? null
  const model = modelShort(writer)

  const saved = files.saved?.[SKILL_MD] ?? null
  const source = saved === null ? null : ruleSource(saved, verdict.text)
  const fix = draft.run?.status === 'done' ? readFixText(draft.run.text) : null
  const same = fix && source ? unchanged(source, fix) : false
  const compared = useMemo(
    () =>
      fix && source && !same
        ? compareTexts(withoutListMark(source.text), withoutListMark(fix.revision), {
            byPhrase: true,
          })
        : null,
    [fix, source, same],
  )

  // The draft has landed: the keys go to the button that applies it, as the Stop they were on is gone.
  const applyButton = useRef<HTMLButtonElement>(null)
  const landed = fix !== null
  useEffect(() => {
    if (landed) applyButton.current?.focus()
  }, [landed])

  const ask = () => {
    setOpen(true)
    void draft.start(() => startFix(output.run.name, output.sample.name, verdict.text))
  }
  const close = () => {
    draft.discard()
    setOpen(false)
  }

  const apply = async () => {
    if (!fix || !source || saved === null || !writer) return
    // Saving over unsaved edits drops them: ask first.
    const unsaved = drafts.files[SKILL_MD]?.text
    if (unsaved !== undefined && unsaved !== saved && !(await confirm(REPLACE_EDITS))) return
    setApplying(true)
    try {
      const text = replaceRule(saved, source, fix.revision)
      await api.saveSkillFile(SKILL_MD, text, saved)
      files.took(SKILL_MD, text)
      drafts.setFile(SKILL_MD, null)
      await run.start([], async () => {
        await api.generate({
          cases: [output.caseId],
          configs: [
            { engine: writer.engine, model: writer.model ?? '', effort: writer.effort ?? '' },
          ],
          samples: 1,
          configuration: 'with_skill',
          baseline: null,
          skillName: fixVersionName(source.text),
          note: fix.why,
          grade: true,
        })
        report(`Fixed the rule. Running this case again with ${model}`)
      })
      await reload()
      close()
    } catch (e) {
      report(e as Error)
    } finally {
      setApplying(false)
    }
  }

  const busy = applying || run.starting()
  return (
    <Popover
      open={open}
      // A fix being applied is not dropped by a click elsewhere.
      onOpenChange={(next) => (next || busy ? null : close())}
    >
      <PopoverAnchor asChild>
        <Button
          type="button"
          variant="ghost-muted"
          size="xs"
          aria-haspopup="dialog"
          aria-expanded={open}
          // Lit while its popover is open, so the row it belongs to is plain.
          data-state={open ? 'open' : 'closed'}
          onClick={ask}
        >
          Fix with AI
        </Button>
      </PopoverAnchor>
      <PopoverContent align="start" size="compose" aria-label="A fix for a broken rule">
        <PopoverSection pad="text" className="text-xs">
          <Text weight="medium" size="ui">
            A fix for a broken rule
          </Text>
          {draft.error ? (
            <Hint tone="destructive" role="alert">
              {draft.error}
            </Hint>
          ) : !fix ? (
            <div className="relative flex min-h-20 items-center pl-32">
              <TurningRibbon className="absolute inset-y-0 left-0 h-full w-28" />
              <Text tone="muted" role="status">
                Writing a fix…
              </Text>
            </div>
          ) : (
            <>
              <Text as="p" tone="muted" role="status" className="m-0 text-pretty">
                {fix.why}
              </Text>
              {!source ? (
                <Hint tone="destructive" role="alert">
                  This rule has changed since the run, so the fix cannot be put in its place.
                </Hint>
              ) : same ? (
                <Hint>The rule stays as it is.</Hint>
              ) : compared?.kind === 'words' ? (
                <WordDiff size="row" html={compared.html} arrive />
              ) : compared?.kind === 'lines' ? (
                <DiffLines lines={compared.lines} />
              ) : null}
            </>
          )}
          <Toolbar gap="md">
            {fix && source && !same && writer ? (
              <>
                <Button
                  ref={applyButton}
                  type="button"
                  size="xs"
                  busy={busy}
                  busyLabel="Applying…"
                  disabled={run.busy() && !busy}
                  onClick={() => void apply()}
                >
                  Apply and run
                </Button>
                <Button
                  type="button"
                  variant="ghost-muted"
                  size="xs"
                  disabled={busy}
                  onClick={close}
                >
                  Turn down
                </Button>
                <Hint>
                  {run.busy() && !busy
                    ? 'Wait for the run going now to finish.'
                    : `Runs this case once more with ${model}.`}
                </Hint>
              </>
            ) : draft.running ? (
              <Button type="button" variant="ghost-muted" size="xs" onClick={close}>
                Stop
              </Button>
            ) : draft.error ? (
              <>
                <Button type="button" variant="outline" size="xs" onClick={ask}>
                  Try again
                </Button>
                <Button type="button" variant="ghost-muted" size="xs" onClick={close}>
                  Close
                </Button>
              </>
            ) : fix && !source ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => ctx.go('editor', { file: SKILL_MD })}
                >
                  Open skill
                </Button>
                <Button type="button" variant="ghost-muted" size="xs" onClick={close}>
                  Close
                </Button>
              </>
            ) : (
              <Button type="button" variant="ghost-muted" size="xs" onClick={close}>
                Close
              </Button>
            )}
          </Toolbar>
        </PopoverSection>
      </PopoverContent>
    </Popover>
  )
}
