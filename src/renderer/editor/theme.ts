/**
 * The Markdown editor's look, on the app's color tokens so it follows light
 * and dark. CodeMirror's own base styles are unlayered, so they would beat
 * anything in a Tailwind layer: every editor rule lives here instead, in the
 * same style tag. The font and its size come from the element around the
 * editor, so the two views can differ without a second theme.
 */

import { syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tagHighlighter, tags } from '@lezer/highlight'

const MONO = 'var(--font-mono, ui-monospace, monospace)'
const GUTTER = '24px'
/** A full-width band behind a line, inset to the text's edges, for code and front matter. */
const band = (color: string) => ({
  backgroundImage: `linear-gradient(${color}, ${color})`,
  backgroundSize: `calc(100% - 2 * ${GUTTER}) 100%`,
  backgroundPosition: `${GUTTER} 0`,
  backgroundRepeat: 'no-repeat',
  paddingLeft: `calc(${GUTTER} + 12px)`,
  paddingRight: `calc(${GUTTER} + 12px)`,
})

/** Token classes for both views: Markdown's marks read quieter than the text they mark. */
export const markdownHighlighting = syntaxHighlighting(
  tagHighlighter([
    { tag: tags.heading, class: 'tok-heading' },
    { tag: tags.strong, class: 'tok-strong' },
    { tag: tags.emphasis, class: 'tok-emphasis' },
    { tag: tags.strikethrough, class: 'tok-strike' },
    { tag: [tags.link, tags.url], class: 'tok-link' },
    { tag: tags.monospace, class: 'tok-code' },
    {
      tag: [
        tags.processingInstruction,
        tags.meta,
        tags.labelName,
        tags.contentSeparator,
        tags.comment,
      ],
      class: 'tok-mark',
    },
  ]),
)

export const editorTheme = EditorView.theme({
  '&': { color: 'var(--foreground)', backgroundColor: 'transparent', fontSize: 'inherit' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: 'inherit' },
  '.cm-content': { padding: '20px 0 64px', caretColor: 'var(--foreground)' },
  '.cm-line': { padding: `0 ${GUTTER}` },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)', borderLeftWidth: '1.5px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'color-mix(in oklch, var(--foreground) 13%, transparent)' },
  '.cm-placeholder': { color: 'var(--muted-foreground)' },

  '.tok-heading, .tok-strong': { fontWeight: '600' },
  // Geist ships no italic and the app turns font synthesis off, so emphasis would not show.
  '.tok-emphasis, .cm-md-em': { fontStyle: 'italic', fontSynthesis: 'style' },
  '.tok-strike': { textDecoration: 'line-through' },
  '.tok-link': { color: 'var(--muted-foreground)' },
  '.tok-mark': { color: 'var(--muted-foreground)', fontWeight: '400', fontStyle: 'normal' },
  '.cm-md-key': { color: 'var(--foreground)' },

  // Formatted view. Headings, quotes and lists read as a page, not as source.
  '.cm-line.cm-md-h1': { fontSize: '1.6em', lineHeight: '1.3', paddingTop: '0.6em' },
  '.cm-line.cm-md-h2': { fontSize: '1.3em', lineHeight: '1.35', paddingTop: '0.7em' },
  '.cm-line.cm-md-h3': { fontSize: '1.12em', lineHeight: '1.4', paddingTop: '0.5em' },
  '.cm-line:is(.cm-md-h1, .cm-md-h2, .cm-md-h3, .cm-md-h4, .cm-md-h5, .cm-md-h6)': {
    fontWeight: '600',
    letterSpacing: '-0.012em',
  },
  '.cm-md-strong': { fontWeight: '600' },
  '.cm-md-strike': { textDecoration: 'line-through' },
  '.cm-md-code': {
    fontFamily: MONO,
    fontSize: '0.86em',
    backgroundColor: 'var(--muted)',
    borderRadius: '4px',
    padding: '0.1em 0.3em',
  },
  '.cm-md-link': {
    color: 'var(--foreground)',
    textDecoration: 'underline',
    textDecorationColor: 'var(--input)',
    textUnderlineOffset: '3px',
  },
  '.cm-line.cm-md-quote': {
    color: 'var(--muted-foreground)',
    backgroundImage: 'linear-gradient(var(--input), var(--input))',
    backgroundSize: '2px 100%',
    backgroundPosition: `${GUTTER} 0`,
    backgroundRepeat: 'no-repeat',
    paddingLeft: `calc(${GUTTER} + 14px)`,
  },
  '.cm-md-bullet': { color: 'var(--muted-foreground)', paddingRight: '0.15em' },
  '.cm-md-number': { color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' },
  '.cm-md-task': {
    width: '0.95em',
    height: '0.95em',
    margin: '0 0.4em 0.15em 0',
    verticalAlign: 'middle',
    accentColor: 'var(--foreground)',
    cursor: 'pointer',
  },
  '.cm-md-done': { color: 'var(--muted-foreground)', textDecoration: 'line-through' },
  '.cm-line.cm-md-rule': {
    backgroundImage: 'linear-gradient(var(--input), var(--input))',
    backgroundSize: `calc(100% - 2 * ${GUTTER}) 1px`,
    backgroundPosition: `${GUTTER} 50%`,
    backgroundRepeat: 'no-repeat',
  },
  '.cm-line:is(.cm-md-codeblock, .cm-md-frontmatter, .cm-md-table)': {
    fontFamily: MONO,
    fontSize: '0.87em',
  },
  '.cm-line.cm-md-codeblock': band('var(--muted)'),
  '.cm-line.cm-md-frontmatter': { ...band('var(--muted)'), color: 'var(--muted-foreground)' },
  '.cm-line:is(.cm-md-codeblock-start, .cm-md-frontmatter-start)': { paddingTop: '6px' },
  '.cm-line:is(.cm-md-codeblock-end, .cm-md-frontmatter-end)': { paddingBottom: '6px' },
  '.cm-md-fence': { color: 'var(--muted-foreground)' },
})
