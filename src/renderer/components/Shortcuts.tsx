/**
 * Keyboard shortcuts as the reader meets them: the keys drawn as keys, the
 * reference that lists every shortcut (opened with ? from anywhere), and the
 * list in Settings where each one is changed.
 *
 * Changing one is pressing it: the field listens, shows the modifiers as they
 * are held, and takes the first whole shortcut. A shortcut another command
 * had moves here, and the status line says so with Undo. Keys the computer or
 * the app keep (Copy, Save) are refused in a line under the field, which goes
 * on listening.
 */
import {
  assignKeys,
  comboOf,
  comboText,
  commandOf,
  heldOf,
  keyCaps,
  refusalOf,
  resetKeys,
  resolveKeys,
  SHORTCUT_COMMANDS,
  SHORTCUT_GROUP_LABELS,
  SHORTCUT_GROUPS,
  type ShortcutCommand,
  type ShortcutGroup,
  type ShortcutId,
  type ShortcutKeys,
  spokenCombo,
} from '@domain/shortcuts.ts'
import { CircleOffIcon, RotateCcwIcon } from 'lucide-react'
import { type KeyboardEvent, useEffect, useId, useState } from 'react'
import { api } from '../api.ts'
import type { Reporter } from '../hooks.ts'
import { isMac } from '../keys.ts'
import { cn } from '../lib/utils.ts'
import { after } from '../motion.ts'
import { setPreferences, usePreferences } from '../preferences.ts'
import { pauseShortcuts } from '../shortcuts.ts'
import { Stack, Toolbar } from './layout.tsx'
import { MoreActions, RowAction } from './RowActions.tsx'
import { Heading, Hint, Text, VisuallyHidden } from './text.tsx'
import { Button } from './ui/button.tsx'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogPart,
  DialogTitle,
} from './ui/dialog.tsx'
import { FIELD_SURFACE } from './ui/input.tsx'

/** ⌘ on a Mac and Ctrl elsewhere, for a line about which shortcuts wait while typing. */
const MOD = isMac ? '⌘' : 'Ctrl'
export const WHILE_TYPING = `Shortcuts without ${MOD} do nothing while you type in a field.`

/**
 * One key, drawn as a keycap: the card's fill, a control's edge, and a
 * heavier edge at its foot, as a key stands up from the keyboard.
 */
const CAP =
  'inline-flex h-6 min-w-6 items-center justify-center rounded-sm border border-b-2 border-input bg-card px-1.5 font-sans leading-none font-medium text-foreground dark:bg-input/30'

/** The Mac's modifier symbols draw small beside a letter at one size, so they take a step up. */
const SYMBOL = /^[⌘⇧⌥⌃↩⇥⌫⌦↑↓←→]$/

/**
 * A shortcut as keys, in the order the reader's keyboard is pressed; a screen
 * reader hears it in words. `stamp` is for keys the reader just chose: each cap
 * is pressed into place, 40ms after the one before it.
 */
function KeyCombo({ keys, stamp = false }: { keys: string; stamp?: boolean }) {
  const caps = keyCaps(keys, isMac)
  if (!caps.length) return null
  return (
    <span className="inline-flex shrink-0">
      <span aria-hidden="true" className="inline-flex items-center gap-1">
        {caps.map((cap, at) => (
          <kbd
            key={cap}
            style={stamp ? after(at * 40) : undefined}
            className={cn(CAP, SYMBOL.test(cap) ? 'text-base' : 'text-xs', stamp && 'animate-pop')}
          >
            {cap}
          </kbd>
        ))}
      </span>
      <VisuallyHidden>{spokenCombo(keys, isMac)}</VisuallyHidden>
    </span>
  )
}

/** Back and Forward are the window's own, which a browser does not have: it keeps its own. */
const shownHere = (command: ShortcutCommand): boolean =>
  api.platform !== 'web' || (command.id !== 'go.back' && command.id !== 'go.forward')

const commandsIn = (group: ShortcutGroup): readonly ShortcutCommand[] =>
  (SHORTCUT_COMMANDS as readonly ShortcutCommand[]).filter((c) => c.group === group && shownHere(c))

/**
 * Every shortcut that does something now, by where it works. A command with
 * no shortcut is left out: the reference shows what a key does, and Settings
 * shows what a key could do.
 */
export function ShortcutsDialog({
  open,
  onOpenChange,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Go to where the shortcuts are changed. */
  onChange: () => void
}) {
  const keys = resolveKeys(usePreferences().shortcuts)
  const toggle = keys['shortcuts.open']
  /** The key that opened it closes it, as it would a menu. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (toggle && comboOf(event, isMac) === toggle) {
      event.preventDefault()
      onOpenChange(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Focus lands on the sheet, read first, not on a button the reader did not reach for. */}
      <DialogContent
        onKeyDown={onKeyDown}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          ;(event.currentTarget as HTMLElement).focus()
        }}
      >
        <DialogPart part="head">
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>{WHILE_TYPING}</DialogDescription>
        </DialogPart>
        <DialogPart part="body">
          <div className="gap-x-10 sm:columns-2">
            {SHORTCUT_GROUPS.map((group) => {
              const rows = commandsIn(group).filter((c) => keys[c.id as ShortcutId])
              return rows.length ? (
                <ReferenceGroup
                  key={group}
                  title={SHORTCUT_GROUP_LABELS[group]}
                  rows={rows.map((c) => ({ label: c.label, keys: keys[c.id as ShortcutId] }))}
                />
              ) : null
            })}
          </div>
        </DialogPart>
        <DialogPart part="foot">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false)
              onChange()
            }}
          >
            Change shortcuts
          </Button>
          <DialogClose asChild>
            <Button type="button">Done</Button>
          </DialogClose>
        </DialogPart>
      </DialogContent>
    </Dialog>
  )
}

/** One group of the reference: its name over its rows, kept whole in its column. */
function ReferenceGroup({
  title,
  rows,
}: {
  title: string
  rows: ReadonlyArray<{ label: string; keys: string }>
}) {
  return (
    <section className="mb-6 break-inside-avoid last:mb-0">
      <Heading level={3}>{title}</Heading>
      <dl className="m-0 mt-2 flex flex-col divide-y">
        {rows.map((row) => (
          <div key={row.label} className="flex min-h-9 items-center justify-between gap-4 py-1.5">
            <dt className="min-w-0 text-ui">{row.label}</dt>
            <dd className="m-0">
              <KeyCombo keys={row.keys} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/**
 * The shortcuts a reader can change, by where they work, each with the field
 * that takes its new keys. Saved at once, as every setting is.
 */
export function ShortcutSettings({ report }: { report: Reporter }) {
  const changed = usePreferences().shortcuts
  const keys = resolveKeys(changed)
  const keep = (next: ShortcutKeys) =>
    setPreferences({ shortcuts: next }).catch((e: Error) =>
      report(`Not saved: ${e.message}`, { tone: 'destructive' }),
    )
  /** Take `next`, and say where a shortcut it moved came from, with the way back. */
  const take = (id: ShortcutId, { changed: next, displaced }: ReturnType<typeof assignKeys>) => {
    const before = changed
    void keep(next)
    if (!displaced) return
    const moved = comboText(resolveKeys(next)[id], isMac)
    report(`${moved} moved from ${commandOf(displaced).label} to ${commandOf(id).label}.`, {
      undo: () => void keep(before),
    })
  }

  return (
    <Stack gap="lg">
      {SHORTCUT_GROUPS.map((group) => {
        const rows = commandsIn(group).filter((c) => !c.fixed)
        return rows.length ? (
          <Stack key={group} gap="xs">
            <Text caps tone="muted">
              {SHORTCUT_GROUP_LABELS[group]}
            </Text>
            <ul className="m-0 flex list-none flex-col divide-y p-0">
              {rows.map((c) => {
                const id = c.id as ShortcutId
                return (
                  <ShortcutRow
                    key={id}
                    id={id}
                    label={c.label}
                    keys={keys[id]}
                    original={c.keys}
                    onKeys={(combo) => take(id, assignKeys(changed, id, combo))}
                    onReset={() => take(id, resetKeys(changed, id))}
                  />
                )
              })}
            </ul>
          </Stack>
        ) : null
      })}
      <Toolbar>
        <Button
          type="button"
          variant="outline"
          disabled={!Object.keys(changed).length}
          onClick={() => void keep({})}
        >
          Use the original shortcuts
        </Button>
      </Toolbar>
    </Stack>
  )
}

/** One command: what it does, the field that holds its keys, and the rarer steps in a menu. */
function ShortcutRow({
  id,
  label,
  keys,
  original,
  onKeys,
  onReset,
}: {
  id: ShortcutId
  label: string
  /** Its keys now; `''` for none. */
  keys: string
  /** The keys it came with. */
  original: string
  onKeys: (combo: string) => void
  onReset: () => void
}) {
  const [listening, setListening] = useState(false)
  /** The modifiers held so far, before the key comes. */
  const [held, setHeld] = useState('')
  const [refused, setRefused] = useState<string | null>(null)
  const noteId = useId()
  /**
   * The keys changed while the reader watched: by their own press, a reset, or
   * another row taking them. Those land with a stamp; the keys there when
   * Settings opened rest, and so do the ones a cancelled change comes back to.
   */
  const [seen, setSeen] = useState(keys)
  const [landed, setLanded] = useState(false)
  if (keys !== seen) {
    setSeen(keys)
    setLanded(true)
  }
  // While the field listens, no shortcut runs: the keys pressed are the new ones.
  useEffect(() => (listening ? pauseShortcuts() : undefined), [listening])

  const stop = () => {
    setListening(false)
    setHeld('')
  }
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!listening) return
    // Tab still moves on: the field stops listening and the focus goes where it would.
    if (event.key === 'Tab') return stop()
    event.preventDefault()
    event.stopPropagation()
    if (event.repeat) return
    const bare = !heldOf(event, isMac)
    if (bare && event.key === 'Escape') {
      setRefused(null)
      return stop()
    }
    if (bare && (event.key === 'Backspace' || event.key === 'Delete')) {
      setRefused(null)
      stop()
      return onKeys('')
    }
    const combo = comboOf(event, isMac)
    if (!combo) return setHeld(heldOf(event, isMac))
    const why = refusalOf(combo, id)
    setHeld('')
    setRefused(why)
    if (why) return
    stop()
    if (combo !== keys) onKeys(combo)
  }

  const note = refused ?? (listening ? 'Esc cancels. Delete turns this shortcut off.' : null)
  const shown = listening ? held : keys
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-1.5 py-2">
      <Text>{label}</Text>
      <button
        type="button"
        data-listening={listening ? '' : undefined}
        aria-label={`Shortcut for ${label}: ${keys ? spokenCombo(keys, isMac) : 'none'}`}
        aria-pressed={listening}
        aria-describedby={note ? noteId : undefined}
        className={`${FIELD_SURFACE} flex h-9 w-36 items-center rounded-sm px-2 text-left focus-ring transition-[border-color] duration-150 ease-out data-listening:border-ring`}
        onClick={() => {
          setRefused(null)
          setLanded(false)
          if (listening) stop()
          else setListening(true)
        }}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => listening && setHeld(heldOf(event, isMac))}
        onBlur={() => {
          stop()
          setRefused(null)
        }}
      >
        {/* Modifiers held show at once: a key pressed must never wait on a movement. */}
        {shown ? (
          <KeyCombo key={listening ? 'held' : keys} keys={shown} stamp={landed && !listening} />
        ) : (
          <Text
            key={listening ? 'listening' : 'none'}
            tone="muted"
            truncate
            className={landed && !listening ? 'animate-ink' : undefined}
          >
            {listening ? 'Press the new keys' : 'None'}
          </Text>
        )}
      </button>
      <MoreActions subject={label}>
        {/* With no keys of its own, Turn off is the way back. */}
        {original ? (
          <RowAction
            icon={<RotateCcwIcon aria-hidden="true" />}
            disabled={keys === original}
            onSelect={onReset}
          >
            {`Reset to ${comboText(original, isMac)}`}
          </RowAction>
        ) : null}
        <RowAction
          icon={<CircleOffIcon aria-hidden="true" />}
          disabled={!keys}
          onSelect={() => onKeys('')}
        >
          Turn off
        </RowAction>
      </MoreActions>
      {/* A refusal is said as it comes; what the keys do while listening is the field's description. */}
      {note ? (
        <Hint
          // Written in as it comes, and again when another key is refused.
          key={note}
          id={noteId}
          role={refused ? 'alert' : undefined}
          tone={refused ? 'destructive' : 'default'}
          className="col-span-3 animate-ink"
        >
          {note}
        </Hint>
      ) : null}
    </li>
  )
}
