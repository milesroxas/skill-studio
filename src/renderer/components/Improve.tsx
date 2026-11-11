/**
 * Help me improve, in the side panel: one selected rule, a few fixed questions
 * put one at a time, then a draft to talk over. Code decides which question
 * comes next; the model only phrases it and writes the draft. Jev's
 * reading of the draft stands under it as a checklist. One button puts the
 * draft where the selection was, while SKILL.md is open in the Editor.
 */
import { currentStep } from '@domain/improve.ts'
import { useState } from 'react'
import { clearImprove, sendImprove, stopRun, useAi, useImprove, useImproveDraft } from '../ai.ts'
import { useReplacer } from '../replace.ts'
import { Conversation } from './Chat.tsx'
import { Composer } from './Composer.tsx'
import { useConfirm } from './confirm.tsx'
import { PanelBody, PanelHeader, usePin } from './PanelFrame.tsx'
import { Unjudged } from './Refine.tsx'
import { Status } from './Status.tsx'
import { Excerpt, Hint, Text } from './text.tsx'
import { Button } from './ui/button.tsx'

export function ImprovePanel({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const { thread, problem } = useImprove()
  const { choice } = useAi()
  const replacer = useReplacer()
  // Kept with the conversation, not in the panel: closing the panel does not lose what was typed.
  const [reply, setReply] = useImproveDraft()
  const [confirm, confirmDialog] = useConfirm()
  const [failure, setFailure] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const pin = usePin()

  if (!thread) return null
  const run = thread.run
  const running = sending || run?.status === 'running'
  const error = failure ?? (run?.status === 'failed' ? run.error : null) ?? problem
  const step = currentStep(thread)
  const progress = step
    ? `Question ${thread.at + 1} of ${thread.steps.length}`
    : thread.cut
      ? 'The line goes'
      : 'The draft'

  const send = async (text: string) => {
    if (!text.trim() || running) return
    setFailure(null)
    setNote(null)
    setSending(true)
    setReply('')
    pin.pinned.current = true
    try {
      await sendImprove(text.trim())
    } catch (e) {
      setFailure((e as Error).message)
      setReply(text)
    } finally {
      setSending(false)
    }
  }

  const replace = () => {
    if (!replacer || thread.draft === null) return
    if (replacer(thread.scene.selection, thread.draft) === 'replaced') {
      // The draft is in the file. A conversation that would not close says so and stays.
      clearImprove().catch((e: Error) => setFailure(e.message))
      return
    }
    setNote(
      'The selection is not in the file as it was, or it is there more than once. Select it again and start over.',
    )
  }

  /** Going back closes this conversation, and nothing brings it back: ask once there is something in it to lose. */
  const back = async () => {
    if (
      (thread.at > 0 || thread.draft !== null) &&
      !(await confirm({
        title: 'Discard this draft?',
        description: 'Your answers and the draft are not kept.',
        action: 'Discard',
        destructive: true,
      }))
    )
      return
    onBack()
  }

  const canReplace = thread.draft !== null && replacer !== null && !running

  return (
    <>
      <PanelHeader title="Improve a rule" onClose={onClose}>
        <Button type="button" variant="ghost" size="sm" onClick={() => void back()}>
          Back to chat
        </Button>
      </PanelHeader>
      <PanelBody pin={pin}>
        <section className="flex flex-col gap-2 border-b px-4 py-3">
          <span className="flex items-baseline justify-between gap-3">
            <Text size="xs" caps tone="muted">
              The selection
            </Text>
            <Text size="xs" tone="muted" tabular>
              {progress}
            </Text>
          </span>
          <Excerpt>{thread.scene.selection}</Excerpt>
        </section>
        <Conversation messages={thread.messages.slice(1)} run={run} error={error} />
        {thread.checklist ? (
          <section className="flex flex-col gap-2 px-4 pb-4">
            <Text size="xs" caps tone="muted">
              The draft against the guide
            </Text>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {thread.checklist.map((item) => (
                <li key={item.principle}>
                  <Status
                    tone={item.held ? 'success' : 'warning'}
                    detail={item.held ? item.lead : `${item.lead} ${item.message}`}
                  >
                    {item.held ? 'Holds' : 'Missing'}
                  </Status>
                </li>
              ))}
            </ul>
          </section>
        ) : thread.draft !== null && !thread.judged ? (
          <div className="px-4 pb-4">
            <Unjudged />
          </div>
        ) : null}
      </PanelBody>
      {choice ? (
        <div className="shrink-0 px-3 pb-3">
          <Composer
            frame="box"
            label="Reply"
            placeholder={
              step ? 'Answer in a sentence or two' : 'Ask for a change, or replace the selection'
            }
            value={reply}
            onChange={setReply}
            onSubmit={() => void send(reply)}
            running={Boolean(running)}
            // Until the reply has an id there is nothing to stop: the button waits disabled.
            onStop={run?.status === 'running' ? () => stopRun(run.id) : undefined}
          />
        </div>
      ) : null}
      <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t px-3 py-3">
        <Button type="button" size="sm" disabled={!canReplace} onClick={replace}>
          {thread.draft === '' ? 'Delete selection' : 'Replace selection'}
        </Button>
        {note ? (
          <Hint tone="destructive" role="alert">
            {note}
          </Hint>
        ) : replacer ? null : (
          <Hint>Open SKILL.md on the Skill screen to put the draft in place.</Hint>
        )}
      </footer>
      {confirmDialog}
    </>
  )
}
