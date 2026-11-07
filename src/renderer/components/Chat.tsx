/**
 * The assistant's side panel: one conversation that stays open beside
 * whatever screen is in view and is still there after a restart. It knows the
 * open skill and the screen, so a question can say "this rule" and mean it.
 * The model, its effort and what has been spent are in reach from here.
 */
import type { AiRun, ChatMessage } from '@domain/ai.ts'
import { SquarePenIcon, XIcon } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { clearChat, loadAi, loadChat, sendChat, stopRun, useAi, useChat } from '../ai.ts'
import { navigate } from '../history.ts'
import { useAttached } from '../images.ts'
import { shortcut } from '../keys.ts'
import { Composer } from './Composer.tsx'
import type { Confirm } from './confirm.tsx'
import { EmptyState, Loading, PlainList, ReadFailed, Spacer } from './layout.tsx'
import { PictureStrip } from './Pictures.tsx'
import { Prose } from './Prose.tsx'
import { Heading, Hint, Text } from './text.tsx'
import { UsageButton } from './Usage.tsx'
import { Button } from './ui/button.tsx'

/** Within this many pixels of the end, new text keeps the view at the end. */
const PINNED_WITHIN = 48

interface ChatPanelProps {
  /** The screen in view, by its name in the sidebar. */
  screen: string
  /** The open skill's name; null when none is open. */
  skill: string | null
  confirm: Confirm
  onClose: () => void
}

const starters = (skill: string | null): string[] =>
  skill
    ? [
        `Which rules in ${skill} are too vague to grade?`,
        `Suggest three cases that would test ${skill}.`,
        'How do I write a check a judge can mark?',
      ]
    : [
        'What makes a rule an agent actually follows?',
        'How do I write a check a judge can mark?',
        'What should a skill’s description say?',
      ]

export function ChatPanel({ screen, skill, confirm, onClose }: ChatPanelProps) {
  const { thread } = useChat()
  const { providers, choice } = useAi()
  const [draft, setDraft] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const attached = useAttached()
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  const messages = thread?.messages ?? []
  const run = thread?.run ?? null
  const running = sending || run?.status === 'running'
  const error = failure ?? (run?.status === 'failed' ? run.error : null)

  // After every render, keep the newest text in view unless the reader scrolled away from it.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  })

  const send = async (text: string) => {
    const images = attached.images
    if ((!text.trim() && !images.length) || running) return
    setFailure(null)
    setSending(true)
    setDraft('')
    attached.reset()
    pinned.current = true
    try {
      await sendChat(text.trim(), images, screen)
    } catch (e) {
      setFailure((e as Error).message)
      setDraft(text)
      attached.reset(images)
    } finally {
      setSending(false)
    }
  }

  const startOver = async () => {
    if (
      await confirm({
        title: 'Start a new conversation?',
        description: 'This one is not kept.',
        action: 'Start',
      })
    ) {
      setFailure(null)
      await clearChat()
    }
  }

  const body =
    !providers || !thread ? (
      <Unread />
    ) : !choice ? (
      <EmptyState
        size="screen"
        title="Connect a provider"
        actions={
          <Button type="button" onClick={() => navigate('settings')}>
            Open Settings
          </Button>
        }
      >
        Add an Anthropic or OpenAI key, or use the Claude Code or Codex CLI you are signed in to.
      </EmptyState>
    ) : !messages.length && !run ? (
      <EmptyState
        size="screen"
        title="Ask about your skill"
        more={
          <PlainList gap="none">
            {starters(skill).map((question) => (
              <li key={question}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto w-full justify-start py-1.5 text-left font-normal whitespace-normal"
                  onClick={() => void send(question)}
                >
                  {question}
                </Button>
              </li>
            ))}
          </PlainList>
        }
      >
        Rules, cases, checks and scores. It reads the open skill, and changes nothing.
      </EmptyState>
    ) : (
      <Conversation messages={messages} run={run} error={error} />
    )

  return (
    <>
      <header
        data-drag
        className="flex h-12 shrink-0 items-center gap-1 border-b pr-2 pl-4 pointer-coarse:gap-3"
      >
        <Heading level="page" as="h2">
          Assistant
        </Heading>
        <Spacer />
        <UsageButton />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="New conversation"
          title="New conversation"
          disabled={!messages.length && !run}
          onClick={startOver}
        >
          <SquarePenIcon aria-hidden="true" />
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
        {body}
      </div>
      {choice ? (
        <div className="shrink-0 px-3 pb-3">
          <Composer
            frame="box"
            label="Message the assistant"
            placeholder={skill ? `Ask about ${skill}` : 'Ask a question'}
            value={draft}
            onChange={setDraft}
            onSubmit={() => void send(draft)}
            running={Boolean(running)}
            onStop={() => run && stopRun(run.id)}
            pictures={attached}
            picturesSuffice
          />
        </div>
      ) : null}
    </>
  )
}

/** The messages so far, the reply being written under them, and why the last one failed. */
function Conversation({
  messages,
  run,
  error,
}: {
  messages: ChatMessage[]
  run: AiRun | null
  error: string | null
}) {
  return (
    <ol className="m-0 flex flex-col gap-4 px-4 py-4">
      {messages.map((message) =>
        message.role === 'user' ? (
          <li key={message.id} className="ml-8 flex max-w-full flex-col items-end gap-2 self-end">
            {message.images?.length ? (
              <PictureStrip
                size="md"
                label="Pictures with this message"
                className="justify-end"
                images={message.images}
              />
            ) : null}
            {message.text ? (
              <p className="m-0 max-w-full rounded-chin bg-secondary px-3 py-2 text-sm break-words whitespace-pre-wrap">
                {message.text}
              </p>
            ) : null}
          </li>
        ) : (
          <li key={message.id}>
            <Prose text={message.text} density="compact" />
          </li>
        ),
      )}
      {run?.status === 'running' ? (
        <li aria-live="polite">
          {run.text ? (
            <Prose text={run.text} density="compact" />
          ) : (
            <Text tone="muted" className="animate-pulse">
              Thinking…
            </Text>
          )}
        </li>
      ) : null}
      {error ? (
        <li>
          <Hint tone="destructive" role="alert">
            {error}
          </Hint>
        </li>
      ) : null}
    </ol>
  )
}

/** In place of the conversation until it and the providers are read: loading, or why a read failed. */
function Unread() {
  const ai = useAi()
  const chat = useChat()
  const problem = (!ai.providers && ai.problem) || (!chat.thread && chat.problem)
  if (!problem) return <Loading size="screen" />
  return (
    <ReadFailed
      size="screen"
      title="Could not reach the assistant"
      onRetry={() => {
        void loadAi()
        void loadChat()
      }}
    >
      {problem}
    </ReadFailed>
  )
}
