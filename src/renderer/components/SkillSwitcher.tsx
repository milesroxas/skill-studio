/**
 * Jump to another skill without leaving the one in hand: a searchable list,
 * opened from the top of the sidebar or with ⌘K. Skills opened before come
 * first, and a new one starts from the foot of the list, named after the
 * search. Opened from the keyboard many times a day, so it does not animate.
 */
import type { LibrarySkill } from '@domain/library.ts'
import { slug } from '@domain/text.ts'
import { ChevronsUpDownIcon, LibraryIcon, PlusIcon } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.ts'
import { shortcut } from '../keys.ts'
import { plural } from '../model.ts'
import { Text } from './text.tsx'
import { Input } from './ui/input.tsx'
import {
  Popover,
  PopoverContent,
  PopoverLabel,
  PopoverSection,
  PopoverTrigger,
} from './ui/popover.tsx'

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

/** An action at the foot of the list, under the skills. */
function FootAction({
  icon,
  hint,
  onClick,
  children,
}: {
  icon: ReactNode
  /** A shortcut, at the far edge. */
  hint?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-8 items-center gap-2 rounded-md px-2 text-left text-ui outline-none transition-[background-color] duration-150 ease-out hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint ? <kbd className="font-sans text-xs text-muted-foreground">{hint}</kbd> : null}
    </button>
  )
}

export function SkillSwitcher({
  name,
  detail,
  onOpen,
  onNew,
  onLibrary,
}: {
  /** The open skill's name; null when none is open. */
  name: string | null
  /** A line under the name: its version. */
  detail?: string
  onOpen: (path: string) => void
  /** Start a new skill, named after the search when there is one. */
  onNew: (name: string) => void
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
        if (!live) return
        setSkills(library.skills)
        setError(null)
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

  /** The search as a skill name, for a new one. */
  const newName = slug(query)

  const choose = (skill: LibrarySkill) => {
    setOpen(false)
    onOpen(skill.path)
  }

  const create = () => {
    setOpen(false)
    onNew(newName)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!shown.length) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      const next = (active + step + shown.length) % shown.length
      setActive(next)
      // Only the keyboard scrolls the list: following the pointer would move rows from under it.
      document.getElementById(`skill-option-${next}`)?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const skill = shown[active]
      if (skill) choose(skill)
      else if (skills && newName) create()
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mx-2 flex min-h-11 items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none transition-[background-color] duration-150 ease-out hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-sidebar-accent [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <Text weight="semibold" truncate title={name ?? undefined}>
              {name ?? 'Open a skill'}
            </Text>
            {detail ? (
              <Text size="xs" tone="muted" truncate tabular title={detail}>
                {detail}
              </Text>
            ) : null}
          </span>
          <ChevronsUpDownIcon aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        size="menu"
        still
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          field.current?.focus()
        }}
      >
        <PopoverSection>
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
        </PopoverSection>
        <PopoverSection scroll id="skill-switcher-list" role="listbox" aria-label="Skills">
          {error ? <PopoverLabel role="alert">{error}</PopoverLabel> : null}
          {!skills && !error ? <PopoverLabel role="status">Loading…</PopoverLabel> : null}
          {skills && !shown.length ? (
            <PopoverLabel>
              {query.trim()
                ? `No skill matches “${query.trim()}”.${newName ? ' Press Enter to start it.' : ''}`
                : 'No skills yet.'}
            </PopoverLabel>
          ) : null}
          {shown.map((skill, i) => (
            <button
              key={skill.path}
              id={`skill-option-${i}`}
              type="button"
              role="option"
              aria-selected={i === active}
              tabIndex={-1}
              title={skill.path}
              onMouseMove={() => setActive(i)}
              onClick={() => choose(skill)}
              className="flex min-h-10 flex-col items-start justify-center gap-0.5 rounded-md px-2 py-1.5 text-left outline-none aria-selected:bg-accent"
            >
              <span className="flex w-full items-baseline gap-2">
                <Text size="ui" weight="medium" truncate className="min-w-0 flex-1">
                  {skill.name}
                </Text>
                {skill.runs ? (
                  <Text size="xs" tone="faint" tabular>
                    {plural(skill.runs, 'run')}
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
        </PopoverSection>
        <PopoverSection>
          <FootAction icon={<PlusIcon aria-hidden="true" />} onClick={create}>
            {newName ? `New skill “${newName}”` : 'New skill'}
          </FootAction>
          <FootAction
            icon={<LibraryIcon aria-hidden="true" />}
            hint={shortcut('K')}
            onClick={() => {
              setOpen(false)
              onLibrary()
            }}
          >
            All skills in the library
          </FootAction>
        </PopoverSection>
      </PopoverContent>
    </Popover>
  )
}
