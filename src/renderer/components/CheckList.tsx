/**
 * A case's checks, as a list that is typed like one: Enter starts the next
 * check, Backspace on an empty one takes it away, and the keyboard follows
 * each row that comes or goes. A check is its statement, the picture it is
 * about when it has one, and whether it counts double.
 *
 * Mount one per case (`key` it by the case), so a row, an Undo and a picture
 * on its way all belong to the case they were made in.
 */
import { assistItems } from '@domain/assist.ts'
import { DOUBLE, newCheck, weightMark } from '@domain/case-draft.ts'
import type { ImageRef } from '@domain/image.ts'
import type { CaseDraft } from '@domain/schemas.ts'
import { PenLineIcon, PlusIcon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Reporter } from '../hooks.ts'
import { useAddPictures } from '../images.ts'
import { Assist, type AssistSpec, assistTitle } from './Assist.tsx'
import { PlainList, Stack, Toolbar } from './layout.tsx'
import { PicturePicker, PictureStrip } from './Pictures.tsx'
import { TextArea } from './TextArea.tsx'
import { Text } from './text.tsx'
import { Button } from './ui/button.tsx'
import { Toggle } from './ui/toggle.tsx'

type Check = CaseDraft['graders'][number]

let made = 0
/** A name for a row that lasts as long as the row does, whatever its place in the list. */
const rowKey = (): string => `row-${++made}`

/**
 * A row's name by its place. Checks that are not saved yet have no id of
 * their own, so the names are kept beside the list and moved with it: a row
 * keeps its field, and a picture on its way to it, when another row goes.
 */
function useRowKeys(count: number) {
  const keys = useRef<string[]>([])
  // A list changed from outside, by an example or the assistant: names for the rows it has now.
  while (keys.current.length < count) keys.current.push(rowKey())
  keys.current.length = count
  return {
    keys: keys.current,
    added: (at: number) => keys.current.splice(at, 0, rowKey()),
    removed: (at: number) => keys.current.splice(at, 1),
  }
}

export function CheckList({
  graders,
  onChange,
  examples,
  assist,
  report,
}: {
  graders: Check[]
  onChange: (graders: Check[]) => void
  /** Statements to show in empty rows, as examples of what a check says. */
  examples: readonly string[]
  /** What the assistant reads beside a check: the skill, the case as typed, its pictures. */
  assist: Omit<AssistSpec, 'field'>
  report: Reporter
}) {
  const rows = useRowKeys(graders.length)
  /** The list as it stands when an Undo is taken, which may be a few edits after it was offered; null once this case is left. */
  const live = useRef<{ graders: Check[]; onChange: (graders: Check[]) => void } | null>(null)
  live.current = { graders, onChange }
  useEffect(
    () => () => {
      live.current = null
    },
    [],
  )

  /**
   * Adding or removing a check moves the keyboard with it: to the new check's
   * statement, or to the check that took the removed one's place. With no check
   * left it goes to the button that adds one, so focus never falls off the list.
   */
  const statements = useRef<Array<HTMLTextAreaElement | null>>([])
  const addButton = useRef<HTMLButtonElement>(null)
  const tools = useRef<HTMLDivElement>(null)
  const [focus, setFocus] = useState<number | null>(null)
  useEffect(() => {
    if (focus === null) return
    const field = statements.current[focus]
    if (field) {
      field.focus()
      field.setSelectionRange(field.value.length, field.value.length)
    } else addButton.current?.focus()
    setFocus(null)
  }, [focus])

  const patch = (i: number, change: Partial<Check>) =>
    onChange(graders.map((g, k) => (k === i ? { ...g, ...change } : g)))

  const add = (at: number) => {
    rows.added(at)
    onChange([...graders.slice(0, at), newCheck(), ...graders.slice(at)])
    setFocus(at)
  }
  /** Checks the assistant wrote join the list, in place of any row left blank. */
  const addAll = (written: string[]) =>
    onChange([
      ...graders.filter((g) => g.statement.trim() || g.image),
      ...written.map((statement) => ({ ...newCheck(), statement })),
    ])
  /** Take a check out. One with a statement can come back: a slip costs a sentence otherwise. */
  const remove = (i: number, next: 'next' | 'previous') => {
    const removed = graders[i]
    const left = graders.filter((_, k) => k !== i)
    rows.removed(i)
    onChange(left)
    setFocus(next === 'previous' ? Math.max(i - 1, 0) : Math.min(i, left.length - 1))
    if (!removed?.statement.trim()) return
    report(`Removed check ${i + 1}`, {
      undo: () => {
        // Only into the case it came from, while it is still in view; elsewhere the offer has passed.
        const now = live.current
        if (!now) return
        const at = Math.min(i, now.graders.length)
        const back = [...now.graders]
        back.splice(at, 0, removed)
        rows.added(at)
        now.onChange(back)
      },
    })
  }
  /** Enter starts the next check and Backspace on an empty one takes it away. Shift+Enter still breaks the line. */
  const onKey = (i: number) => (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const check = graders[i]
    if (!check || e.nativeEvent.isComposing) return
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      if (check.statement.trim()) add(i + 1)
    } else if (e.key === 'Backspace' && !check.statement && !check.image && graders.length > 1) {
      e.preventDefault()
      remove(i, 'previous')
    }
  }

  return (
    <Stack gap="md">
      <PlainList as="ol" gap="md">
        {graders.map((g, i) => (
          <CheckLine key={rows.keys[i]} index={i + 1}>
            <CheckStatement
              index={i + 1}
              fieldRef={(el) => {
                statements.current[i] = el
              }}
              statement={g.statement}
              image={g.image}
              placeholder={examples[i] ?? examples[0]}
              onKeyDown={onKey(i)}
              onStatement={(statement) => patch(i, { statement })}
              onImage={(image) => patch(i, { image })}
              onError={report}
              assist={{ field: 'case.check', ...assist }}
            />
            <span className="flex h-9 items-center">
              <Toggle
                variant="outline"
                size="sm"
                pressed={g.weight > 1}
                aria-label={`Check ${i + 1} counts double`}
                title="Counts double"
                onPressedChange={(on) => patch(i, { weight: on ? DOUBLE : 1 })}
              >
                {weightMark(g.weight > 1 ? g.weight : DOUBLE)}
              </Toggle>
            </span>
            <Button
              type="button"
              variant="ghost-muted"
              size="icon"
              aria-label={`Remove check ${i + 1}`}
              title="Remove"
              onClick={() => remove(i, 'next')}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </CheckLine>
        ))}
      </PlainList>
      <Toolbar ref={tools}>
        <Button
          ref={addButton}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => add(graders.length)}
        >
          <PlusIcon aria-hidden="true" />
          Add a check
        </Button>
        <Assist
          field="case.checks"
          value=""
          // It opens under the row of buttons, never over the checks it adds to.
          anchor={tools}
          {...assist}
          onApply={(text) => addAll(assistItems(text))}
        >
          <Button type="button" variant="ghost" size="sm">
            <PenLineIcon aria-hidden="true" />
            {assistTitle('case.checks')}
          </Button>
        </Assist>
      </Toolbar>
    </Stack>
  )
}

/**
 * What a check is: its statement, and the picture it is about when it has one.
 * The field's corner adds the picture, beside "write with AI", because both
 * are about the statement's content; the ×2 mark and the remove button are the
 * row's and sit outside it. An added picture sits inside the field under the
 * statement, within its edge, and the corner button goes, since a check is
 * about one picture.
 */
function CheckStatement({
  index,
  fieldRef,
  statement,
  image,
  placeholder,
  onKeyDown,
  onStatement,
  onImage,
  onError,
  assist,
}: {
  index: number
  fieldRef: (el: HTMLTextAreaElement | null) => void
  statement: string
  image: ImageRef | null
  placeholder: string | undefined
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onStatement: (statement: string) => void
  onImage: (image: ImageRef | null) => void
  onError: (message: string) => void
  assist: AssistSpec
}) {
  // A picture still being read when its check is removed, or its case left, has nowhere to go.
  const here = useRef(true)
  useEffect(
    () => () => {
      here.current = false
    },
    [],
  )
  const { adding, error, add } = useAddPictures(0, ([added]) => {
    if (here.current && added) onImage(added)
  })
  // Told once per failure, whatever the caller's function is on a later render.
  const report = useRef(onError)
  report.current = onError
  useEffect(() => {
    if (error) report.current(error)
  }, [error])
  const has = Boolean(image) || adding > 0
  return (
    <TextArea
      ref={fieldRef}
      variant="line"
      rows={1}
      aria-label={`Check ${index}`}
      onKeyDown={onKeyDown}
      value={statement}
      placeholder={placeholder}
      onValueChange={onStatement}
      assist={assist}
      corner={
        has ? null : (
          <PicturePicker
            variant="corner"
            single
            label={`Add a picture check ${index} is about`}
            onFiles={(files) => add(files.slice(0, 1))}
          />
        )
      }
      foot={
        has ? (
          <PictureStrip
            size="sm"
            label={`Picture for check ${index}`}
            images={image ? [image] : []}
            adding={adding}
            onRemove={() => onImage(null)}
          />
        ) : null
      }
    />
  )
}

/**
 * Statement, ×2 mark and remove, in columns that line up from row to row. The
 * statement starts on the column's edge, with the check's number hung in the
 * margin before it; its picture, when it has one, sits inside the field under
 * the text. The row reaches 10px past the far edge, which puts the remove icon
 * on that edge, not its 36px box.
 */
const checkLine = 'relative -mr-2.5 grid grid-cols-[minmax(0,1fr)_auto_36px] items-start gap-2'

/** The check's number, in the margin, centred on the first line of its 36px controls. */
const checkIndex = 'absolute top-0 right-full mr-2 flex h-9 items-center'

function CheckLine({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <li className={checkLine}>
      <span className={checkIndex}>
        <Text tone="faint" font="mono" size="xs" weight="medium" tabular>
          {index}
        </Text>
      </span>
      {children}
    </li>
  )
}
