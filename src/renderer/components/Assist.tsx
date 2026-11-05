/**
 * "Write with AI", beside a text area. It opens from the field it writes for:
 * say what to write or change, watch the text arrive, then put it in the field
 * or drop it. Nothing reaches the field until it is accepted. Every field
 * names its kind, and the reply comes back in that kind's shape: a check is
 * one fact a judge can mark, a SKILL.md is rules in the graded form.
 */
import { ASSIST_FIELDS, type AssistContext, type AssistFieldId } from '@domain/assist.ts'
import { addImages, type ImageRef } from '@domain/image.ts'
import { PenLineIcon } from 'lucide-react'
import {
  type ComponentProps,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { startAssist, stopRun, useAi, useRun } from '../ai.ts'
import { lineDiff } from '../diff.ts'
import { navigate } from '../history.ts'
import { useAttached } from '../images.ts'
import { cn } from '../lib/utils.ts'
import { Composer } from './Composer.tsx'
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
}

const titleOf = (field: AssistFieldId): string => `Write ${ASSIST_FIELDS[field].name} with AI`

/** The quiet button that opens it from inside a field. */
export function AssistButton({
  field,
  className,
  ...props
}: ComponentProps<typeof Button> & { field: AssistFieldId }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={titleOf(field)}
      title={titleOf(field)}
      className={cn(
        // 24px to look at, 36px to hit: as far as it reaches without covering the field's text.
        'relative text-muted-foreground/80 before:absolute before:-inset-1.5 hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground [&_svg]:size-3.5',
        className,
      )}
      {...props}
    >
      <PenLineIcon aria-hidden="true" />
    </Button>
  )
}

interface AssistProps extends AssistSpec {
  /** The field's text now. */
  value: string
  /** Put the accepted text in the field. */
  onApply: (text: string) => void
  onOpenChange?: (open: boolean) => void
  /** What it opens beside, so the field stays in view; the control that opens it by default. */
  anchor?: RefObject<HTMLElement | null>
  /** The control that opens it. */
  children: ReactNode
}

export function Assist({
  field,
  value,
  onApply,
  context,
  images,
  onOpenChange,
  anchor,
  children,
}: AssistProps) {
  const def = ASSIST_FIELDS[field]
  const { providers, choice } = useAi()
  const [open, setOpen] = useState(false)
  const [request, setRequest] = useState('')
  const [runId, setRunId] = useState<number | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const run = useRun(runId)
  const attached = useAttached()
  const shown = useRef(false)
  const accept = useRef<HTMLButtonElement>(null)
  const reply = useRef<HTMLDivElement>(null)

  const running = starting || run?.status === 'running'
  const proposal = run?.status === 'done' ? run.text : null
  const error = failure ?? (run?.status === 'failed' ? run.error : null)
  /** A new version of a file reads best as what it changes. */
  const changes =
    proposal !== null && def.form === 'file' && value.trim() ? lineDiff(value, proposal) : null

  // The reply is ready: Return now accepts it.
  useEffect(() => {
    if (proposal !== null) accept.current?.focus()
  }, [proposal])
  // Follow the text as it arrives.
  const written = run?.text
  useLayoutEffect(() => {
    if (running && written && reply.current) reply.current.scrollTop = reply.current.scrollHeight
  }, [running, written])

  const reset = () => {
    setRunId(null)
    setFailure(null)
  }

  const change = (next: boolean) => {
    shown.current = next
    if (!next) {
      if (run?.status === 'running') void stopRun(run.id)
      reset()
      setRequest('')
      attached.reset()
    }
    setOpen(next)
    onOpenChange?.(next)
  }

  const ask = async (text: string) => {
    if (!text.trim() || running) return
    reset()
    setStarting(true)
    try {
      const started = await startAssist({
        field,
        instruction: text,
        current: value,
        context: (await context?.()) ?? [],
        images: addImages(images?.() ?? [], attached.images),
      })
      // Closed while the request was starting: nobody is waiting for the reply.
      if (shown.current) setRunId(started.id)
      else void stopRun(started.id)
    } catch (e) {
      setFailure((e as Error).message)
    } finally {
      setStarting(false)
    }
  }

  const body = !providers ? (
    <PopoverSection>
      <PopoverLabel>Loading…</PopoverLabel>
    </PopoverSection>
  ) : !choice ? (
    <PopoverSection className="gap-2 p-3">
      <Text size="ui" weight="medium">
        Connect a provider to write with AI
      </Text>
      <Hint>
        Add an Anthropic or OpenAI key, or use the Claude Code or Codex CLI you are signed in to.
      </Hint>
      <Toolbar>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            change(false)
            navigate('settings')
          }}
        >
          Open Settings
        </Button>
      </Toolbar>
    </PopoverSection>
  ) : (
    <Composer
      label={titleOf(field)}
      placeholder={value.trim() ? 'Describe what to change' : 'Describe what to write'}
      autoFocus
      value={request}
      onChange={setRequest}
      onSubmit={() => void ask(request)}
      running={Boolean(running)}
      onStop={() => run && void stopRun(run.id)}
      pictures={attached}
      actions={
        proposal !== null ? (
          <>
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
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
              {value.trim() ? 'Replace' : 'Insert'}
            </Button>
          </>
        ) : undefined
      }
    >
      {error ? (
        <Hint tone="destructive" className="border-t px-3 py-2.5" role="alert">
          {error}
        </Hint>
      ) : run ? (
        <div
          ref={reply}
          aria-live="polite"
          className="mb-2 max-h-72 overflow-y-auto overscroll-contain border-y bg-muted/50 px-3 py-2.5 text-ui"
        >
          {changes ? (
            changes.length ? (
              <DiffLines lines={changes} />
            ) : (
              <Text tone="muted">The same text came back: there is nothing to change.</Text>
            )
          ) : run.text ? (
            <Text as="p" wrap="pre">
              {run.text}
            </Text>
          ) : (
            <Text tone="muted">{run.status === 'stopped' ? 'Stopped.' : 'Writing…'}</Text>
          )}
        </div>
      ) : starting ? null : (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2.5">
          {def.suggestions.map((suggestion) => (
            <Button
              key={suggestion}
              type="button"
              variant="outline"
              size="xs"
              onClick={() => {
                setRequest(suggestion)
                void ask(suggestion)
              }}
            >
              {suggestion}
            </Button>
          ))}
        </div>
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
        aria-label={titleOf(field)}
      >
        {body}
      </PopoverContent>
    </Popover>
  )
}
