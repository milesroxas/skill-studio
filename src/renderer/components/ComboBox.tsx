/**
 * A text field with a list to pick from under it, for a value that is usually
 * one of a few known names but may be any other: a writer's model. It looks
 * and opens like a `SelectBox`, so a row of the two reads as one row, and
 * typing filters the list or names a value the list does not have.
 *
 * The focus stays in the field the whole time: the list is the field's popup
 * (`role="combobox"` with `aria-activedescendant`), as in the skill switcher.
 */
import { CheckIcon, ChevronDownIcon } from 'lucide-react'
import { type KeyboardEvent, useId, useRef, useState } from 'react'
import { cn } from '../lib/utils.ts'
import { Input } from './ui/input.tsx'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverLabel,
  PopoverSection,
} from './ui/popover.tsx'

interface Props {
  value: string
  onChange: (value: string) => void
  options: readonly string[]
  id?: string
  'aria-label'?: string
  placeholder?: string
  /** What a typed value that is not in the list is called, in the line that says so: "model". */
  noun: string
}

export function ComboBox({ value, onChange, options, id, placeholder, noun, ...aria }: Props) {
  const listId = useId()
  const anchor = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  // The whole list shows on opening; only a key typed since narrows it.
  const [typed, setTyped] = useState(false)
  const [active, setActive] = useState(0)
  const query = value.trim().toLowerCase()
  const shown = typed && query ? options.filter((o) => o.toLowerCase().includes(query)) : options

  const show = () => {
    setTyped(false)
    setActive(Math.max(0, options.indexOf(value)))
    setOpen(true)
  }
  const pick = (option: string) => {
    onChange(option)
    setOpen(false)
    field.current?.focus()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return show()
      if (!shown.length) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((a) => (a + step + shown.length) % shown.length)
    } else if (e.key === 'Enter' && open) {
      e.preventDefault()
      const option = shown[active]
      if (option) pick(option)
      else setOpen(false)
    } else if (e.key === 'Escape' && open) {
      // Closes the list only: a dialog or panel around the field stays open.
      e.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div ref={anchor} className="relative min-w-0">
          <Input
            ref={field}
            id={id}
            role="combobox"
            aria-label={aria['aria-label']}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && shown[active] ? `${listId}-${active}` : undefined}
            value={value}
            placeholder={placeholder}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="pr-9"
            onChange={(e) => {
              onChange(e.target.value)
              setTyped(true)
              setActive(0)
              setOpen(true)
            }}
            onClick={() => (open ? setOpen(false) : show())}
            onKeyDown={onKeyDown}
          />
          {/* The pointer's way to open the list: the field's keys already do it. */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              field.current?.focus()
              if (open) setOpen(false)
              else show()
            }}
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground outline-none [&_svg]:size-4"
          >
            <ChevronDownIcon
              className={cn(
                'opacity-50 transition-transform duration-150 ease-out-strong',
                open && 'rotate-180',
              )}
            />
          </button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        size="field"
        still
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        // A press on the field or its chevron is the field's own: it toggles the list itself.
        onInteractOutside={(e) => {
          if (anchor.current?.contains(e.target as Node)) e.preventDefault()
        }}
        // A press anywhere on the list, a row or its scrollbar, leaves the focus in the field.
        onMouseDown={(e) => e.preventDefault()}
      >
        <PopoverSection scroll id={listId} role="listbox" aria-label={aria['aria-label']}>
          {shown.map((option, i) => (
            <button
              key={option}
              id={`${listId}-${i}`}
              type="button"
              role="option"
              aria-selected={i === active}
              tabIndex={-1}
              onMouseMove={() => setActive(i)}
              onClick={() => pick(option)}
              className="relative flex min-h-8 w-full items-center rounded-sm py-1.5 pr-8 pl-2 text-left text-sm outline-none aria-selected:bg-accent pointer-coarse:min-h-11"
            >
              <span className="min-w-0 truncate">{option}</span>
              {option === value ? (
                <CheckIcon
                  aria-hidden="true"
                  className="absolute right-2 size-4 text-muted-foreground"
                />
              ) : null}
            </button>
          ))}
          {!shown.length ? (
            <PopoverLabel>
              {query
                ? `None listed matches. The ${noun} “${value.trim()}” is used as typed.`
                : `No ${noun}s listed. Type one.`}
            </PopoverLabel>
          ) : null}
        </PopoverSection>
      </PopoverContent>
    </Popover>
  )
}
