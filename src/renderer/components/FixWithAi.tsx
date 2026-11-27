/**
 * Fix with AI, on a rule an answer broke: the row's button, and the popover
 * that hangs from it. The popover opens as the fix is asked for: Stop in its
 * head, away from where Apply and run lands, and under it the turning ribbon
 * edge to edge with "Writing a fix…" centred under it (`WritingBand`). The
 * sheet springs open from the button, and the ribbon springs open in it. As
 * the fix lands the band sinks away as its block folds, and the fix unfolds
 * in its place on a spring, so the sheet grows rather than jumps, and Stop
 * goes with the band. The fix settles in top to bottom, a beat apart: the
 * rule with the change marked, the struck words' line drawn across them,
 * one line on what in the answer broke the rule, then what to do with it,
 * its two buttons as one part. Apply and run saves the rule's new text in SKILL.md
 * and runs this case once more, with the model that wrote the answer, as a
 * new version named after the fix. The run is an ordinary run: its answer
 * shows here when it is graded, as the case's newest.
 *
 * A click elsewhere, Escape or the button pressed again while the fix is
 * written closes the popover and asks whether to stop it ("Let it finish" lets
 * it go on). Meanwhile the button says "Writing a fix…", then "See the fix",
 * and opens the popover on it. Once the fix is shown, a click elsewhere drops
 * it. While the fix is applied and the run starts, the popover stays. It closes on what
 * it showed: the draft is let go at once, but the words fade with the sheet.
 */
import type { AiRun } from '@domain/ai.ts'
import {
  fixVersionName,
  NOTHING_TO_FIX,
  readFixText,
  replaceRule,
  ruleSource,
  unchanged,
} from '@domain/fix.ts'
import { withoutListMark } from '@domain/improve.ts'
import type { Verdict } from '@domain/pack.ts'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { startFix } from '../ai.ts'
import { api } from '../api.ts'
import type { Ctx } from '../ctx.ts'
import { compareTexts } from '../diff.ts'
import { useJobStart } from '../job-start.ts'
import { modelShort, type Output } from '../model.ts'
import { settleTurn, useLanded, useStaying } from '../motion.ts'
import { useHeldRun } from '../started-run.ts'
import { DiffLines, WordDiff } from './DiffLines.tsx'
import { Toolbar } from './layout.tsx'
import { Hint, Text, Working } from './text.tsx'
import { Unfold } from './Unfold.tsx'
import { Button } from './ui/button.tsx'
import { Popover, PopoverAnchor, PopoverContent, PopoverSection } from './ui/popover.tsx'
import { WritingBand } from './WritingBand.tsx'

const SKILL_MD = 'SKILL.md'

const STOP_WRITING = {
  title: 'Stop writing the fix?',
  description: 'When the fix is ready, press See the fix on the rule to read it.',
  action: 'Stop',
  cancel: 'Let it finish',
  destructive: true,
}

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
  // The answer follows the rule by now: that is no failure, so it is said plainly and has no Try again.
  const settled = draft.error === NOTHING_TO_FIX
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
  // The row's button. It opens the sheet without being Radix's trigger, so a press on it is no click elsewhere.
  const opener = useRef<HTMLButtonElement>(null)
  const landed = fix !== null
  useEffect(() => {
    // Not scrolled to: it is on its way in, and the sheet takes its height round it.
    if (landed) applyButton.current?.focus({ preventScroll: true })
  }, [landed])

  // Nothing to fix: Stop has gone from the head, so the keys go to the one button left.
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (settled) closeButton.current?.focus({ preventScroll: true })
  }, [settled])

  // What the sheet showed as it closed: it fades on those words, not on an empty draft.
  const [closing, setClosing] = useState<ReactNode>(null)

  const ask = () => {
    setOpen(true)
    void draft.start(() => startFix(output.run.name, output.sample.name, verdict.text))
  }
  /** The sheet goes, and what it holds stays: a fix still being written goes on being written. */
  const hide = () => {
    setClosing(body)
    setOpen(false)
  }
  const close = () => {
    hide()
    draft.discard()
    // The row behind still says the rule was broken: read the marks again, so it says what is so.
    if (settled) void reload()
  }
  /**
   * A click elsewhere, Escape, or the row's button pressed again. A fix being
   * written is the reader's request: the sheet goes, and they are asked
   * whether to stop it or let it go on under the button. Anything else is
   * let go.
   */
  const dismiss = async () => {
    if (busy) return
    if (!writing) return close()
    hide()
    if (await confirm(STOP_WRITING)) draft.discard()
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
  const writing = draft.running && !fix
  // Under the button while the sheet is away: a fix still being written, or one written and not yet seen.
  const held = !open && (writing || landed)

  // The band stays drawn while it folds away as the fix lands; the fix unfolds in its place.
  const bandDrawn = useStaying(writing)
  const landedNow = useLanded(writing)

  const body = (
    <>
      <PopoverSection pad="text" className="text-xs">
        <div className="flex min-h-6 items-center gap-3">
          <Text weight="medium" size="ui" className="flex-1">
            A fix for a broken rule
          </Text>
          {bandDrawn ? (
            <Button
              type="button"
              variant="ghost-muted"
              size="xs"
              // Gone as the fix lands: its place is not Apply's, but it goes with the band.
              className={writing ? undefined : 'pointer-events-none animate-vanish'}
              tabIndex={writing ? undefined : -1}
              aria-hidden={writing ? undefined : true}
              onClick={close}
            >
              Stop
            </Button>
          ) : null}
        </div>
        {writing ? null : (
          <Unfold motion={landedNow ? 'in' : 'rest'}>
            {/* Settling in top to bottom as the sheet grows: the marks on the rule, why, then what to do. */}
            <div className="flex flex-col gap-2 pt-2">
              {compared?.kind === 'words' ? (
                <div className="animate-settle" style={settleTurn(0)}>
                  <WordDiff size="row" html={compared.html} arrive />
                </div>
              ) : compared?.kind === 'lines' ? (
                <div className="animate-settle" style={settleTurn(0)}>
                  <DiffLines lines={compared.lines} arrive />
                </div>
              ) : null}
              {settled ? (
                <Hint role="status" className="animate-settle" style={settleTurn(0)}>
                  {draft.error}
                </Hint>
              ) : draft.error ? (
                <Hint
                  tone="destructive"
                  role="alert"
                  className="animate-settle"
                  style={settleTurn(0)}
                >
                  {draft.error}
                </Hint>
              ) : !fix ? null : (
                <>
                  <Text
                    as="p"
                    tone="muted"
                    role="status"
                    className="m-0 animate-settle text-pretty"
                    style={settleTurn(1)}
                  >
                    {fix.why}
                  </Text>
                  {!source ? (
                    <Hint tone="destructive" role="alert">
                      This rule has changed since the run, so the fix cannot be put in its place.
                    </Hint>
                  ) : same ? (
                    <Hint>The rule stays as it is.</Hint>
                  ) : null}
                </>
              )}
              {/* The buttons are one choice, so they come as one part. */}
              <Toolbar gap="md" className="animate-settle" style={settleTurn(fix ? 2 : 1)}>
                {fix && source && !same && writer ? (
                  <>
                    <Button
                      ref={applyButton}
                      type="button"
                      size="xs"
                      // Another run going blocks it: it says so, as it says it is applying.
                      busy={busy || run.busy()}
                      busyLabel={busy ? 'Applying…' : 'Waiting for a run…'}
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
                  </>
                ) : draft.error && !settled ? (
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
                  <Button
                    ref={closeButton}
                    type="button"
                    variant="ghost-muted"
                    size="xs"
                    onClick={close}
                  >
                    Close
                  </Button>
                )}
              </Toolbar>
            </div>
          </Unfold>
        )}
      </PopoverSection>
      {bandDrawn ? (
        <Unfold motion={writing ? 'rest' : 'out'}>
          <WritingBand label="Writing a fix…" leaving={!writing} />
        </Unfold>
      ) : null}
    </>
  )

  return (
    <Popover
      open={open}
      // A fix being applied is not dropped by a click elsewhere.
      onOpenChange={(next) => (next ? null : void dismiss())}
    >
      <PopoverAnchor asChild>
        <Button
          ref={opener}
          type="button"
          variant="ghost-muted"
          size="xs"
          aria-haspopup="dialog"
          aria-expanded={open}
          // Lit while its popover is open, so the row it belongs to is plain.
          data-state={open ? 'open' : 'closed'}
          // Pressed again, it closes the sheet, as a click elsewhere does; not while the fix is applied.
          // With a fix held under it, it opens that fix rather than asking for a new one.
          disabled={open && busy}
          onClick={() => (open ? void dismiss() : held ? setOpen(true) : ask())}
        >
          {held && writing ? (
            <Working>Writing a fix…</Working>
          ) : held ? (
            'See the fix'
          ) : (
            'Fix with AI'
          )}
        </Button>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        size="compose"
        aria-label="A fix for a broken rule"
        // A press on the row's button is its own: else the sheet would close on the press and open again on the click, with a new fix.
        onInteractOutside={(event) => {
          if (event.target instanceof Node && opener.current?.contains(event.target))
            event.preventDefault()
        }}
      >
        {open ? body : closing}
      </PopoverContent>
    </Popover>
  )
}
