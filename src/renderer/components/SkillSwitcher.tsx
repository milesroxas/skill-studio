/**
 * Jump to another skill without leaving the one in hand: a searchable list,
 * opened from the top of the sidebar or with ⌘K. Skills opened before come
 * first. Opened from the keyboard many times a day, so it does not animate.
 */
import type { LibrarySkill } from '@domain/library.ts'
import { ChevronsUpDownIcon, LibraryIcon } from 'lucide-react'
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.ts'
import { shortcut } from '../keys.ts'
import { cn } from '../lib/utils.ts'
import { Text } from './text.tsx'
import { Input } from './ui/input.tsx'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.tsx'

const MAX_SHOWN = 40
/** A scan walks every workspace folder; one this recent is reused when the switcher reopens. */
const RESCAN_AFTER_MS = 30_000
let lastScan: { at: number; skills: LibrarySkill[] } | null = null

const rank = (skill: LibrarySkill): number => (skill.open ? 0 : skill.recent ? 1 : 2)

function matches(skill: LibrarySkill, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return `${skill.name} ${skill.description} ${skill.path}`.toLowerCase().includes(q)
}

/** Open with ⌘K (Ctrl+K off the Mac) from anywhere in the app. */
function useShortcut(onPress: () => void) {
  useEffect(() => {
    const handle = (e: globalThis.KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        onPress()
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [onPress])
}

export function SkillSwitcher({
  name,
  detail,
  onOpen,
  onLibrary,
}: {
  /** The open skill's name; null when none is open. */
  name: string | null
  /** A line under the name: its version. */
  detail?: string
  onOpen: (path: string) => void
  onLibrary: () => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [skills, setSkills] = useState<LibrarySkill[] | null>(lastScan?.skills ?? null)
  const [error, setError] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)

  useShortcut(() => setOpen((o) => !o))

  // Scan when opened unless a recent scan is in hand; the last list stays on screen meanwhile.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    if (lastScan && Date.now() - lastScan.at < RESCAN_AFTER_MS) return
    let live = true
    api.library().then(
      (library) => {
        lastScan = { at: Date.now(), skills: library.skills }
        if (live) setSkills(library.skills)
      },
      (e: Error) => live && setError(e.message),
    )
    return () => {
      live = false
    }
  }, [open])

  const shown = useMemo(
    () =>
      (skills ?? [])
        .filter((s) => matches(s, query))
        .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
        .slice(0, MAX_SHOWN),
    [skills, query],
  )

  const choose = (skill: LibrarySkill | undefined) => {
    if (!skill) return
    setOpen(false)
    onOpen(skill.path)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (shown.length ? (i + step + shown.length) % shown.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(shown[active])
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mx-2 flex min-h-11 items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none transition-[background-color] duration-150 ease-out hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-sidebar-accent"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <Text weight="semibold" truncate>
              {name ?? 'Open a skill'}
            </Text>
            {detail ? (
              <Text size="xs" tone="muted" truncate tabular>
                {detail}
              </Text>
            ) : null}
          </span>
          <ChevronsUpDownIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 p-0 data-[state=open]:animate-none data-[state=closed]:animate-none"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          field.current?.focus()
        }}
      >
        <div className="border-b p-2">
          <Input
            ref={field}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Find a skill"
            aria-label="Find a skill"
            role="combobox"
            aria-expanded="true"
            aria-controls="skill-switcher-list"
            aria-activedescendant={shown[active] ? `skill-option-${active}` : undefined}
          />
        </div>
        <div
          id="skill-switcher-list"
          role="listbox"
          aria-label="Skills"
          className="flex max-h-80 flex-col gap-px overflow-y-auto overscroll-contain p-1"
        >
          {error ? (
            <Text size="xs" tone="destructive" className="p-2">
              {error}
            </Text>
          ) : null}
          {!skills && !error ? (
            <Text size="xs" tone="muted" className="p-2">
              Finding skills…
            </Text>
          ) : null}
          {skills && !shown.length ? (
            <Text size="xs" tone="muted" className="p-2">
              No skill matches “{query.trim()}”.
            </Text>
          ) : null}
          {shown.map((skill, i) => (
            <button
              key={skill.path}
              id={`skill-option-${i}`}
              type="button"
              role="option"
              aria-selected={i === active}
              tabIndex={-1}
              onMouseMove={() => setActive(i)}
              onClick={() => choose(skill)}
              className={cn(
                'flex flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left outline-none',
                i === active && 'bg-accent',
              )}
            >
              <span className="flex w-full items-baseline gap-2">
                <Text size="sm" weight="medium" truncate className="min-w-0 flex-1">
                  {skill.name}
                </Text>
                {skill.runs ? (
                  <Text size="xs" tone="faint" tabular>
                    {skill.runs} {skill.runs === 1 ? 'run' : 'runs'}
                  </Text>
                ) : null}
              </span>
              {skill.description ? (
                <Text size="xs" tone="muted" truncate className="w-full">
                  {skill.description}
                </Text>
              ) : null}
            </button>
          ))}
        </div>
        <div className="flex items-center border-t p-1">
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onLibrary()
            }}
            className="flex min-h-8 flex-1 items-center gap-2 rounded-md px-2 text-left text-[13px] outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <LibraryIcon aria-hidden="true" className="size-4 text-muted-foreground" />
            All skills in the library
          </button>
          <kbd className="mr-2 font-sans text-xs text-muted-foreground">{shortcut('K')}</kbd>
        </div>
      </PopoverContent>
    </Popover>
  )
}
