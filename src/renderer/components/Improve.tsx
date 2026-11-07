/**
 * Help me improve, in the side panel: one selected rule, a few fixed questions
 * put one at a time, then a draft to talk over. Code decides which question
 * comes next; the model only phrases it and writes the draft. The judge's
 * reading of the draft stands under it as a checklist. One button puts the
 * draft where the selection was, while SKILL.md is open in the Editor.
 */
import { currentStep } from '@domain/improve.ts'
import { XIcon } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { clearImprove, sendImprove, stopRun, useAi, useImprove } from '../ai.ts'
import { shortcut } from '../keys.ts'
import { useReplacer } from '../replace.ts'
import { Conversation } from './Chat.tsx'
import { Composer } from './Composer.tsx'
import { Spacer } from './layout.tsx'
import { Unjudged } from './Refine.tsx'
import { Status } from './Status.tsx'
import { Heading, Hint, Text } from './text.tsx'
import { Button } from './ui/button.tsx'

/** Within this many pixels of the end, new text keeps the view at the end. */
const PINNED_WITHIN = 48

export function ImprovePanel({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const { thread, problem } = useImprove()
  const { choice } = useAi()
  const replacer = useReplacer()
  const [reply, setReply] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  useLayoutEffect(() => {
    const el = scroller.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  })

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
    setSending(true)
    setReply('')
    pinned.current = true
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
      void clearImprove()
      return
    }
    setNote('The selection has changed in the file. Select it again and start over.')
  }

  const canReplace = thread.draft !== null && replacer !== null && !running

  return (
    <>
      <header
        data-drag
        className="flex h-12 shrink-0 items-center gap-1 border-b pr-2 pl-4 pointer-coarse:gap-3"
      >
        <Heading level="page" as="h2">
          Improve a rule
        </Heading>
        <Spacer />
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          Back to chat
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close the assistant"
          title={`Close (${shortcut('J')})`}
          onClick={onClose}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </header>
      <div
        ref={scroller}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
        onScroll={(event) => {
          const el = event.currentTarget
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < PINNED_WITHIN
        }}
      >
        <section className="flex flex-col gap-2 border-b px-4 py-3">
          <span className="flex items-baseline justify-between gap-3">
            <Text size="xs" caps tone="muted">
              The selection
            </Text>
            <Text size="xs" tone="muted" tabular>
              {progress}
            </Text>
          </span>
          <Text as="p" size="ui" wrap="pre" className="m-0 rounded-sm bg-muted/50 px-3 py-2">
            {thread.scene.selection}
          </Text>
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
      </div>
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
            onStop={() => run && stopRun(run.id)}
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
          <Hint>Open SKILL.md in the Editor to put the draft in place.</Hint>
        )}
      </footer>
    </>
  )
}
