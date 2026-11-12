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
/** The width a list mark takes, in the line's em: a bullet, a rule's number, or `1.`. */
const MARK_SLOT = 1.4
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
  // A graded rule's number stands where its bullet was, in the same slot, so rules and plain
  // bullets share one text edge. In the Markdown view it hangs before the source mark instead.
  // Amber when the checks found something; the words that set a check off are underlined.
  '.cm-md-rulenum': {
    display: 'inline-block',
    width: `${MARK_SLOT / 0.8}em`,
    textIndent: '0',
    fontFamily: MONO,
    fontSize: '0.8em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    userSelect: 'none',
  },
  '.cm-md-rulenum.cm-md-hanging': {
    width: `${MARK_SLOT / 0.8}em`,
    marginLeft: `-${MARK_SLOT / 0.8}em`,
    paddingRight: '0.45em',
    textAlign: 'right',
  },
  '.cm-md-rulenum.cm-md-flagged': { color: 'var(--warning)' },
  // While their popout is open the words take the verdict's tint, as a word in a diff does, so
  // the popout reads as being about them. It fades in and out with the popout.
  '.cm-md-flag': {
    textDecoration: 'underline dotted',
    textDecorationColor: 'var(--warning)',
    textUnderlineOffset: '3px',
    borderRadius: '2px',
    transition: 'background-color 150ms ease-out',
  },
  '.cm-md-flag.cm-md-pointed': {
    backgroundColor: 'color-mix(in oklch, var(--warning) 10%, transparent)',
  },
  ':root[data-theme="dark"] & .cm-md-flag.cm-md-pointed': {
    backgroundColor: 'color-mix(in oklch, var(--warning) 20%, transparent)',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)', borderLeftWidth: '1.5px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'color-mix(in oklch, var(--foreground) 13%, transparent)' },
  '.cm-placeholder': { color: 'var(--muted-foreground)' },
  // Text the app just put in place, such as a picked rewrite: it keeps the selection's tint,
  // then fades, so the eye finds what changed (`landed.ts`). Color only, so it holds still.
  '@keyframes cm-landed-fade': {
    '0%, 45%': { backgroundColor: 'color-mix(in oklch, var(--foreground) 13%, transparent)' },
    '100%': { backgroundColor: 'transparent' },
  },
  '.cm-landed': {
    backgroundColor: 'color-mix(in oklch, var(--foreground) 13%, transparent)',
    animation: 'cm-landed-fade 1400ms ease-out forwards',
    borderRadius: '2px',
  },
  // Less movement asked for: the tint holds plain until the mark clears. It is a color, not motion.
  ':root[data-motion="reduced"] & .cm-landed': { animation: 'none' },
  // The rule the side panel is improving (`improving.ts`), held while the conversation is open: a
  // bar in the gutter beside each of its lines, which no selection has, over a tint on its words
  // lighter than the selection's. Never yellow: the rule is not running, it is being talked about.
  '.cm-improving': {
    backgroundColor: 'color-mix(in oklch, var(--foreground) 9%, transparent)',
    borderRadius: '2px',
  },
  '.cm-line.cm-improving-line': { position: 'relative' },
  '.cm-line.cm-improving-line::before': {
    content: '""',
    position: 'absolute',
    left: '8px',
    top: '0',
    bottom: '0',
    width: '2px',
    backgroundColor: 'color-mix(in oklch, var(--foreground) 55%, transparent)',
  },

  '.tok-heading, .tok-strong': { fontWeight: '600' },
  // Geist ships no italic and the app turns font synthesis off, so emphasis would not show.
  '.tok-emphasis, .cm-md-em': { fontStyle: 'italic', fontSynthesis: 'style' },
  '.tok-strike': { textDecoration: 'line-through' },
  '.tok-link': { color: 'var(--muted-foreground)' },
  '.tok-mark': { color: 'var(--muted-foreground)', fontWeight: '400', fontStyle: 'normal' },
  '.cm-md-key': { color: 'var(--foreground)' },

  // Formatted view. Headings, quotes and lists read as a page, not as source.
  // The same steps as an output's headings (.doc in styles.css): 21, 18 and 16px over 15.
  '.cm-line.cm-md-h1': { fontSize: '1.4em', lineHeight: '1.33', paddingTop: '0.6em' },
  '.cm-line.cm-md-h2': { fontSize: '1.2em', lineHeight: '1.44', paddingTop: '0.7em' },
  '.cm-line.cm-md-h3': { fontSize: '1.0667em', lineHeight: '1.5', paddingTop: '0.5em' },
  '.cm-line:is(.cm-md-h1, .cm-md-h2, .cm-md-h3, .cm-md-h4, .cm-md-h5, .cm-md-h6)': {
    fontWeight: '600',
    letterSpacing: '-0.012em',
  },
  '.cm-md-strong': { fontWeight: '600' },
  '.cm-md-strike': { textDecoration: 'line-through' },
  '.cm-md-code': {
    fontFamily: MONO,
    fontSize: '0.9em',
    backgroundColor: 'var(--muted)',
    borderRadius: 'var(--radius-xs)',
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
  // List items hang: the mark takes a fixed slot and wrapped lines start under the text.
  '.cm-line.cm-md-li': {
    paddingLeft: `calc(${GUTTER} + ${MARK_SLOT}em)`,
    textIndent: `-${MARK_SLOT}em`,
  },
  '.cm-md-bullet': {
    display: 'inline-block',
    width: `${MARK_SLOT}em`,
    textIndent: '0',
    color: 'var(--muted-foreground)',
  },
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
    fontSize: '0.9em',
  },
  '.cm-line.cm-md-codeblock': band('var(--muted)'),
  '.cm-line.cm-md-frontmatter': { ...band('var(--muted)'), color: 'var(--muted-foreground)' },
  '.cm-line:is(.cm-md-codeblock-start, .cm-md-frontmatter-start)': { paddingTop: '6px' },
  '.cm-line:is(.cm-md-codeblock-end, .cm-md-frontmatter-end)': { paddingBottom: '6px' },
  '.cm-md-fence': { color: 'var(--muted-foreground)' },
})
