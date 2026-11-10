/**
 * The editor for skill files, on CodeMirror 6. It has two views of one text:
 * formatted, where Markdown is styled in place and its marks show only where
 * the cursor is (Obsidian's live preview), and Markdown, the plain source.
 * Both edit the same characters, so switching views or saving never rewrites
 * the file. The screen chooses the view; the toolbar and shortcuts apply
 * styles by writing Markdown, and Undo and Redo lead the toolbar. The tools
 * are quiet until pointed at, so the text is the brightest thing in the
 * column. A file's undo history outlives the editor: it is there again after a
 * look at another file or another screen.
 */

import {
  defaultKeymap,
  history,
  historyField,
  historyKeymap,
  indentWithTab,
  redo,
  redoDepth,
  undo,
  undoDepth,
} from '@codemirror/commands'
import { Annotation, Compartment, EditorState, type StateCommand } from '@codemirror/state'
import { drawSelection, EditorView, keymap, placeholder } from '@codemirror/view'
import { type Finding, type RuleScene, sceneOf, worthChecking } from '@domain/lint.ts'
import type { EditorMode } from '@domain/preferences.ts'
import { insertAt, type Snippet } from '@domain/templates.ts'
import { cva } from 'class-variance-authority'
import {
  BoldIcon,
  CodeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  type LucideIcon,
  PenLineIcon,
  Redo2Icon,
  TextQuoteIcon,
  Undo2Icon,
} from 'lucide-react'
import {
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { startImprove } from '../ai.ts'
import {
  formatKeymap,
  insertLink,
  toggleHeading,
  toggleInline,
  toggleList,
  toggleQuote,
} from '../editor/format.ts'
import { findingsWithin, gradedRules, ruleAt } from '../editor/graded.ts'
import { landed, landedField } from '../editor/landed.ts'
import { skillMarkdown } from '../editor/language.ts'
import { livePreview } from '../editor/live-preview.ts'
import { editorTheme, markdownHighlighting } from '../editor/theme.ts'
import { shortcut } from '../keys.ts'
import { setPreferences, usePreferences } from '../preferences.ts'
import { registerReplacer } from '../replace.ts'
import { Assist, type AssistSpec } from './Assist.tsx'
import { ColumnToolbar, ToolbarGroup, ToolbarItem } from './layout.tsx'
import { SelectionTools, type VirtualAnchor } from './SelectionTools.tsx'
import { TextSizeIndicator } from './TextSize.tsx'
import { Button } from './ui/button.tsx'

/**
 * The view the writer last chose, kept with their preferences so Settings
 * shows it too. A failed store keeps the view for this session and says so.
 */
export function useEditorMode(
  onError: (message: string) => void,
): [EditorMode, (mode: EditorMode) => void] {
  const { editorMode } = usePreferences()
  const choose = (mode: EditorMode) =>
    void setPreferences({ editorMode: mode }).catch((e: Error) => onError(e.message))
  return [editorMode, choose]
}

export interface MarkdownEditorHandle {
  /** Put a snippet over the selection and leave the cursor inside it. */
  insert: (snippet: Snippet) => void
  focus: () => void
  /** Open "Write with AI" on the whole file, as the toolbar button does. */
  assist: () => void
  /**
   * Select whole lines, numbered from 1, and bring them into view: a rule
   * someone was sent here to change. On a SKILL.md the selection opens the
   * popout, as a click on the rule's number does.
   */
  selectLines: (from: number, to: number) => void
}

interface Action {
  label: string
  icon: LucideIcon
  command: StateCommand
  keys?: string
}

/** They lead the toolbar, where a writing app keeps them, and wear the system's arrows. */
const UNDO: Action = { label: 'Undo', icon: Undo2Icon, command: undo, keys: 'Z' }
const REDO: Action = { label: 'Redo', icon: Redo2Icon, command: redo, keys: '⇧Z' }

/**
 * The styles a skill file is made of. Strikethrough keeps its shortcut and a
 * task list is typed as `- [ ]`: neither is common enough to hold a place here.
 */
const ACTIONS: readonly (readonly Action[])[] = [
  [
    { label: 'Heading 1', icon: Heading1Icon, command: toggleHeading(1) },
    { label: 'Heading 2', icon: Heading2Icon, command: toggleHeading(2) },
    { label: 'Heading 3', icon: Heading3Icon, command: toggleHeading(3) },
  ],
  [
    { label: 'Bold', icon: BoldIcon, command: toggleInline('strong'), keys: 'B' },
    { label: 'Italic', icon: ItalicIcon, command: toggleInline('emphasis'), keys: 'I' },
    { label: 'Inline code', icon: CodeIcon, command: toggleInline('code'), keys: 'E' },
    { label: 'Link', icon: LinkIcon, command: insertLink },
  ],
  [
    { label: 'Bulleted list', icon: ListIcon, command: toggleList('bullet') },
    { label: 'Numbered list', icon: ListOrderedIcon, command: toggleList('ordered') },
    { label: 'Quote', icon: TextQuoteIcon, command: toggleQuote },
  ],
]

/**
 * ⌘[ and ⌘] go Back and Forward on every screen, this one included, so the
 * editor leaves them alone. Tab and Shift-Tab indent.
 */
const EDITING_KEYMAP = defaultKeymap.filter(({ key }) => key !== 'Mod-[' && key !== 'Mod-]')

/** A text with its cursor and undo history, as CodeMirror writes them out. */
interface Kept {
  doc: string
}

/**
 * What each editor held when it was last put away, by its `id`, for as long as
 * the window is open. A text that has since changed elsewhere starts afresh:
 * its old history would undo into a file that is no longer there.
 */
const kept = new Map<string, Kept>()

/** How many texts keep their history: the ones put away longest ago make room. */
const KEPT_MAX = 24

function keep(id: string, state: Kept): void {
  // Set again, it moves to the end: the map stays oldest first.
  kept.delete(id)
  kept.set(id, state)
  for (const oldest of kept.keys()) {
    if (kept.size <= KEPT_MAX) break
    kept.delete(oldest)
  }
}

/** The editors open now, by `id`, and those of them forgotten while open: put away, they keep nothing. */
const mounted = new Set<string>()
const forgotten = new Set<string>()

/** Forget a text's history: its file is gone, and nothing would open it again. */
export function forgetEditor(id: string): void {
  kept.delete(id)
  // Still open, it is put away after this: that must not keep it again.
  if (mounted.has(id)) forgotten.add(id)
}

/**
 * Marks a change the screen made to the text: a saved file read again, a
 * template, a discarded draft. The screen already has that text, so it is not
 * told of it as an edit.
 */
const fromScreen = Annotation.define<boolean>()

const surfaceVariants = cva('flex flex-1 flex-col', {
  variants: {
    mode: {
      /** Prose: the app's sans at a reading size. */
      formatted: 'font-sans text-md leading-[1.7]',
      /** Source: monospace, tabs two wide. */
      markdown: 'font-mono text-ui leading-[1.6] [tab-size:2]',
    },
  },
})

/**
 * The notes over the text. They take the text's gutter, so their left edge is
 * the document's. They stand as far from its first line as from each other:
 * the text brings 20px of its own (`.cm-content` in `editor/theme.ts`), and
 * the 12px here makes that the 32px between two notes.
 */
const BANNER = 'flex flex-col gap-8 px-6 pt-6 pb-3'

/** The popout waits this long after the selection settles, so it does not flicker through a drag. */
const SETTLE_MS = 150

/**
 * Put `next` where `original` is in the view's text: at `hint` when the text
 * there is still `original`, else where `original` is found once. A deleted
 * passage takes its closing newline with it, so no blank line is left.
 */
function replaceIn(
  view: EditorView,
  original: string,
  next: string,
  hint?: { from: number; to: number },
): 'replaced' | 'missing' {
  const doc = view.state.doc.toString()
  let from = hint && doc.slice(hint.from, hint.to) === original ? hint.from : doc.indexOf(original)
  if (from === -1 || (!hint && doc.indexOf(original, from + 1) !== -1)) return 'missing'
  let to = from + original.length
  if (!next && doc[to] === '\n') to += 1
  else if (!next && from > 0 && doc[from - 1] === '\n') from -= 1
  view.dispatch({
    changes: { from, to, insert: next },
    selection: { anchor: from + next.length },
    effects: next ? landed(view, from, from + next.length) : [],
    scrollIntoView: true,
    userEvent: 'input',
  })
  view.focus()
  return 'replaced'
}

/** The page's style nonce, which lets CodeMirror's one style tag past the app's policy. */
const styleNonce = (): string | undefined =>
  document.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]')?.nonce || undefined

interface MarkdownEditorProps {
  ref?: Ref<MarkdownEditorHandle>
  /** Names the text across mounts, so its undo history and cursor are found again. */
  id: string
  value: string
  onChange: (value: string) => void
  onSave?: () => void
  mode: EditorMode
  placeholder?: string
  'aria-label': string
  /** Notes about the file, shown between the toolbar and the text. The editor spaces them. */
  banner?: ReactNode
  /**
   * Something to read in place of the text, such as what changed since the
   * last save. The toolbar keeps its place with its tools disabled, so the
   * column does not jump, and the text keeps its cursor for the way back.
   */
  instead?: ReactNode
  /**
   * The kind of file this is, which puts "Write with AI" in the toolbar. With
   * text selected it rewrites the selection only; otherwise the whole file.
   */
  assist?: AssistSpec
  /**
   * This is a SKILL.md: a selection of four words or more gets the popout with
   * Auto refine, Suggest changes and Help me improve. The description says
   * what the skill is about, which the checks read; errors go to the screen.
   */
  refine?: {
    description: string
    onError: (message: string) => void
    /** The popout put text in place of the selection; `undo` takes it back. */
    onReplaced: (undo: () => void) => void
  }
  /** This SKILL.md's bullets are the rules Jev grades: mark and number them in the margin. */
  graded?: boolean
}

/** Mount once per file: give each file its own `key`, so undo history never crosses files. */
export function MarkdownEditor({
  ref,
  id,
  value,
  onChange,
  onSave,
  mode,
  placeholder: hint,
  'aria-label': label,
  banner,
  instead,
  assist,
  refine,
  graded = false,
}: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<EditorView | null>(null)
  /** The selection the popout stands over, as the checks read it, with what they found; null when none is worth checking. */
  const [tools, setTools] = useState<
    (RuleScene & { from: number; to: number; findings: Finding[] }) | null
  >(null)
  const [toolsOpen, setToolsOpen] = useState(false)
  const anchor = useRef<VirtualAnchor | null>(null)
  const dragging = useRef(false)
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined)
  /** Names the popout, so the key that moves into it can find it. */
  const toolsId = useId()
  const popout = useRef(toolsId)
  /** The selection Help me improve was started on, and where it stood: its draft goes back there. */
  const improving = useRef<{ selection: string; from: number; to: number } | null>(null)
  const refining = useRef(refine)
  refining.current = refine
  const [assistOpen, setAssistOpen] = useState(false)
  /** The selection "Write with AI" was opened on; null when it has the whole file. */
  const [picked, setPicked] = useState<{ from: number; to: number } | null>(null)
  /** Whether there is a step to take back, and one to take again. */
  const [steps, setSteps] = useState({ undo: false, redo: false })
  const modes = useRef(new Compartment())
  const grading = useRef(new Compartment())
  const about = refine?.description ?? ''
  const latest = useRef({ id, value, mode, hint, label, graded, about, onChange, onSave })
  latest.current = { id, value, mode, hint, label, graded, about, onChange, onSave }

  useEffect(() => {
    const { id, value, mode, hint, label, graded, about } = latest.current
    const nonce = styleNonce()
    /** Put the popout over the selection, or take it away, once the selection has settled. */
    const place = (view: EditorView) => {
      if (dragging.current || !refining.current) return
      const range = view.state.selection.main
      const doc = view.state.doc.toString()
      if (range.empty || !worthChecking(doc.slice(range.from, range.to))) {
        setToolsOpen(false)
        setTools(null)
        return
      }
      const scene = sceneOf(doc, range, refining.current.description)
      const start = view.coordsAtPos(scene.from)
      const end = view.coordsAtPos(scene.to, -1)
      const box = host.current?.getBoundingClientRect()
      anchor.current = {
        getBoundingClientRect: () => {
          if (!start || !end) return box ?? new DOMRect()
          const left = Math.min(start.left, end.left)
          const right = Math.max(start.right, end.right)
          return new DOMRect(left, start.top, Math.max(right - left, 1), end.bottom - start.top)
        },
      }
      setTools({ ...scene, findings: findingsWithin(view.state, scene.from, scene.to) })
      setToolsOpen(true)
    }
    const settled = (view: EditorView) => {
      clearTimeout(settle.current)
      settle.current = setTimeout(() => place(view), SETTLE_MS)
    }

    /** Tell the toolbar when the first step appears or the last one goes, and not on every key. */
    const count = (state: EditorState) => {
      const next = { undo: undoDepth(state) > 0, redo: redoDepth(state) > 0 }
      setSteps((now) => (now.undo === next.undo && now.redo === next.redo ? now : next))
    }
    const extensions = [
      history(),
      drawSelection(),
      landedField,
      EditorView.lineWrapping,
      skillMarkdown(),
      markdownHighlighting,
      editorTheme,
      keymap.of([
        ...formatKeymap,
        {
          // The popout takes no focus as it opens, and Tab indents: this is the keyboard's way into it.
          // F6 is the key that moves to the next part of a window. Escape comes back to the text.
          key: 'F6',
          run: () => {
            const first = document
              .getElementById(popout.current)
              ?.querySelector<HTMLElement>('button:not(:disabled)')
            if (!first) return false
            first.focus()
            return true
          },
        },
        {
          key: 'Mod-s',
          run: () => {
            latest.current.onSave?.()
            return true
          },
        },
        indentWithTab,
        ...EDITING_KEYMAP,
        ...historyKeymap,
      ]),
      hint ? placeholder(hint) : [],
      EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false' }),
      EditorView.domEventHandlers({
        mousedown: (event, view) => {
          // A click on a rule's number selects the rule, and the popout opens on it.
          const number = (event.target as HTMLElement).closest?.('.cm-md-rulenum')
          if (number) {
            const rule = ruleAt(view.state, view.posAtDOM(number))
            if (rule) {
              view.dispatch({ selection: { anchor: rule.from, head: rule.to } })
              view.focus()
              settled(view)
              return true
            }
          }
          dragging.current = true
          return false
        },
      }),
      nonce ? EditorView.cspNonce.of(nonce) : [],
      modes.current.of(mode === 'formatted' ? livePreview : []),
      grading.current.of(graded ? gradedRules(about, mode === 'markdown') : []),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !update.transactions.some((tr) => tr.annotation(fromScreen)))
          latest.current.onChange(update.state.doc.toString())
        count(update.state)
        if (update.selectionSet || update.docChanged) settled(update.view)
      }),
    ]
    const before = kept.get(id)
    const view = new EditorView({
      parent: host.current!,
      state:
        before?.doc === value
          ? EditorState.fromJSON(before, { extensions }, { history: historyField })
          : EditorState.create({ doc: value, extensions }),
    })
    count(view.state)
    editor.current = view
    mounted.add(id)
    // A drag ends outside the editor as often as in it.
    const up = () => {
      if (!dragging.current) return
      dragging.current = false
      settled(view)
    }
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mouseup', up)
      clearTimeout(settle.current)
      mounted.delete(id)
      if (!forgotten.delete(id)) keep(id, view.state.toJSON({ history: historyField }))
      view.destroy()
      editor.current = null
    }
  }, [])

  /**
   * Put `next` where `original` is, and report it on the status line with
   * Undo. Every replace from the popout or the side panel comes through here.
   */
  const apply = (original: string, next: string, hint?: { from: number; to: number }) => {
    const view = editor.current
    const spec = refining.current
    if (!view || !spec) return 'missing' as const
    if (replaceIn(view, original, next, hint) === 'missing') return 'missing' as const
    const after = view.state.doc
    spec.onReplaced(() => {
      const now = editor.current
      if (!now) return
      // Nothing typed since: the history step is exactly the replace.
      if (now.state.doc === after) undo(now)
      else if (replaceIn(now, next, original) === 'missing')
        spec.onError('The new text has changed since. Undo it in the editor.')
    })
    return 'replaced' as const
  }
  const applying = useRef(apply)
  applying.current = apply

  // While a SKILL.md is open here, the side panel's draft has somewhere to land.
  const refined = refine !== undefined
  useEffect(() => {
    if (!refined) return
    registerReplacer((original, next) => {
      // The draft goes where its selection was taken, while the text there is still that selection:
      // the same words elsewhere in the file are not the ones that were asked about.
      const at = improving.current
      const here =
        at &&
        at.selection === original &&
        editor.current?.state.sliceDoc(at.from, at.to) === original
          ? { from: at.from, to: at.to }
          : undefined
      return applying.current(original, next, here)
    })
    return () => registerReplacer(null)
  }, [refined])

  // Text that changed outside the editor (a template, a discarded draft): change only what differs.
  useEffect(() => {
    const view = editor.current
    if (!view) return
    const now = view.state.doc.toString()
    if (now === value) return
    let start = 0
    while (start < now.length && start < value.length && now[start] === value[start]) start++
    let end = now.length
    let next = value.length
    while (end > start && next > start && now[end - 1] === value[next - 1]) {
      end--
      next--
    }
    view.dispatch({
      changes: { from: start, to: end, insert: value.slice(start, next) },
      annotations: fromScreen.of(true),
    })
  }, [value])

  useEffect(() => {
    editor.current?.dispatch({
      effects: modes.current.reconfigure(mode === 'formatted' ? livePreview : []),
    })
  }, [mode])

  useEffect(() => {
    editor.current?.dispatch({
      effects: grading.current.reconfigure(graded ? gradedRules(about, mode === 'markdown') : []),
    })
  }, [graded, about, mode])

  useImperativeHandle(
    ref,
    () => ({
      insert(snippet) {
        const view = editor.current
        if (!view) return
        const { from, to } = view.state.selection.main
        const text = view.state.doc.toString()
        const next = insertAt(text, from, to, snippet)
        view.dispatch({
          changes: {
            from,
            to,
            insert: next.text.slice(from, next.text.length - (text.length - to)),
          },
          selection: { anchor: next.cursor },
          scrollIntoView: true,
          userEvent: 'input',
        })
        view.focus()
      },
      focus: () => editor.current?.focus(),
      assist: () => {
        // Opened from the page, not from the toolbar: it takes the whole file.
        editor.current?.dispatch({
          selection: { anchor: editor.current.state.selection.main.head },
        })
        setPicked(null)
        setAssistOpen(true)
      },
      selectLines(from, to) {
        const view = editor.current
        if (!view) return
        const doc = view.state.doc
        if (from < 1 || to < from || to > doc.lines) return
        const anchor = doc.line(from).from
        view.dispatch({
          selection: { anchor, head: doc.line(to).to },
          effects: EditorView.scrollIntoView(anchor, { y: 'center' }),
        })
        view.focus()
      },
    }),
    [],
  )

  const run = (command: StateCommand) => {
    const view = editor.current
    if (!view) return
    command(view)
    view.focus()
  }

  /** Something else is being read in place of the text: the tools have nothing to act on. */
  const covered = instead != null

  const tool = (action: Action, enabled = true) => (
    <ToolbarItem key={action.label} disabled={!enabled || covered}>
      <Button
        type="button"
        variant="ghost-muted"
        size="icon-sm"
        aria-label={action.label}
        title={action.keys ? `${action.label} (${shortcut(action.keys)})` : action.label}
        // Keep the editor's selection: the button acts on it.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => run(action.command)}
      >
        <action.icon aria-hidden="true" />
      </Button>
    </ToolbarItem>
  )

  return (
    <>
      <ColumnToolbar aria-label="Editing">
        <ToolbarGroup>
          {tool(UNDO, steps.undo)}
          {tool(REDO, steps.redo)}
        </ToolbarGroup>
        {ACTIONS.map((group) => (
          <ToolbarGroup key={group[0].label}>{group.map((action) => tool(action))}</ToolbarGroup>
        ))}
        <span className="ml-auto flex items-center gap-1">
          <TextSizeIndicator text={value} />
          {assist ? (
            <Assist
              field={picked ? 'skill.passage' : assist.field}
              value={picked ? value.slice(picked.from, picked.to) : value}
              blank={assist.blank}
              context={async () => [
                ...((await assist.context?.()) ?? []),
                ...(picked ? [{ label: 'The whole file', text: value }] : []),
              ]}
              open={assistOpen}
              onOpenChange={(open) => {
                setAssistOpen(open)
                const range = open ? editor.current?.state.selection.main : null
                setPicked(range && !range.empty ? { from: range.from, to: range.to } : null)
              }}
              onApply={(text) => {
                const view = editor.current
                if (picked && view)
                  view.dispatch({ changes: { ...picked, insert: text }, userEvent: 'input' })
                else onChange(text)
                view?.focus()
              }}
            >
              <ToolbarItem disabled={covered}>
                <Button
                  type="button"
                  variant="ghost-muted"
                  size="sm"
                  // Keep the editor's selection: it decides what gets rewritten.
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <PenLineIcon aria-hidden="true" />
                  Write with AI
                </Button>
              </ToolbarItem>
            </Assist>
          ) : null}
        </span>
      </ColumnToolbar>
      {instead ?? (banner ? <div className={BANNER}>{banner}</div> : null)}
      <div ref={host} hidden={covered} className={surfaceVariants({ mode })} />
      {refine && tools && !covered ? (
        <SelectionTools
          id={toolsId}
          key={`${tools.from}:${tools.to}`}
          anchor={anchor}
          open={toolsOpen}
          onOpenChange={setToolsOpen}
          onClosed={() => editor.current?.focus()}
          scene={tools}
          findings={tools.findings}
          onApply={(text) => {
            if (apply(tools.selection, text, tools) === 'missing')
              refine.onError('The selection changed before the text could be replaced.')
          }}
          onImprove={() => {
            improving.current = { selection: tools.selection, from: tools.from, to: tools.to }
            startImprove(tools).catch((e: Error) => refine.onError(e.message))
          }}
        />
      ) : null}
    </>
  )
}
