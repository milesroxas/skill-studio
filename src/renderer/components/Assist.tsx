/**
 * "Write with AI", beside a text area. It opens from the field it writes for:
 * say what to write or change, watch the text arrive, then put it in the field
 * or drop it. Nothing reaches the field until it is accepted. Every field
 * names its kind, and the reply comes back in that kind's shape: a check is
 * one fact a judge can mark, a SKILL.md is rules in the graded form. Beside a
 * list it writes new items, which are added to the ones there.
 */
import type { AiRun } from '@domain/ai.ts'
import {
  ASSIST_FIELDS,
  type AssistContext,
  type AssistFieldId,
  type AssistInput,
} from '@domain/assist.ts'
import { addImages, type ImageRef } from '@domain/image.ts'
import { PenLineIcon } from 'lucide-react'
import {
  type ComponentProps,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { loadAi, startAssist, stopRun, useAi, useRun } from '../ai.ts'
import { lineDiff } from '../diff.ts'
import { navigate } from '../history.ts'
import { useAttached } from '../images.ts'
import { Composer } from './Composer.tsx'
import { CornerButton } from './CornerButton.tsx'
import { DiffLines } from './DiffLines.tsx'
import { Toolbar } from './layout.tsx'
import { Hint, Text } from './text.tsx'
import { Button } from './ui/button.tsx'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverLabel,
  PopoverSection,
  PopoverTrigger,
} from './ui/popover.tsx'

/** What a field tells the assistant about itself. */
export interface AssistSpec {
  field: AssistFieldId
  /** Texts the model reads beside the field, gathered when a request is sent, so they are current. */
  context?: () => AssistContext[] | Promise<AssistContext[]>
  /** Pictures the model reads beside the field without being asked, such as the case's own. */
  images?: () => ImageRef[]
  /** The field holds only a scaffold, so the offers are for writing, not for changing. */
  blank?: boolean
}

/** What the control is called, for the button that opens it and for the popover. */
export const assistTitle = (field: AssistFieldId): string =>
  `Write ${ASSIST_FIELDS[field].name} with AI`

/** The quiet button that opens it from inside a field. */
export function AssistButton({
  field,
  className,
  ...props
}: ComponentProps<typeof Button> & { field: AssistFieldId }) {
  return (
    <CornerButton
      aria-label={assistTitle(field)}
      title={assistTitle(field)}
      className={className}
      {...props}
    >
      <PenLineIcon aria-hidden="true" />
    </CornerButton>
  )
}

interface AssistProps extends AssistSpec {
  /** The field's text now; empty beside a list, whose items the context holds. */
  value: string
  /** Put the accepted text in the field, or its items in the list. */
  onApply: (text: string) => void
  /** Opened from outside the trigger, such as by a line on an empty page. Uncontrolled when absent. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** What it opens beside, so the field stays in view; the control that opens it by default. */
  anchor?: RefObject<HTMLElement | null>
  /** The control that opens it. */
  children: ReactNode
}

/**
 * One request and its reply, for the popover that asked. The reply is that
 * popover's alone: discarding it, closing the popover or leaving the screen
 * stops the writing.
 */
function useAssistRun() {
  const [runId, setRunId] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const run = useRun(runId)
  /**
   * Counts the requests made and the times one was let go. A request whose
   * count has moved on by the time it starts has nobody waiting for it.
   */
  const asked = useRef(0)
  const running = starting || run?.status === 'running'

  useEffect(() => {
    if (runId === null) return
    return () => stopRun(runId)
  }, [runId])
  // A request still starting when the screen goes is stopped as it arrives.
  useEffect(
    () => () => {
      asked.current += 1
    },
    [],
  )

  /** Let go of the request in hand and its reply. */
  const discard = () => {
    asked.current += 1
    setStarting(false)
    setRunId(null)
    setFailure(null)
  }

  /** Make a request, built as it is sent so it is current. One at a time. */
  const start = async (input: () => Promise<AssistInput>) => {
    if (running) return
    discard()
    const mine = asked.current
    setStarting(true)
    try {
      const started = await startAssist(await input())
      if (asked.current !== mine) return stopRun(started.id)
      setRunId(started.id)
    } catch (e) {
      if (asked.current !== mine) return
      setFailure((e as Error).message)
    }
    setStarting(false)
  }

  return {
    run,
    starting,
    running,
    error: failure ?? (run?.status === 'failed' ? run.error : null),
    start,
    /** A reply being written stops where it is; a request still starting is let go. */
    stop: () => (run ? stopRun(run.id) : discard()),
    discard,
  }
}

/** In place of the composer until the providers are known: loading, or why they could not be read. */
function Unread({ problem }: { problem: string | null }) {
  if (!problem)
    return (
      <PopoverSection>
        <PopoverLabel>Loading…</PopoverLabel>
      </PopoverSection>
    )
  return (
    <PopoverSection pad="text">
      <Hint tone="destructive" role="alert">
        Could not reach the assistant. {problem}
      </Hint>
      <Toolbar>
        <Button type="button" variant="outline" size="sm" onClick={() => void loadAi()}>
          Try again
        </Button>
      </Toolbar>
    </PopoverSection>
  )
}

/** In place of the composer while no provider is connected. */
function Connect({ onSettings }: { onSettings: () => void }) {
  return (
    <PopoverSection pad="text">
      <Text size="ui" weight="medium">
        Connect a provider to write with AI
      </Text>
      <Hint>
        Add an Anthropic or OpenAI key, or use the Claude Code or Codex CLI you are signed in to.
      </Hint>
      <Toolbar>
        <Button type="button" size="sm" onClick={onSettings}>
          Open Settings
        </Button>
      </Toolbar>
    </PopoverSection>
  )
}

/** The reply under the request: the text as it arrives, then what it would put in the field. */
function Reply({
  run,
  current,
  asChanges,
}: {
  run: AiRun
  /** The field's text now. */
  current: string
  /** A new version of a file reads best as what it changes. */
  asChanges: boolean
}) {
  const box = useRef<HTMLDivElement>(null)
  const { status, text } = run
  // Follow the text as it arrives.
  useLayoutEffect(() => {
    if (status === 'running' && text && box.current)
      box.current.scrollTop = box.current.scrollHeight
  }, [status, text])
  const changes = useMemo(
    () => (status === 'done' && asChanges ? lineDiff(current, text) : null),
    [status, asChanges, current, text],
  )
  return (
    <div
      ref={box}
      aria-live="polite"
      className="mb-2 max-h-72 overflow-y-auto overscroll-contain border-y bg-muted/50 px-3 py-2.5 text-ui"
    >
      {status === 'done' && text === current ? (
        <Text tone="muted">The same text came back: there is nothing to change.</Text>
      ) : changes ? (
        <DiffLines lines={changes} />
      ) : text ? (
        <Text as="p" wrap="pre">
          {text}
        </Text>
      ) : (
        <Text tone="muted">{status === 'stopped' ? 'Stopped.' : 'Writing…'}</Text>
      )}
    </div>
  )
}

/** Requests to make in one click, before anything is asked. */
function Suggestions({
  requests,
  onPick,
}: {
  requests: readonly string[]
  onPick: (request: string) => void
}) {
  if (!requests.length) return null
  return (
    <div className="flex flex-wrap gap-1.5 px-3 pb-2.5">
      {requests.map((request) => (
        <Button
          key={request}
          type="button"
          variant="outline"
          size="xs"
          onClick={() => onPick(request)}
        >
          {request}
        </Button>
      ))}
    </div>
  )
}

export function Assist({
  field,
  value,
  onApply,
  context,
  images,
  blank,
  open: controlled,
  onOpenChange,
  anchor,
  children,
}: AssistProps) {
  const def = ASSIST_FIELDS[field]
  const { providers, choice, problem } = useAi()
  const [own, setOpen] = useState(false)
  const open = controlled ?? own
  const [request, setRequest] = useState('')
  const work = useAssistRun()
  const attached = useAttached()
  const accept = useRef<HTMLButtonElement>(null)

  /** The field has text, so a request changes it and the reply takes its place. */
  const editing = !blank && Boolean(value.trim())
  const proposal = work.run?.status === 'done' ? work.run.text : null
  /** The same text back is nothing to accept. */
  const acceptable = proposal !== null && proposal !== value

  // The reply is ready: Return now accepts it.
  useEffect(() => {
    if (acceptable) accept.current?.focus()
  }, [acceptable])

  const change = (next: boolean) => {
    if (!next) {
      work.discard()
      setRequest('')
      attached.reset()
    }
    setOpen(next)
    onOpenChange?.(next)
  }

  const ask = (instruction: string) => {
    if (!instruction.trim()) return
    void work.start(async () => ({
      field,
      instruction,
      current: value,
      context: (await context?.()) ?? [],
      images: addImages(images?.() ?? [], attached.images),
    }))
  }

  const body = !providers ? (
    <Unread problem={problem} />
  ) : !choice ? (
    <Connect
      onSettings={() => {
        change(false)
        navigate('settings')
      }}
    />
  ) : (
    <Composer
      label={assistTitle(field)}
      placeholder={editing ? 'Describe what to change' : 'Describe what to write'}
      autoFocus
      value={request}
      onChange={setRequest}
      onSubmit={() => ask(request)}
      running={work.running}
      onStop={work.stop}
      pictures={attached}
      actions={
        acceptable ? (
          <>
            <Button type="button" variant="ghost" size="sm" onClick={work.discard}>
              Discard
            </Button>
            <Button
              ref={accept}
              type="button"
              size="sm"
              onClick={() => {
                onApply(proposal)
                change(false)
              }}
            >
              {def.form === 'items' ? 'Add' : editing ? 'Replace' : 'Insert'}
            </Button>
          </>
        ) : undefined
      }
    >
      {work.error ? (
        <Hint tone="destructive" className="border-t px-3 py-2.5" role="alert">
          {work.error}
        </Hint>
      ) : work.run ? (
        <Reply run={work.run} current={value} asChanges={def.form === 'file' && editing} />
      ) : work.starting ? null : (
        <Suggestions
          requests={def.suggestions[editing ? 'edit' : 'write']}
          onPick={(suggestion) => {
            setRequest(suggestion)
            ask(suggestion)
          }}
        />
      )}
    </Composer>
  )

  return (
    <Popover open={open} onOpenChange={change}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      {anchor ? <PopoverAnchor virtualRef={anchor as RefObject<HTMLElement>} /> : null}
      <PopoverContent
        align="end"
        size={def.form === 'file' ? 'compose-wide' : 'compose'}
        aria-label={assistTitle(field)}
        // Its own surface, though React nests it in the screen: a shortcut typed here is not the screen's.
        onKeyDown={(event) => event.stopPropagation()}
      >
        {body}
      </PopoverContent>
    </Popover>
  )
}
