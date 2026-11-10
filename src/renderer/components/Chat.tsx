/**
 * The assistant's side panel: one conversation that stays open beside
 * whatever screen is in view and is still there after a restart. It knows the
 * screen, the file or case open on it and the skill with its unsaved edits,
 * so a question can say "this rule" or "the file I just made" and mean it,
 * and a reply can propose changes to the skill, each applied with a button.
 * A message that starts with a slash is a command: one of the panel's own, or
 * one of the CLI's skills, picked from a list that opens on the slash. The
 * model, its effort and what has been spent are in reach from here.
 */
import type { AiRun, ChatMessage } from '@domain/ai.ts'
import { SquarePenIcon } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  clearChat,
  loadAi,
  loadChat,
  loadCommands,
  sendChat,
  stopRun,
  useAi,
  useChat,
  useChatDraft,
  useCommands,
} from '../ai.ts'
import { APP_COMMANDS, appCommandOf } from '../commands.ts'
import type { Ctx } from '../ctx.ts'
import { navigate } from '../history.ts'
import { useAttached } from '../images.ts'
import { openAt } from '../route.ts'
import { type ChangeHost, Reply } from './Change.tsx'
import { Composer } from './Composer.tsx'
import type { Confirm } from './confirm.tsx'
import { EmptyState, Loading, PlainList, ReadFailed } from './layout.tsx'
import { PanelBody, PanelHeader, usePin } from './PanelFrame.tsx'
import { PictureStrip } from './Pictures.tsx'
import { Prose } from './Prose.tsx'
import { Hint, Text } from './text.tsx'
import { UsageButton } from './Usage.tsx'
import { Button } from './ui/button.tsx'

interface ChatPanelProps {
  /** The screen in view, by its name in the sidebar. */
  screen: string
  /** The open skill's name; null when none is open. */
  skill: string | null
  /** The open skill, once it is loaded: where the changes a reply proposes are applied. */
  ctx: Ctx | null
  confirm: Confirm
  onClose: () => void
}

/** No skill is open: there are no files to read again. */
const noRead = (): void => {}

const starters = (skill: string | null): string[] =>
  skill
    ? [
        `Which rules in ${skill} are too vague to grade?`,
        `Suggest three cases that would test ${skill}.`,
        'How do I write a check Jev can mark?',
      ]
    : [
        'What makes a rule an agent actually follows?',
        'How do I write a check Jev can mark?',
        'What should a skill’s description say?',
      ]

export function ChatPanel({ screen, skill, ctx, confirm, onClose }: ChatPanelProps) {
  const { thread } = useChat()
  const { providers, choice } = useAi()
  const commands = useCommands()
  // Kept with the conversation, not in the panel: closing the panel does not lose what was typed.
  const [draft, setDraft] = useChatDraft()
  const [failure, setFailure] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [clearing, setClearing] = useState(false)
  const attached = useAttached()
  const pin = usePin()

  const messages = thread?.messages ?? []
  const run = thread?.run ?? null

  // The skill's files as saved, the shell's one copy: a file change shows against them.
  const disk = ctx?.files ?? null
  const files = disk?.saved ?? null
  // A failed read is said once, in the reply, with the way to read again: a row cannot apply without it.
  const filesProblem = files === null ? (disk?.error ?? null) : null
  const readFiles = disk?.reload ?? noRead
  const readingFiles = disk?.loading ?? false
  const host = useMemo<ChangeHost>(
    () => ({
      ctx,
      files,
      filesProblem,
      readFiles: { run: readFiles, running: readingFiles },
    }),
    [ctx, files, filesProblem, readFiles, readingFiles],
  )
  const reply = (text: string, skillOf: string | undefined, writing: boolean) => (
    <Reply text={text} skill={skillOf} writing={writing} host={host} />
  )
  const running = sending || run?.status === 'running'
  const error = failure ?? (run?.status === 'failed' ? run.error : null)

  // The commands on offer are the provider's: read them when it is known, and again when it changes.
  const provider = choice?.provider ?? null
  useEffect(() => {
    if (provider) void loadCommands()
  }, [provider])

  const send = async (text: string) => {
    const command = appCommandOf(text)
    if (command) {
      setDraft('')
      command.run({ startOver: () => void startOver() })
      return
    }
    const images = attached.images
    if ((!text.trim() && !images.length) || running) return
    setFailure(null)
    setSending(true)
    setDraft('')
    attached.reset()
    pin.pinned.current = true
    try {
      // The backend reads the skill with its stored drafts, so the latest keystrokes go first.
      await ctx?.drafts.flush()
      const open = ctx
        ? openAt(
            ctx.route,
            ctx.state.cases.map((c) => c.id),
          )
        : { file: null, case: null }
      await sendChat(text.trim(), images, screen, open)
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
      setClearing(true)
      try {
        await clearChat()
      } catch (e) {
        setFailure((e as Error).message)
      } finally {
        setClearing(false)
      }
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
        Set up Claude Code or Codex, or add an Anthropic or OpenAI API key.
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
                  size="row"
                  onClick={() => void send(question)}
                >
                  {question}
                </Button>
              </li>
            ))}
          </PlainList>
        }
      >
        Rules, cases, checks and scores. It reads the open skill, and changes it only when you apply
        a change it proposes.
      </EmptyState>
    ) : (
      <Conversation messages={messages} run={run} error={error} reply={reply} />
    )

  return (
    <>
      <PanelHeader title="Assistant" onClose={onClose}>
        <UsageButton />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="New conversation"
          title="New conversation"
          disabled={!messages.length && !run}
          busy={clearing}
          onClick={() => void startOver()}
        >
          <SquarePenIcon aria-hidden="true" />
        </Button>
      </PanelHeader>
      <PanelBody pin={pin}>{body}</PanelBody>
      {choice ? (
        <div className="shrink-0 px-3 pb-3">
          <Composer
            frame="box"
            label="Message the assistant"
            placeholder={`${skill ? `Ask about ${skill}` : 'Ask a question'}, or type / for a command`}
            value={draft}
            onChange={setDraft}
            onSubmit={(text) => void send(text)}
            running={Boolean(running)}
            // Until the reply has an id there is nothing to stop: the button waits disabled.
            onStop={run?.status === 'running' ? () => stopRun(run.id) : undefined}
            pictures={attached}
            picturesSuffice
            commands={{
              sections: [
                { label: 'Assistant', commands: [...APP_COMMANDS], instant: true, compact: true },
                // A provider that runs no skills gets no empty section.
                ...(commands.list?.length === 0 && !commands.problem
                  ? []
                  : [{ label: 'Skills', commands: commands.list, problem: commands.problem }]),
              ],
            }}
          />
        </div>
      ) : null}
    </>
  )
}

/** A reply as prose, by default: a conversation that proposes changes shows them too. */
const prose = (text: string): ReactNode => <Prose text={text} density="compact" />

/** The messages so far, the reply being written under them, and why the last one failed. */
export function Conversation({
  messages,
  run,
  error,
  reply = prose,
}: {
  messages: ChatMessage[]
  run: AiRun | null
  error: string | null
  /** How a reply reads: its text, the skill it was written about, and whether it is still arriving. */
  reply?: (text: string, skill: string | undefined, writing: boolean) => ReactNode
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
          <li key={message.id}>{reply(message.text, message.skill, false)}</li>
        ),
      )}
      {run?.status === 'running' ? (
        <li aria-live="polite">
          {run.text ? (
            reply(run.text, undefined, true)
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
