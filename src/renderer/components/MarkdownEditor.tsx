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
import { Compartment, EditorState, type StateCommand } from '@codemirror/state'
import { drawSelection, EditorView, keymap, placeholder } from '@codemirror/view'
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
import { type ReactNode, type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  formatKeymap,
  insertLink,
  toggleHeading,
  toggleInline,
  toggleList,
  toggleQuote,
} from '../editor/format.ts'
import { skillMarkdown } from '../editor/language.ts'
import { livePreview } from '../editor/live-preview.ts'
import { editorTheme, markdownHighlighting } from '../editor/theme.ts'
import { shortcut } from '../keys.ts'
import { setPreferences, usePreferences } from '../preferences.ts'
import { Assist, type AssistSpec } from './Assist.tsx'
import { ColumnToolbar, ToolbarGroup, ToolbarItem } from './layout.tsx'
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
  /** Notes about the file, shown between the toolbar and the text. */
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
}: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<EditorView | null>(null)
  /** The selection "Write with AI" was opened on; null when it has the whole file. */
  const [picked, setPicked] = useState<{ from: number; to: number } | null>(null)
  /** Whether there is a step to take back, and one to take again. */
  const [steps, setSteps] = useState({ undo: false, redo: false })
  const modes = useRef(new Compartment())
  const latest = useRef({ id, value, mode, hint, label, onChange, onSave })
  latest.current = { id, value, mode, hint, label, onChange, onSave }

  useEffect(() => {
    const { id, value, mode, hint, label } = latest.current
    const nonce = styleNonce()
    /** Tell the toolbar when the first step appears or the last one goes, and not on every key. */
    const count = (state: EditorState) => {
      const next = { undo: undoDepth(state) > 0, redo: redoDepth(state) > 0 }
      setSteps((now) => (now.undo === next.undo && now.redo === next.redo ? now : next))
    }
    const extensions = [
      history(),
      drawSelection(),
      EditorView.lineWrapping,
      skillMarkdown(),
      markdownHighlighting,
      editorTheme,
      keymap.of([
        ...formatKeymap,
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
      nonce ? EditorView.cspNonce.of(nonce) : [],
      modes.current.of(mode === 'formatted' ? livePreview : []),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) latest.current.onChange(update.state.doc.toString())
        count(update.state)
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
    return () => {
      kept.set(id, view.state.toJSON({ history: historyField }))
      view.destroy()
      editor.current = null
    }
  }, [])

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
    view.dispatch({ changes: { from: start, to: end, insert: value.slice(start, next) } })
  }, [value])

  useEffect(() => {
    editor.current?.dispatch({
      effects: modes.current.reconfigure(mode === 'formatted' ? livePreview : []),
    })
  }, [mode])

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
        {assist ? (
          <span className="ml-auto flex items-center">
            <Assist
              field={picked ? 'skill.passage' : assist.field}
              value={picked ? value.slice(picked.from, picked.to) : value}
              context={async () => [
                ...((await assist.context?.()) ?? []),
                ...(picked ? [{ label: 'The whole file', text: value }] : []),
              ]}
              onOpenChange={(open) => {
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
          </span>
        ) : null}
      </ColumnToolbar>
      {instead ?? banner}
      <div ref={host} hidden={covered} className={surfaceVariants({ mode })} />
    </>
  )
}
