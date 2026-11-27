/**
 * "Write with AI", beside a text area. It opens from the field it writes for:
 * say what to write or change, watch the text arrive, then put it in the field
 * or drop it. Nothing reaches the field until it is accepted. Every field
 * names its kind, and the reply comes back in that kind's shape: a check is
 * one fact Jev can mark, a SKILL.md is rules in the graded form. Beside a
 * list it writes new items, which are added to the ones there; one the list
 * has already is left out before it is shown.
 */
import type { AiRun } from '@domain/ai.ts'
import {
  ASSIST_FIELDS,
  type AssistContext,
  type AssistFieldId,
  leftOutLine,
  madeFor,
  NOTHING_TO_ADD,
  toAdd,
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
import { loadAi, startAssist, useAi } from '../ai.ts'
import { lineDiff } from '../diff.ts'
import { navigate } from '../history.ts'
import { useAttached } from '../images.ts'
import { useHeldRun } from '../started-run.ts'
import { Composer } from './Composer.tsx'
import { CornerButton } from './CornerButton.tsx'
import { DiffLines } from './DiffLines.tsx'
import { Stack, Toolbar } from './layout.tsx'
import { Excerpt, Hint, Text, Working } from './text.tsx'
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
  /** Beside a list, its items now: a new one that says what one of them says is left out. */
  items?: readonly string[]
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

/** The reply a "write with AI" request starts is what the request answers. */
const itself = (run: AiRun): AiRun => run

/** In place of the composer until the providers are known: loading, or why they could not be read. */
function Unread({ problem }: { problem: string | null }) {
  if (!problem)
    return (
      <PopoverSection>
        <PopoverLabel>
          <Working>Loading…</Working>
        </PopoverLabel>
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
        Writing with AI is not set up
      </Text>
      <Hint>Set up Claude Code or Codex, or add an API key, in Settings.</Hint>
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
  list,
  had,
}: {
  run: AiRun
  /** The field's text now. */
  current: string
  /** A new version of a file reads best as what it changes. */
  asChanges: boolean
  /** It writes new items for a list: what was left out of the reply is said under it. */
  list: boolean
  /** Add found every new item in the list by then: there is nothing left to add. */
  had: boolean
}) {
  const box = useRef<HTMLDivElement>(null)
  const { status } = run
  const text = had ? '' : run.text
  // Follow the text as it arrives.
  useLayoutEffect(() => {
    if (status === 'running' && text && box.current)
      box.current.scrollTop = box.current.scrollHeight
  }, [status, text])
  const changes = useMemo(
    () => (status === 'done' && asChanges ? lineDiff(current, text) : null),
    [status, asChanges, current, text],
  )
  /** The new checks the list has already, or that the reply said twice, are left out and said so. */
  const leftOut =
    status === 'done' && list ? (had ? NOTHING_TO_ADD : leftOutLine(run.leftOut, text)) : null
  return (
    <Excerpt ref={box} holds="writing" edge="bleed" aria-live="polite" className="mb-2">
      {leftOut && !text ? (
        <Text tone="muted">{leftOut}</Text>
      ) : status === 'done' && text === current ? (
        <Text tone="muted">The same text came back: there is nothing to change.</Text>
      ) : changes ? (
        <DiffLines lines={changes} />
      ) : leftOut ? (
        <Stack gap="md">
          <Text as="p" wrap="pre">
            {text}
          </Text>
          <Text as="p" tone="muted">
            {leftOut}
          </Text>
        </Stack>
      ) : text ? (
        <Text as="p" wrap="pre">
          {text}
        </Text>
      ) : (
        <Text tone="muted">{status === 'stopped' ? 'Stopped.' : <Working>Writing…</Working>}</Text>
      )}
    </Excerpt>
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
  items,
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
  /**
   * One request and its reply, for this popover. Discarding it or leaving the
   * screen stops the writing. Closing the popover does not: the reply goes on,
   * and opening it again on the same text finds it where it was, or finished.
   */
  const work = useHeldRun(itself)
  const attached = useAttached()
  const accept = useRef<HTMLButtonElement>(null)
  /** Add found every new item one the list has by then, such as one added by hand meanwhile. */
  const [had, setHad] = useState(false)

  /** The field has text, so a request changes it and the reply takes its place. */
  const editing = !blank && Boolean(value.trim())
  const proposal = work.run?.status === 'done' ? work.run.text : null
  /** The same text back is nothing to accept, and nor is a list's that Add found in it already. */
  const acceptable = proposal !== null && proposal !== value && !had
  /** A reply is on its way or ready: closing the popover keeps it. */
  const held = work.running || acceptable
  /** The field, its text and a list's items the request in hand was made for (`madeFor`). A reply is only for those. */
  const askedFor = useRef<string | null>(null)
  const now = useRef('')
  now.current = madeFor(field, value, items)

  // The reply is ready: Return now accepts it.
  useEffect(() => {
    if (acceptable) accept.current?.focus()
  }, [acceptable])

  /** Let go of the request, its reply and what was typed for it. */
  const letGo = () => {
    work.discard()
    setRequest('')
    attached.reset()
    askedFor.current = null
    setHad(false)
  }

  // Opened again on other text than the reply was written for, such as after
  // the editor's selection moved, or beside a list whose items have changed:
  // that reply is for text no longer here.
  // biome-ignore lint/correctness/useExhaustiveDependencies: checked only as it opens, against what stands then
  useEffect(() => {
    const was = askedFor.current
    if (!open || !was) return
    if (was !== now.current) letGo()
  }, [open])

  const change = (next: boolean) => {
    if (!next && !held) letGo()
    setOpen(next)
    onOpenChange?.(next)
  }

  const ask = (instruction: string) => {
    // One at a time: a request made while a reply is on its way is not sent.
    if (!instruction.trim() || work.running) return
    askedFor.current = madeFor(field, value, items)
    setHad(false)
    // Built as it is sent, so the texts beside the field are current.
    void work.start(async () =>
      startAssist({
        field,
        instruction,
        current: value,
        context: (await context?.()) ?? [],
        images: addImages(images?.() ?? [], attached.images),
        ...(items ? { items: [...items] } : {}),
      }),
    )
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
            <Button type="button" variant="ghost" size="sm" onClick={letGo}>
              Discard
            </Button>
            <Button
              ref={accept}
              type="button"
              size="sm"
              onClick={() => {
                // Beside a list, as it stands now: a check added since the request is not added twice.
                const adding = def.form === 'items' ? toAdd(proposal, items ?? []) : proposal
                if (adding === null) {
                  setHad(true)
                  return
                }
                onApply(adding)
                letGo()
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
        <Reply
          run={work.run}
          current={value}
          asChanges={def.form === 'file' && editing}
          list={def.form === 'items'}
          had={had}
        />
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
