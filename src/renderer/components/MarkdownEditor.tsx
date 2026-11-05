/**
 * The editor for skill files, on CodeMirror 6. It has two views of one text:
 * formatted, where Markdown is styled in place and its marks show only where
 * the cursor is (Obsidian's live preview), and Markdown, the plain source.
 * Both edit the same characters, so switching views or saving never rewrites
 * the file. The toolbar and shortcuts apply styles by writing Markdown.
 */

import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
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
  ListTodoIcon,
  type LucideIcon,
  PenLineIcon,
  StrikethroughIcon,
  TextQuoteIcon,
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
import { ColumnToolbar } from './layout.tsx'
import { Segmented } from './Segmented.tsx'
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

const ACTIONS: readonly (readonly Action[])[] = [
  [
    { label: 'Heading 1', icon: Heading1Icon, command: toggleHeading(1) },
    { label: 'Heading 2', icon: Heading2Icon, command: toggleHeading(2) },
    { label: 'Heading 3', icon: Heading3Icon, command: toggleHeading(3) },
  ],
  [
    { label: 'Bold', icon: BoldIcon, command: toggleInline('strong'), keys: 'B' },
    { label: 'Italic', icon: ItalicIcon, command: toggleInline('emphasis'), keys: 'I' },
    {
      label: 'Strikethrough',
      icon: StrikethroughIcon,
      command: toggleInline('strike'),
      keys: '⇧X',
    },
    { label: 'Inline code', icon: CodeIcon, command: toggleInline('code'), keys: 'E' },
    { label: 'Link', icon: LinkIcon, command: insertLink },
  ],
  [
    { label: 'Bulleted list', icon: ListIcon, command: toggleList('bullet') },
    { label: 'Numbered list', icon: ListOrderedIcon, command: toggleList('ordered') },
    { label: 'Task list', icon: ListTodoIcon, command: toggleList('task') },
    { label: 'Quote', icon: TextQuoteIcon, command: toggleQuote },
  ],
]

const MODES = [
  { value: 'formatted', label: 'Formatted', title: 'Edit with the Markdown styled in place' },
  { value: 'markdown', label: 'Markdown', title: 'Edit the plain Markdown source' },
] as const

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
  value: string
  onChange: (value: string) => void
  onSave?: () => void
  mode: EditorMode
  onModeChange: (mode: EditorMode) => void
  placeholder?: string
  'aria-label': string
  /** Notes about the file, shown between the toolbar and the text. */
  banner?: ReactNode
  /**
   * The kind of file this is, which puts "Write with AI" in the toolbar. With
   * text selected it rewrites the selection only; otherwise the whole file.
   */
  assist?: AssistSpec
}

/** Mount once per file: give each file its own `key`, so undo history never crosses files. */
export function MarkdownEditor({
  ref,
  value,
  onChange,
  onSave,
  mode,
  onModeChange,
  placeholder: hint,
  'aria-label': label,
  banner,
  assist,
}: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<EditorView | null>(null)
  /** The selection "Write with AI" was opened on; null when it has the whole file. */
  const [picked, setPicked] = useState<{ from: number; to: number } | null>(null)
  const modes = useRef(new Compartment())
  const latest = useRef({ value, mode, hint, label, onChange, onSave })
  latest.current = { value, mode, hint, label, onChange, onSave }

  useEffect(() => {
    const { value, mode, hint, label } = latest.current
    const nonce = styleNonce()
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
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
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          hint ? placeholder(hint) : [],
          EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false' }),
          nonce ? EditorView.cspNonce.of(nonce) : [],
          modes.current.of(mode === 'formatted' ? livePreview : []),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) latest.current.onChange(update.state.doc.toString())
          }),
        ],
      }),
    })
    editor.current = view
    return () => {
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

  return (
    <>
      <ColumnToolbar aria-label="Formatting">
        {ACTIONS.map((group) => (
          <div key={group[0].label} className="flex items-center gap-0.5">
            {group.map((action) => {
              const title = action.keys
                ? `${action.label} (${shortcut(action.keys)})`
                : action.label
              return (
                <Button
                  key={action.label}
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={action.label}
                  title={title}
                  // Keep the editor's selection: the button acts on it.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => run(action.command)}
                >
                  <action.icon aria-hidden="true" />
                </Button>
              )
            })}
          </div>
        ))}
        <span className="ml-auto flex items-center gap-2">
          {assist ? (
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                // Keep the editor's selection: it decides what gets rewritten.
                onMouseDown={(e) => e.preventDefault()}
              >
                <PenLineIcon aria-hidden="true" />
                Write with AI
              </Button>
            </Assist>
          ) : null}
          <Segmented<EditorMode>
            aria-label="Editor view"
            value={mode}
            onChange={(next) => next && onModeChange(next)}
            options={MODES}
          />
        </span>
      </ColumnToolbar>
      {banner}
      <div ref={host} className={surfaceVariants({ mode })} />
    </>
  )
}
