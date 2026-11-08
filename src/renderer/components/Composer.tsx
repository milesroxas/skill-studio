/**
 * Where a request to the assistant is typed: a text area that grows, the model
 * in use, and one button that sends or stops. Return sends and Shift+Return
 * breaks the line, as in any chat. Pictures join the request by the button,
 * by a paste or by a drop anywhere on it. Where the request may start a
 * command, a slash opens a list of them over the field. The side panel frames
 * the composer as a box; inside a popover it sits bare. It is not a `<form>`:
 * a popover opened from a field keeps its place in React's tree, so its submit
 * would bubble to the form around that field and save the screen.
 */
import {
  commandQuery,
  isCommand,
  matchCommands,
  type SlashCommand,
  withCommand,
} from '@domain/commands.ts'
import { cva, type VariantProps } from 'class-variance-authority'
import { ArrowUpIcon, SquareIcon } from 'lucide-react'
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { type Attached, picturesIn } from '../images.ts'
import { Spacer } from './layout.tsx'
import { ModelChip } from './ModelControls.tsx'
import { PicturePicker, PictureStrip, usePictureDrop } from './Pictures.tsx'
import { Hint, Text } from './text.tsx'
import { Button } from './ui/button.tsx'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverLabel,
  PopoverSection,
} from './ui/popover.tsx'
import { Textarea } from './ui/textarea.tsx'

const composerVariants = cva('flex flex-col', {
  variants: {
    frame: {
      /**
       * Focus shows on the edge alone, with no ring: the box holds the focus for a
       * whole conversation, and a halo that never leaves is noise.
       */
      box: 'rounded-chin border border-input bg-background shadow-xs transition-[border-color,box-shadow] duration-150 ease-out focus-within:border-ring dark:bg-input/30',
      bare: '',
    },
    /** A picture is held over it: the drop lands here. */
    over: { true: '', false: '' },
  },
  compoundVariants: [
    { frame: 'box', over: true, className: 'border-ring ring-[3px] ring-ring/50' },
    { frame: 'bare', over: true, className: 'bg-accent/60' },
  ],
  defaultVariants: { frame: 'bare', over: false },
})

/** The bars under the glyph: always there, faded in while a reply is written and out a little faster after. */
const barsVariants = cva(
  'absolute inset-y-0 -right-4 left-0 animate-hazard hazard transition-opacity ease-out',
  {
    variants: {
      shown: {
        true: 'opacity-100 duration-200',
        false: 'opacity-0 duration-150',
      },
    },
  },
)

/** A glyph in the send button: the one in use is shown, the other waits faded and slightly small. */
const glyphVariants = cva('transition-[opacity,scale] duration-150 ease-out', {
  variants: {
    shown: {
      true: 'opacity-100 scale-100',
      false: 'opacity-0 scale-75',
    },
  },
})

interface ComposerProps extends Pick<VariantProps<typeof composerVariants>, 'frame'> {
  value: string
  onChange: (value: string) => void
  /** Send `text`: the field's value, or a command picked from the menu that runs at once. */
  onSubmit: (text: string) => void
  /** A reply is on its way: the button stops it. */
  running: boolean
  onStop: () => void
  /** What the field is for, read to assistive technology. */
  label: string
  placeholder: string
  autoFocus?: boolean
  /** Shown between the text and the controls, such as the reply to a request. */
  children?: ReactNode
  /** In place of the send button, such as what to do with a finished reply. */
  actions?: ReactNode
  /** The pictures that go with the request. Leave out where a request takes none. */
  pictures?: Attached
  /** A request of pictures and no words may be sent. */
  picturesSuffice?: boolean
  /** The commands a request may start with. Leave out where a request takes none. */
  commands?: CommandSections
}

/** One part of the slash menu: the panel's own commands, or the skills a CLI runs. */
interface CommandSection {
  label: string
  /** Null while the section's list is still being read. */
  commands: SlashCommand[] | null
  /** Why the list could not be read; null when it could. */
  problem?: string | null
  /** Picking a row sends it at once: its commands take no words after the name. */
  instant?: boolean
  /** One line per row, the description beside the name: for a few commands with short descriptions. */
  compact?: boolean
}

interface CommandSections {
  sections: CommandSection[]
}

export function Composer({
  value,
  onChange,
  onSubmit,
  running,
  onStop,
  label,
  placeholder,
  autoFocus,
  children,
  actions,
  frame,
  pictures,
  picturesSuffice = false,
  commands,
}: ComposerProps) {
  const drop = usePictureDrop((files) => pictures?.add(files))
  const held = pictures ? pictures.images.length + pictures.adding : 0
  const ready =
    !pictures?.adding && Boolean(value.trim() || (picturesSuffice && pictures?.images.length))
  const submit = () => {
    // A command may go while a reply is on its way: it may be the one that stops it.
    if (ready && (!running || (commands && isCommand(value)))) onSubmit(value)
  }
  const menu = useCommandMenu(value, onChange, onSubmit, commands)
  return (
    <div
      className={composerVariants({ frame, over: Boolean(pictures) && drop.over })}
      {...(pictures ? drop.handlers : {})}
    >
      {pictures && held ? (
        <PictureStrip
          size="sm"
          label="Pictures with this request"
          className="px-3 pt-3"
          images={pictures.images}
          adding={pictures.adding}
          onRemove={pictures.remove}
        />
      ) : null}
      <Popover open={menu.open}>
        <PopoverAnchor asChild>
          <div className="relative">
            {menu.ghost !== null ? (
              // Under the field, which has no fill: the rest of the suggested name, after what was typed.
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 px-3 py-2.5 text-base break-words whitespace-pre-wrap md:text-sm"
              >
                <span className="invisible">{value}</span>
                <span className="text-muted-foreground">{menu.ghost}</span>
              </div>
            ) : null}
            <Textarea
              ref={menu.field}
              aria-label={label}
              rows={1}
              // The frame or the popover shows the focus; the field itself stays plain.
              className="max-h-48 min-h-10 resize-none overflow-y-auto border-0 bg-transparent px-3 py-2.5 shadow-none dark:bg-transparent"
              placeholder={placeholder}
              autoFocus={autoFocus}
              value={value}
              onChange={(event) => {
                menu.moved(event.target.selectionStart)
                onChange(event.target.value)
              }}
              onSelect={(event) => menu.moved(event.currentTarget.selectionStart)}
              onKeyDown={(event) => {
                if (menu.onKeyDown(event)) return
                if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
                event.preventDefault()
                submit()
              }}
              onPaste={(event) => {
                const files = pictures ? picturesIn(event.clipboardData) : []
                if (!files.length) return
                // A copied picture often brings its file name as text: the picture is what was meant.
                event.preventDefault()
                pictures?.add(files)
              }}
              {...menu.aria}
            />
          </div>
        </PopoverAnchor>
        {commands ? <CommandMenu menu={menu} /> : null}
      </Popover>
      {pictures?.error ? (
        <Hint tone="destructive" role="alert" className="px-3 pb-2">
          {pictures.error}
        </Hint>
      ) : null}
      {children}
      <div className="flex items-center gap-1 px-2 pb-2 pointer-coarse:gap-3">
        {pictures ? (
          <PicturePicker variant="icon-sm" label="Add pictures" onFiles={pictures.add} />
        ) : null}
        <ModelChip />
        <Spacer />
        {actions && !running ? (
          actions
        ) : (
          <Button
            type="button"
            size="icon-sm"
            aria-label={running ? 'Stop' : 'Send'}
            disabled={!running && !ready}
            onClick={running ? onStop : submit}
            className="relative overflow-hidden"
          >
            {/* Hazard bars run left under the glyph while the reply is written. A tile wider than the button, so the loop never shows a seam. */}
            <span aria-hidden="true" className={barsVariants({ shown: running })} />
            {/* One button, two glyphs: the arrow gives way to the square while a reply is written. */}
            <span className="relative grid size-4 place-items-center *:[grid-area:1/1]">
              <ArrowUpIcon aria-hidden="true" className={glyphVariants({ shown: !running })} />
              <SquareIcon
                aria-hidden="true"
                className={glyphVariants({ shown: running, className: 'size-3 fill-current' })}
              />
            </span>
          </Button>
        )}
      </div>
    </div>
  )
}

interface CommandMenuState {
  /** The list is on screen. */
  open: boolean
  /** The name typed so far; null while the menu is closed. */
  query: string | null
  /** Every row that answers the query, in order. */
  shown: MenuRow[]
  /** The same rows, section by section, with a line for a section that has none. */
  sections: MenuSection[]
  /** The row the arrow keys or the pointer are on. */
  active: number
  /** The rest of that row's name, to show after what was typed; null when it does not complete it. */
  ghost: string | null
  field: React.RefObject<HTMLTextAreaElement | null>
  listId: string
  /** Goes on the field: what it tells assistive technology, and when it gains or loses the focus. */
  aria: {
    'aria-autocomplete': 'list'
    'aria-controls': string | undefined
    'aria-expanded': boolean
    'aria-activedescendant': string | undefined
    onFocus: () => void
    onBlur: () => void
  }
  /** The caret moved. */
  moved: (caret: number) => void
  /** A key went down in the field. True when the menu took it. */
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean
  point: (index: number) => void
  pick: (row: MenuRow) => void
}

interface MenuRow {
  command: SlashCommand
  /** Its place in the flat list the arrow keys walk. */
  index: number
  /** Picking it sends it at once. */
  instant: boolean
}

/** One part of the menu as shown: its rows, or one line on why it has none. */
interface MenuSection {
  label: string
  compact: boolean
  rows: MenuRow[]
  note: { text: string; tone: 'status' | 'alert' | null } | null
}

/** The sections as they answer `query`, and every row of them in order. */
function sectionsOf(
  sections: CommandSection[],
  query: string,
): { sections: MenuSection[]; rows: MenuRow[] } {
  const rows: MenuRow[] = []
  const shown: MenuSection[] = []
  for (const section of sections) {
    const own: MenuRow[] = []
    let note: MenuSection['note'] = null
    if (section.problem) note = { text: section.problem, tone: 'alert' }
    else if (!section.commands) note = { text: 'Reading…', tone: 'status' }
    else
      for (const command of matchCommands(section.commands, query)) {
        const row = { command, index: rows.length, instant: Boolean(section.instant) }
        rows.push(row)
        own.push(row)
      }
    if (own.length || note)
      shown.push({ label: section.label, compact: Boolean(section.compact), rows: own, note })
  }
  if (!shown.length)
    shown.push({
      label: 'No match',
      compact: false,
      rows: [],
      note: { text: `Nothing is called “${query}”.`, tone: null },
    })
  return { sections: shown, rows }
}

/**
 * The slash menu's state: open while the field has the focus and the first
 * word of the message is a slash and a name. Closed by a space, by Escape
 * until the name changes, by the focus leaving, or where no commands are
 * offered. Arrow keys and the pointer move along it; Return or Tab takes the
 * row they are on, which the field shows ahead of the caret as ghost text. A
 * row that takes no words is sent the moment it is taken.
 */
function useCommandMenu(
  value: string,
  onChange: (value: string) => void,
  onSubmit: (text: string) => void,
  commands: CommandSections | undefined,
): CommandMenuState {
  const field = useRef<HTMLTextAreaElement>(null)
  const listId = useId()
  const [caret, setCaret] = useState(0)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [pointed, setPointed] = useState<{ query: string; index: number } | null>(null)
  const landing = useRef<number | null>(null)

  const query = commands ? commandQuery(value, caret) : null
  const open = focused && query !== null && dismissed !== query
  const { rows: shown, sections } = useMemo(
    () => (open && commands ? sectionsOf(commands.sections, query) : { rows: [], sections: [] }),
    [open, commands, query],
  )
  const active =
    pointed?.query === query ? Math.max(0, Math.min(pointed.index, shown.length - 1)) : 0
  const suggested = open ? shown[active]?.command : undefined
  // Only while the message is the name alone: ghost text after a caret mid-message would mislead.
  const ghost =
    suggested &&
    query !== null &&
    value === `/${query}` &&
    suggested.name.toLowerCase().startsWith(query.toLowerCase())
      ? suggested.name.slice(query.length)
      : null

  // After a pick, the caret lands after the name once the field holds the new text.
  useEffect(() => {
    const at = landing.current
    if (at === null || !field.current) return
    landing.current = null
    field.current.setSelectionRange(at, at)
    setCaret(at)
  })

  const point = (index: number) => query !== null && setPointed({ query, index })

  const pick = ({ command, instant }: MenuRow) => {
    setDismissed(null)
    // The next menu starts on its first row, not where this one was left.
    setPointed(null)
    field.current?.focus()
    if (instant) {
      onSubmit(`/${command.name}`)
      return
    }
    const next = withCommand(value, command.name)
    landing.current = next.caret
    onChange(next.text)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!open) return false
    if (event.key === 'Escape') {
      event.preventDefault()
      setDismissed(query)
      return true
    }
    if (!shown.length) return false
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      const next = (active + step + shown.length) % shown.length
      point(next)
      // Only the keyboard scrolls the list: following the pointer would move rows from under it.
      document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: 'nearest' })
      return true
    }
    if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
      event.preventDefault()
      pick(shown[active])
      return true
    }
    return false
  }

  return {
    open,
    query,
    shown,
    active,
    ghost,
    sections,
    field,
    listId,
    aria: {
      'aria-autocomplete': 'list',
      'aria-controls': open ? listId : undefined,
      'aria-expanded': open,
      'aria-activedescendant': open && shown[active] ? `${listId}-${active}` : undefined,
      onFocus: () => setFocused(true),
      onBlur: () => {
        setFocused(false)
        setPointed(null)
      },
    },
    moved: setCaret,
    onKeyDown,
    point,
    pick,
  }
}

const rowVariants = cva(
  'flex rounded-sm px-2 text-left text-ui outline-none aria-selected:bg-accent pointer-coarse:min-h-11',
  {
    variants: {
      shape: {
        /** Name over description: a skill's description runs long. */
        pair: 'min-h-8 flex-col items-start justify-center gap-0.5 py-1.5',
        /** Name and description on one line. */
        line: 'min-h-8 items-baseline gap-2 py-1',
      },
    },
  },
)

/**
 * The commands over the field, the best match first. Opened by a key many
 * times a day, so it does not animate, and it never takes the focus: the
 * field keeps it, and a row is picked by a click or by Return.
 */
function CommandMenu({ menu }: { menu: CommandMenuState }) {
  const { sections, active, listId } = menu
  return (
    <PopoverContent
      side="top"
      align="start"
      size="menu"
      still
      id={listId}
      role="listbox"
      aria-label="Commands"
      onOpenAutoFocus={(event) => event.preventDefault()}
      onCloseAutoFocus={(event) => event.preventDefault()}
      // A press anywhere on the menu, a row or its scrollbar, leaves the focus in the field.
      onMouseDown={(event) => event.preventDefault()}
    >
      {sections.map((section) => (
        <PopoverSection key={section.label} scroll role="group" aria-label={section.label}>
          <Text caps tone="muted" className="px-2 pt-1.5 pb-1">
            {section.label}
          </Text>
          {section.note ? (
            <PopoverLabel role={section.note.tone ?? undefined}>{section.note.text}</PopoverLabel>
          ) : null}
          {section.rows.map((row) => (
            <button
              key={row.command.name}
              id={`${listId}-${row.index}`}
              type="button"
              role="option"
              aria-selected={row.index === active}
              tabIndex={-1}
              onMouseMove={() => menu.point(row.index)}
              onClick={() => menu.pick(row)}
              className={rowVariants({ shape: section.compact ? 'line' : 'pair' })}
            >
              <Text
                font="mono"
                weight="medium"
                truncate
                className={section.compact ? '' : 'w-full'}
              >
                /{row.command.name}
              </Text>
              {row.command.description ? (
                <Text
                  size="xs"
                  tone="muted"
                  truncate
                  className={section.compact ? 'min-w-0 flex-1' : 'w-full'}
                >
                  {row.command.description}
                </Text>
              ) : null}
            </button>
          ))}
        </PopoverSection>
      ))}
    </PopoverContent>
  )
}
