/**
 * Help me improve, in the side panel: a conversation about one selected rule.
 * It opens with the rule in the composer and asks nothing until the writer
 * says what should change, or asks for a few questions first. Code decides
 * which question comes next; the model only phrases it and writes drafts. A
 * draft stands in the reply as a proposed change, the same row the
 * Assistant's changes use, with Jev's reading of it inside. Applying it puts
 * it in the file and leaves the conversation open, so the rule can be talked
 * over and changed again.
 */
import type { ChatMessage } from '@domain/ai.ts'
import {
  type ChecklistItem,
  currentStep,
  draftReply,
  keepListMark,
  withoutListMark,
} from '@domain/improve.ts'
import { wordCount } from '@domain/lint.ts'
import { useMemo, useState } from 'react'
import { sendImprove, stopRun, useAi, useImprove, useImproveDraft } from '../ai.ts'
import { compareTexts } from '../diff.ts'
import { plural } from '../model.ts'
import { useRested } from '../motion.ts'
import { showPassage, usePassage, useReplacer } from '../replace.ts'
import { type Offer, RowAction, Summary, WritingRow } from './Change.tsx'
import { Conversation } from './Chat.tsx'
import { Composer, ComposerTopic } from './Composer.tsx'
import { useConfirm } from './confirm.tsx'
import { DiffLines, WordDiff } from './DiffLines.tsx'
import { Disclosure, DisclosureList } from './Disclosure.tsx'
import { EmptyState, PlainList, Stack } from './layout.tsx'
import { PanelBody, PanelHeader, usePin } from './PanelFrame.tsx'
import { Prose } from './Prose.tsx'
import { Unjudged } from './Refine.tsx'
import { Status } from './Status.tsx'
import { Hint, Text } from './text.tsx'
import { Button } from './ui/button.tsx'

/** The first message that asks for the questions rather than a draft. It is sent as written. */
const WALK = 'Ask me a few questions'

const DISCARD = {
  title: 'Discard this conversation?',
  description: 'It is not kept. Text you applied stays in the file.',
  action: 'Discard',
  destructive: true,
}

export function ImprovePanel({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const { thread, problem } = useImprove()
  const { choice } = useAi()
  const replacer = useReplacer()
  const passage = usePassage()
  // Kept with the conversation, not in the panel: closing the panel does not lose what was typed.
  const [reply, setReply] = useImproveDraft()
  const [confirm, confirmDialog] = useConfirm()
  const [failure, setFailure] = useState<string | null>(null)
  /** The message on its way, shown at once while Jev reads it and the reply starts. */
  const [pending, setPending] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [applied, setApplied] = useState(0)
  const pin = usePin()
  const messages = thread?.messages
  // The newest reply that holds a draft: Jev's reading belongs to it, and it opens on arrival.
  // A new rule starts from nothing, so every message sent in it rises in.
  const rested = useRested(thread ? (messages?.length ?? 0) : null)
  const latest = useMemo(
    () =>
      messages?.findLast((m) => m.role === 'assistant' && draftReply(m.text).draft !== null)?.id ??
      null,
    [messages],
  )

  if (!thread) return null
  const run = thread.run
  const running = pending !== null || run?.status === 'running'
  const error = failure ?? (run?.status === 'failed' ? run.error : null) ?? problem
  const step = currentStep(thread)
  // The rule as it reads in the file now; until the editor has said, the selection it opened on.
  const current = passage?.text ?? thread.scene.selection
  const progress =
    // One question needs no count.
    step && thread.walked && thread.steps.length > 1
      ? `Question ${thread.at + 1} of ${thread.steps.length}`
      : null

  const send = async (text: string, walk = false) => {
    const message = text.trim()
    if (!message || running) return
    setFailure(null)
    setNote(null)
    setPending(message)
    setReply('')
    pin.pinned.current = true
    try {
      await sendImprove(message, { walk, current: passage?.text })
    } catch (e) {
      setFailure((e as Error).message)
      if (!walk) setReply(text)
    } finally {
      setPending(null)
    }
  }

  const apply = (draft: string) => {
    if (!replacer) return
    setNote(null)
    if (replacer(current, draft) === 'missing')
      setNote('The rule is no longer in the file as it was. Select it again to start over.')
    else setApplied((n) => n + 1)
  }

  /** Going back closes this conversation, and nothing brings it back: ask once there is something in it to lose. */
  const back = async () => {
    if (thread.messages.length && !(await confirm(DISCARD))) return
    onBack()
  }

  const offer: Offer = replacer
    ? { kind: 'open' }
    : { kind: 'blocked', reason: 'Open SKILL.md on the Skill screen to apply it.' }
  const shown: ChatMessage[] =
    pending === null
      ? thread.messages
      : [...thread.messages, { id: -1, role: 'user', text: pending, at: '' }]

  return (
    <>
      <PanelHeader
        title="Improve a rule"
        back={{ label: 'Back to the chat', onBack: () => void back() }}
        onClose={onClose}
      />
      <PanelBody pin={pin}>
        {shown.length ? (
          <Conversation
            messages={shown}
            run={run}
            error={error}
            waiting={pending !== null}
            rested={rested}
            reply={(text, _skill, writing, id) => (
              <ImproveReply
                text={text}
                writing={writing}
                current={current}
                offer={offer}
                onApply={apply}
                latest={
                  id !== null && id === latest
                    ? { checklist: thread.checklist, judged: thread.judged, note }
                    : null
                }
              />
            )}
          />
        ) : (
          <EmptyState
            arrive
            size="screen"
            title="What should change?"
            more={
              <PlainList gap="none">
                <li>
                  <Button
                    type="button"
                    variant="ghost"
                    size="row"
                    disabled={!choice}
                    onClick={() => void send(WALK, true)}
                  >
                    {WALK}
                  </Button>
                </li>
              </PlainList>
            }
          >
            Say it in your own words, or answer a few questions first.
          </EmptyState>
        )}
      </PanelBody>
      {choice ? (
        <div className="shrink-0 px-3 pb-3">
          <Composer
            // A new rule is a new conversation: the field takes the focus, ready for the first words.
            key={thread.opened}
            autoFocus
            frame="box"
            label="Message about this rule"
            placeholder={
              step
                ? 'Answer in a sentence or two'
                : thread.messages.length
                  ? 'Ask for a change, or ask why'
                  : 'Say what should change'
            }
            value={reply}
            onChange={setReply}
            onSubmit={() => void send(reply)}
            running={running}
            // Until the reply has an id there is nothing to stop: the button waits disabled.
            onStop={run?.status === 'running' ? () => stopRun(run.id) : undefined}
            context={
              <ComposerTopic
                name={passage?.number ? `Rule ${passage.number}` : 'Selected text'}
                text={withoutListMark(current)}
                onShow={replacer ? showPassage : undefined}
                progress={progress}
                changes={applied}
              />
            }
          />
        </div>
      ) : null}
      {confirmDialog}
    </>
  )
}

/** What only the newest draft carries: Jev's reading of it, and why the last Apply did not land. */
interface Latest {
  checklist: ChecklistItem[] | null
  judged: boolean
  note: string | null
}

/** A reply as prose around its draft, the draft standing as a proposed change. */
function ImproveReply({
  text,
  writing,
  current,
  offer,
  onApply,
  latest,
}: {
  text: string
  writing: boolean
  current: string
  offer: Offer
  onApply: (draft: string) => void
  latest: Latest | null
}) {
  const parts = useMemo(() => draftReply(text), [text])
  const draft = parts.draft && keepListMark(current, parts.draft)
  return (
    <Stack gap="lg">
      {parts.before ? <Prose text={parts.before} density="compact" /> : null}
      {parts.writing ? (
        <DisclosureList label="Proposed change">
          <WritingRow label="SKILL.md" className="animate-ink" />
        </DisclosureList>
      ) : null}
      {draft !== null && !writing ? (
        <DraftRow
          draft={draft}
          current={current}
          offer={offer}
          onApply={() => onApply(draft)}
          latest={latest}
        />
      ) : draft !== null ? (
        <DisclosureList label="Proposed change">
          <WritingRow label="SKILL.md" />
        </DisclosureList>
      ) : null}
      {parts.after ? <Prose text={parts.after} density="compact" /> : null}
    </Stack>
  )
}

/** Jev's reading of a draft in a few words, for the row's detail line. */
const readingOf = (checklist: ChecklistItem[]): string => {
  const missing = checklist.filter((item) => !item.held).length
  return missing ? `Misses ${plural(missing, 'point')} of the guide` : 'Meets the guide'
}

/**
 * A draft as a proposed change to SKILL.md: how it stands against the guide
 * and how long it is, and one button. It opens to the change word by word
 * against the rule as it reads now, and for the newest draft, to what Jev
 * found still missing. Once the rule reads as the draft, the row says Applied;
 * any draft can be applied again, to go back to it.
 */
function DraftRow({
  draft,
  current,
  offer,
  onApply,
  latest,
}: {
  draft: string
  current: string
  offer: Offer
  onApply: () => void
  latest: Latest | null
}) {
  const done = current.trim() === draft.trim()
  const compared = useMemo(
    () => (done ? null : compareTexts(current, draft, { byPhrase: true })),
    [done, current, draft],
  )
  const checklist = latest?.checklist ?? null
  const missing = checklist?.filter((item) => !item.held) ?? []
  const detail = [
    checklist ? readingOf(checklist) : null,
    draft ? plural(wordCount(draft), 'word') : 'Deletes the rule',
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <Stack gap="sm">
      <DisclosureList label="Proposed change">
        <Disclosure
          // A newer draft takes the reader's eye: this one folds to its line.
          key={latest ? 'latest' : 'earlier'}
          variant="row"
          defaultOpen={latest !== null}
          summary={<Summary mono title="SKILL.md" detail={detail} />}
          action={
            <RowAction
              offer={offer}
              label={draft ? 'Apply' : 'Delete'}
              doneLabel={draft ? 'Applied' : 'Deleted'}
              done={done}
              onApply={onApply}
            />
          }
        >
          <Stack gap="md">
            {compared?.kind === 'words' ? (
              <WordDiff size="row" html={compared.html} arrive={latest !== null} />
            ) : compared?.kind === 'lines' ? (
              <DiffLines lines={compared.lines} />
            ) : (
              <Text as="p" size="ui" wrap="pre">
                {draft}
              </Text>
            )}
            {missing.length ? (
              <Stack gap="xs">
                {missing.map((item) => (
                  <Status key={item.principle} tone="warning" size="ui" detail={item.message}>
                    {item.lead}
                  </Status>
                ))}
              </Stack>
            ) : null}
            {latest && !latest.judged ? <Unjudged /> : null}
          </Stack>
        </Disclosure>
      </DisclosureList>
      {latest && offer.kind === 'blocked' ? <Hint>{offer.reason}</Hint> : null}
      {latest?.note ? (
        <Hint tone="destructive" role="alert">
          {latest.note}
        </Hint>
      ) : null}
    </Stack>
  )
}
