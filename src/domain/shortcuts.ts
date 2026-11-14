/**
 * Keyboard shortcuts: what a key can do, the keys each command starts on, and
 * the keys a person picks in their place.
 *
 * A shortcut is one string, the same on every computer: modifiers first, in a
 * fixed order, then the key, joined by `+` ("mod+k", "shift+r", "1", "?").
 * `mod` is ⌘ on a Mac and Ctrl elsewhere, so a choice made on one carries to
 * the other; `ctrl` is the Mac's Control key, which a Mac keeps apart from ⌘.
 * Only the keys a person changed are stored, and `''` means turned off, so a
 * new default reaches everyone who never touched that command.
 *
 * Pure: the page turns a key press into the string (`comboOf`) and the string
 * into the keys it draws (`keyCaps`).
 */

export const SHORTCUT_GROUPS = ['go', 'anywhere', 'results', 'writing'] as const
export type ShortcutGroup = (typeof SHORTCUT_GROUPS)[number]

/** Each group's name as a heading over its shortcuts. */
export const SHORTCUT_GROUP_LABELS: Record<ShortcutGroup, string> = {
  go: 'Go to',
  anywhere: 'Anywhere',
  results: 'On Results',
  writing: 'While writing',
}

export interface ShortcutCommand {
  id: string
  group: ShortcutGroup
  /** What pressing it does, as a verb and its object, in the words on the control it stands for. */
  label: string
  /** The keys it starts on; `''` for none. */
  keys: string
  /**
   * The app's own keys for typing and moving through history, kept in their
   * own places (the editor, the menu): shown in the reference, never changed.
   */
  fixed?: true
}

/** Every command, in the order the reference and Settings list them. */
export const SHORTCUT_COMMANDS = [
  { id: 'go.editor', group: 'go', label: 'Go to Skill', keys: '1' },
  { id: 'go.cases', group: 'go', label: 'Go to Cases', keys: '2' },
  { id: 'go.results', group: 'go', label: 'Go to Results', keys: '3' },
  { id: 'go.library', group: 'go', label: 'Go to Library', keys: '' },
  { id: 'go.docs', group: 'go', label: 'Go to Guide', keys: '' },
  { id: 'go.settings', group: 'go', label: 'Go to Settings', keys: 'mod+,' },
  { id: 'go.back', group: 'go', label: 'Go back', keys: 'mod+[', fixed: true },
  { id: 'go.forward', group: 'go', label: 'Go forward', keys: 'mod+]', fixed: true },
  { id: 'run.open', group: 'anywhere', label: 'Open Run', keys: 'r' },
  { id: 'skill.switch', group: 'anywhere', label: 'Switch skill', keys: 'mod+k' },
  { id: 'assistant.toggle', group: 'anywhere', label: 'Show or hide the assistant', keys: 'mod+j' },
  { id: 'shortcuts.open', group: 'anywhere', label: 'Show keyboard shortcuts', keys: '?' },
  { id: 'results.a', group: 'results', label: 'Show output A', keys: 'a' },
  { id: 'results.b', group: 'results', label: 'Show output B', keys: 'b' },
  { id: 'write.save', group: 'writing', label: 'Save', keys: 'mod+s', fixed: true },
  { id: 'write.undo', group: 'writing', label: 'Undo', keys: 'mod+z', fixed: true },
  { id: 'write.redo', group: 'writing', label: 'Redo', keys: 'mod+shift+z', fixed: true },
  { id: 'write.bold', group: 'writing', label: 'Bold', keys: 'mod+b', fixed: true },
  { id: 'write.italic', group: 'writing', label: 'Italic', keys: 'mod+i', fixed: true },
  { id: 'write.code', group: 'writing', label: 'Inline code', keys: 'mod+e', fixed: true },
] as const satisfies readonly ShortcutCommand[]

export type ShortcutId = (typeof SHORTCUT_COMMANDS)[number]['id']

/** The keys a person changed, by command: a shortcut, or `''` for turned off. */
export type ShortcutKeys = Partial<Record<ShortcutId, string>>

const COMMANDS: readonly ShortcutCommand[] = SHORTCUT_COMMANDS
const CHANGEABLE = COMMANDS.filter((c) => !c.fixed)

const isChangeable = (id: string): id is ShortcutId => CHANGEABLE.some((c) => c.id === id)

export const commandOf = (id: ShortcutId): ShortcutCommand =>
  COMMANDS.find((c) => c.id === id) as ShortcutCommand

/** Modifiers in the order a shortcut is written. */
const MODIFIERS = ['mod', 'ctrl', 'alt', 'shift'] as const
type Modifier = (typeof MODIFIERS)[number]

/** Keys with a name, as a shortcut writes them. Everything else is one character. */
const NAMED = new Set([
  'enter',
  'escape',
  'tab',
  'space',
  'backspace',
  'delete',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'home',
  'end',
  'pageup',
  'pagedown',
  'plus',
  ...Array.from({ length: 12 }, (_, i) => `f${i + 1}`),
])

/** A key from the keyboard: what `KeyboardEvent` carries. */
export interface KeyPress {
  key: string
  code: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

/** Keys that only change another key. Pressed alone, they are no shortcut yet. */
const MODIFIER_KEYS = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'OS',
  'CapsLock',
  'Fn',
  'FnLock',
  'Hyper',
  'Super',
  'AltGraph',
])

const LETTER = /^[a-z]$/
const DIGIT = /^[0-9]$/

/** One printable character a shortcut can be written with: not a space, not a `+`. */
const isCharacter = (key: string): boolean => /^[\x21-\x7e]$/.test(key) && key !== '+'

/**
 * The key a press stands for. A letter is read as the layout types it, so a
 * shortcut follows the letters printed on the keys. Where the press types no
 * plain letter (Option on a Mac, a keyboard in another alphabet), the key's
 * place is read instead. A number is always read from its place: on some
 * layouts the top row types a symbol unless Shift is held.
 */
function keyOf(press: KeyPress): string | null {
  const place = /^Key([A-Z])$/.exec(press.code)?.[1]?.toLowerCase()
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(press.code)?.[1]
  if (digit) return digit
  const key = press.key.toLowerCase()
  if (LETTER.test(key)) return key
  if (place) return place
  if (key === ' ') return 'space'
  if (key === '+') return 'plus'
  if (press.key === 'Esc') return 'escape'
  if (press.key === 'Del') return 'delete'
  if (NAMED.has(key)) return key
  if (isCharacter(press.key)) return press.key
  return null
}

/**
 * The shortcut a key press makes, or null when it makes none: a modifier
 * alone, a key the app cannot name, or the Windows key off the Mac, which
 * belongs to the system. Shift is kept with a letter, a number or a named key,
 * and dropped with a symbol, whose character already says it: Shift and / is "?".
 */
export function comboOf(press: KeyPress, mac: boolean): string | null {
  if (MODIFIER_KEYS.has(press.key)) return null
  if (!mac && press.metaKey) return null
  const key = keyOf(press)
  if (!key) return null
  const held: Record<Modifier, boolean> = {
    mod: mac ? press.metaKey : press.ctrlKey,
    ctrl: mac && press.ctrlKey,
    alt: press.altKey,
    shift:
      press.shiftKey && (LETTER.test(key) || DIGIT.test(key) || (NAMED.has(key) && key !== 'plus')),
  }
  return [...MODIFIERS.filter((m) => held[m]), key].join('+')
}

/** A shortcut in the one way it is written, or null when it is not one. */
export function normalizeCombo(raw: string): string | null {
  if (typeof raw !== 'string' || raw.length > 40) return null
  const parts = raw.toLowerCase().split('+')
  const key = parts.pop()
  if (!key || !(NAMED.has(key) || isCharacter(key))) return null
  const mods = new Set<string>()
  for (const part of parts) {
    if (!(MODIFIERS as readonly string[]).includes(part) || mods.has(part)) return null
    mods.add(part)
  }
  return [...MODIFIERS.filter((m) => mods.has(m)), key].join('+')
}

/** The modifiers a shortcut holds. */
const modifiersOf = (combo: string): Modifier[] => combo.split('+').slice(0, -1) as Modifier[]

const keyPart = (combo: string): string => combo.split('+').pop() ?? ''

/**
 * A shortcut that works while a field has the focus: one held with ⌘ (Ctrl)
 * or, on a Mac, Control. Any other key types into the field, so its shortcut
 * waits until the field is left.
 */
export const worksWhileTyping = (combo: string): boolean =>
  modifiersOf(combo).some((m) => m === 'mod' || m === 'ctrl')

/**
 * Where a key press lands, which decides which shortcuts it may start:
 * `page` anything; `field` and `menu` (a field takes typing, a menu or a list
 * picks by letter) only those that work while typing; `modal` (a dialog that
 * stops the page) none.
 */
export type KeyTarget = 'page' | 'field' | 'menu' | 'modal'

export const firesIn = (combo: string, target: KeyTarget): boolean =>
  target === 'page' || (target !== 'modal' && worksWhileTyping(combo))

/** The keys of every command, after the person's changes: `''` where a command has none. */
export function resolveKeys(changed: ShortcutKeys): Record<ShortcutId, string> {
  const out = {} as Record<ShortcutId, string>
  const taken = new Map<string, ShortcutId>()
  // A key the person chose wins over a default it collides with.
  const ordered = [...COMMANDS].sort(
    (a, b) =>
      Number(isChangeable(b.id) && changed[b.id] !== undefined) -
      Number(isChangeable(a.id) && changed[a.id] !== undefined),
  )
  for (const c of ordered) {
    const id = c.id as ShortcutId
    const keys = c.fixed ? c.keys : (changed[id] ?? c.keys)
    if (keys && !taken.has(keys)) {
      taken.set(keys, id)
      out[id] = keys
    } else out[id] = ''
  }
  return out
}

/** The command a shortcut starts, among those a person can change, or undefined. */
export function commandFor(combo: string, changed: ShortcutKeys): ShortcutId | undefined {
  const keys = resolveKeys(changed)
  return CHANGEABLE.find((c) => keys[c.id as ShortcutId] === combo)?.id as ShortcutId | undefined
}

/** Shortcuts the computer or the app keep for themselves, with what they do. */
const RESERVED: Readonly<Record<string, string>> = {
  'mod+c': 'Copy',
  'mod+v': 'Paste',
  'mod+x': 'Cut',
  'mod+a': 'Select all',
  'mod+q': 'Quit',
  'mod+w': 'Close the window',
  'mod+h': 'Hide Skill Studio',
  'mod+m': 'Minimize',
  'mod+r': 'Reload',
  'mod+shift+r': 'Reload',
  'mod+y': 'Redo',
  'mod+f': 'Find',
  'mod+0': 'Actual size',
  'mod+=': 'Zoom in',
  'mod+plus': 'Zoom in',
  'mod+-': 'Zoom out',
  'mod+alt+i': 'Developer tools',
  'mod+ctrl+f': 'Full screen',
  'mod+tab': 'Switch apps',
  'mod+space': 'Spotlight',
  'alt+tab': 'Switch apps',
  'alt+f4': 'Quit',
}

/** Keys that move through the app and the text: on their own, they stay what they are. */
const MOVING = new Set([
  'tab',
  'escape',
  'enter',
  'space',
  'backspace',
  'delete',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'home',
  'end',
  'pageup',
  'pagedown',
])

/**
 * Why `combo` cannot be `id`'s shortcut, in one line for the person who
 * pressed it, or null when it can. A shortcut another changeable command has
 * is no refusal: it moves (`assignKeys`).
 */
export function refusalOf(combo: string, id: ShortcutId): string | null {
  const own = commandOf(id)
  if (own.fixed) return `${own.label} keeps its keys.`
  const fixed = COMMANDS.find((c) => c.fixed && c.keys === combo)
  if (fixed) return `Already used for ${fixed.label}. Try other keys.`
  const reserved = RESERVED[combo]
  if (reserved) return `Already used for ${reserved}. Try other keys.`
  const mods = modifiersOf(combo)
  if (MOVING.has(keyPart(combo)) && !mods.some((m) => m !== 'shift'))
    return 'This key moves around the app and the text. Try a letter or a number.'
  return null
}

/** The person's changes with `id` on `combo`, and the command that had `combo` before, if any. */
export interface Assigned {
  changed: ShortcutKeys
  /** The command whose shortcut this was: it has none now. */
  displaced?: ShortcutId
}

/**
 * Give `id` the shortcut `combo` (`''` turns it off). A command that had it
 * gives it up and has none, since one key starts one thing. A choice that is
 * the default again is dropped from the changes, so a later new default
 * reaches it.
 */
export function assignKeys(changed: ShortcutKeys, id: ShortcutId, combo: string): Assigned {
  const before = resolveKeys(changed)
  const displaced = combo
    ? CHANGEABLE.find((c) => c.id !== id && before[c.id as ShortcutId] === combo)?.id
    : undefined
  const next: ShortcutKeys = { ...changed, [id]: combo }
  if (displaced) next[displaced as ShortcutId] = ''
  return {
    changed: tidy(next),
    ...(displaced ? { displaced: displaced as ShortcutId } : {}),
  }
}

/** Put `id` back on its own shortcut, taking it from any command that has it now. */
export const resetKeys = (changed: ShortcutKeys, id: ShortcutId): Assigned =>
  assignKeys(changed, id, commandOf(id).keys)

/** Changes that say what the default says are no change. */
function tidy(changed: ShortcutKeys): ShortcutKeys {
  const out: ShortcutKeys = {}
  for (const [id, keys] of Object.entries(changed) as [ShortcutId, string][]) {
    if (isChangeable(id) && keys !== commandOf(id).keys) out[id] = keys
  }
  return out
}

/** The stored changes from untrusted input: known commands, shortcuts that parse and are allowed. */
export function shortcutKeysOf(raw: unknown): ShortcutKeys {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: ShortcutKeys = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isChangeable(id) || typeof value !== 'string') continue
    if (value === '') {
      out[id] = ''
      continue
    }
    const combo = normalizeCombo(value)
    if (combo && !refusalOf(combo, id)) out[id] = combo
  }
  return tidy(out)
}

const MAC_MODIFIER: Record<Modifier, string> = { ctrl: '⌃', alt: '⌥', shift: '⇧', mod: '⌘' }
const PC_MODIFIER: Record<Modifier, string> = {
  mod: 'Ctrl',
  ctrl: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
}
/** The Mac draws its modifiers in this order, Windows in the written one. */
const MAC_ORDER: readonly Modifier[] = ['ctrl', 'alt', 'shift', 'mod']

const MAC_KEY: Readonly<Record<string, string>> = {
  enter: '↩',
  escape: 'Esc',
  tab: '⇥',
  space: 'Space',
  backspace: '⌫',
  delete: '⌦',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  home: 'Home',
  end: 'End',
  pageup: 'Page Up',
  pagedown: 'Page Down',
  plus: '+',
}

const PC_KEY: Readonly<Record<string, string>> = {
  ...MAC_KEY,
  enter: 'Enter',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
}

const keyLabel = (key: string, mac: boolean): string =>
  (mac ? MAC_KEY : PC_KEY)[key] ?? key.toUpperCase()

/**
 * The modifiers a press holds, as a shortcut still waiting for its key
 * ("mod+shift+"), or `''` for none: what a field listening for new keys shows
 * while they are held.
 */
export function heldOf(press: Omit<KeyPress, 'key' | 'code'>, mac: boolean): string {
  const held: Record<Modifier, boolean> = {
    mod: mac ? press.metaKey : press.ctrlKey,
    ctrl: mac && press.ctrlKey,
    alt: press.altKey,
    shift: press.shiftKey,
  }
  const mods = MODIFIERS.filter((m) => held[m])
  return mods.length ? `${mods.join('+')}+` : ''
}

/** The keys of a shortcut, one label a key, as the reader's keyboard prints them. */
export function keyCaps(combo: string, mac: boolean): string[] {
  if (!combo) return []
  const mods = modifiersOf(combo)
  const key = keyPart(combo)
  const order = mac ? MAC_ORDER : MODIFIERS
  return [
    ...order.filter((m) => mods.includes(m)).map((m) => (mac ? MAC_MODIFIER : PC_MODIFIER)[m]),
    ...(key ? [keyLabel(key, mac)] : []),
  ]
}

/** A shortcut in a line of text, such as a button's hover text: "⌘K" on a Mac, "Ctrl+K" elsewhere. */
export const comboText = (combo: string, mac: boolean): string =>
  keyCaps(combo, mac).join(mac ? '' : '+')

const SPOKEN_KEY: Readonly<Record<string, string>> = {
  '?': 'Question mark',
  '/': 'Slash',
  '\\': 'Backslash',
  ',': 'Comma',
  '.': 'Period',
  ';': 'Semicolon',
  "'": 'Quote',
  '`': 'Backtick',
  '[': 'Left bracket',
  ']': 'Right bracket',
  '-': 'Minus',
  '=': 'Equals',
  plus: 'Plus',
  arrowup: 'Up arrow',
  arrowdown: 'Down arrow',
  arrowleft: 'Left arrow',
  arrowright: 'Right arrow',
  pageup: 'Page Up',
  pagedown: 'Page Down',
  escape: 'Escape',
}

const SPOKEN_MODIFIER: Record<Modifier, (mac: boolean) => string> = {
  mod: (mac) => (mac ? 'Command' : 'Control'),
  ctrl: () => 'Control',
  alt: (mac) => (mac ? 'Option' : 'Alt'),
  shift: () => 'Shift',
}

/** A shortcut as a screen reader says it: "Command K", "Shift R". */
export function spokenCombo(combo: string, mac: boolean): string {
  const key = keyPart(combo)
  const order = mac ? MAC_ORDER : MODIFIERS
  const mods = modifiersOf(combo)
  const spoken =
    SPOKEN_KEY[key] ??
    (key.length === 1 ? key.toUpperCase() : `${key.charAt(0).toUpperCase()}${key.slice(1)}`)
  return [
    ...order.filter((m) => mods.includes(m)).map((m) => SPOKEN_MODIFIER[m](mac)),
    ...(key ? [spoken] : []),
  ].join(' ')
}

const ARIA_KEY: Readonly<Record<string, string>> = {
  space: 'Space',
  plus: '+',
  escape: 'Escape',
  enter: 'Enter',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
}

/** A shortcut as `aria-keyshortcuts` writes it: "Meta+K", "Shift+R". */
export function ariaCombo(combo: string, mac: boolean): string {
  const key = keyPart(combo)
  const name: Record<Modifier, string> = {
    mod: mac ? 'Meta' : 'Control',
    ctrl: 'Control',
    alt: 'Alt',
    shift: 'Shift',
  }
  return [...modifiersOf(combo).map((m) => name[m]), ARIA_KEY[key] ?? key.toUpperCase()].join('+')
}
