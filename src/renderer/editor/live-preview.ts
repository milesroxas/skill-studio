/**
 * Live preview, the way Obsidian edits Markdown: the text stays the source,
 * and decorations style it in place. Syntax marks (`#`, `**`, a backtick, a
 * link's address) hide until the cursor reaches the line or span they belong
 * to, so the writer reads formatted text and still edits plain Markdown.
 * Only the visible part of the document is decorated, so long files stay fast.
 */
import { syntaxTree } from '@codemirror/language'
import type { Range } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'

const hide = Decoration.replace({})
const marks = new Map<string, Decoration>()
const lines = new Map<string, Decoration>()
const mark = (cls: string) =>
  marks.get(cls) ?? marks.set(cls, Decoration.mark({ class: cls })).get(cls)!
const line = (cls: string) =>
  lines.get(cls) ?? lines.set(cls, Decoration.line({ class: cls })).get(cls)!

class Bullet extends WidgetType {
  eq() {
    return true
  }
  toDOM() {
    const dot = document.createElement('span')
    dot.className = 'cm-md-bullet'
    dot.textContent = '•'
    return dot
  }
}

/** A task's `[ ]` or `[x]` as a checkbox. A click flips the character in the source. */
class Checkbox extends WidgetType {
  constructor(readonly checked: boolean) {
    super()
  }
  eq(other: Checkbox) {
    return other.checked === this.checked
  }
  toDOM(view: EditorView) {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = this.checked
    box.tabIndex = -1
    box.className = 'cm-md-task'
    box.setAttribute('aria-label', this.checked ? 'Done' : 'Not done')
    box.addEventListener('mousedown', (event) => {
      event.preventDefault()
      const at = view.posAtDOM(box) + 1
      const now = view.state.sliceDoc(at, at + 1)
      if (!/^[ xX]$/.test(now)) return
      view.dispatch({
        changes: { from: at, to: at + 1, insert: now === ' ' ? 'x' : ' ' },
        userEvent: 'input.toggle',
      })
    })
    return box
  }
}

const BULLET = Decoration.replace({ widget: new Bullet() })
const CHECKED = Decoration.replace({ widget: new Checkbox(true) })
const UNCHECKED = Decoration.replace({ widget: new Checkbox(false) })

const ATX = /^ATXHeading([1-6])$/
const SETEXT = /^SetextHeading([12])$/
const INLINE: Record<string, string> = {
  StrongEmphasis: 'cm-md-strong',
  Emphasis: 'cm-md-em',
  Strikethrough: 'cm-md-strike',
  InlineCode: 'cm-md-code',
}
/** Marks that belong to an inline style and hide with it. */
const INLINE_MARKS = new Set(['EmphasisMark', 'StrikethroughMark', 'CodeMark'])

function decorate(view: EditorView): DecorationSet {
  const { state } = view
  const { doc } = state
  const ranges = view.hasFocus ? state.selection.ranges : []
  /** Reveal syntax only where the cursor is, and nowhere while the editor is not focused. */
  const touches = (from: number, to: number) => ranges.some((r) => r.from <= to && r.to >= from)
  const onLines = (from: number, to: number) => touches(doc.lineAt(from).from, doc.lineAt(to).to)
  const out: Range<Decoration>[] = []
  const { from: top, to: bottom } = view.viewport

  /** A class on every line of `[from, to]` in view, with extra ones on the first and last. */
  const block = (from: number, to: number, cls: string) => {
    const first = doc.lineAt(from).number
    const last = doc.lineAt(to).number
    const start = Math.max(first, doc.lineAt(top).number)
    const end = Math.min(last, doc.lineAt(bottom).number)
    for (let n = start; n <= end; n++) {
      const edge = `${n === first ? ` ${cls}-start` : ''}${n === last ? ` ${cls}-end` : ''}`
      out.push(line(cls + edge).range(doc.line(n).from))
    }
  }
  /** Hide `[from, to]` and one space after it, as for `# ` or `> `. */
  const hideWithSpace = (from: number, to: number) =>
    out.push(hide.range(from, doc.sliceString(to, to + 1) === ' ' ? to + 1 : to))

  syntaxTree(state).iterate({
    from: top,
    to: bottom,
    enter(node) {
      const { name, from, to } = node
      const atx = ATX.exec(name)
      if (atx) {
        out.push(line(`cm-md-h${atx[1]}`).range(doc.lineAt(from).from))
        if (!onLines(from, to))
          for (const m of node.node.getChildren('HeaderMark'))
            if (m.from === from) hideWithSpace(m.from, m.to)
            else out.push(hide.range(m.from, m.to))
        return
      }
      const setext = SETEXT.exec(name)
      if (setext) {
        const underline = node.node.getChild('HeaderMark')
        const textEnd = underline ? underline.from - 1 : to
        if (textEnd > from) block(from, textEnd, `cm-md-h${setext[1]}`)
        return
      }
      if (name in INLINE) {
        out.push(mark(INLINE[name]).range(from, to))
        if (!touches(from, to))
          for (let child = node.node.firstChild; child; child = child.nextSibling)
            if (INLINE_MARKS.has(child.name)) out.push(hide.range(child.from, child.to))
        return name !== 'InlineCode'
      }
      switch (name) {
        case 'Link': {
          const [open, close] = node.node.getChildren('LinkMark')
          if (!open || !close || close.from <= open.to) return
          out.push(mark('cm-md-link').range(open.to, close.from))
          if (node.node.getChild('URL') && !touches(from, to)) {
            out.push(hide.range(from, open.to))
            out.push(hide.range(close.from, to))
          }
          return false
        }
        case 'URL':
          if (node.node.parent?.name !== 'Link' && node.node.parent?.name !== 'Image')
            out.push(mark('cm-md-link').range(from, to))
          return
        case 'Blockquote':
          block(from, to, 'cm-md-quote')
          return
        case 'QuoteMark':
          if (!onLines(from, to)) hideWithSpace(from, to)
          return
        case 'ListMark': {
          const item = node.node.parent
          const task = item?.getChild('Task')
          if (item?.parent?.name !== 'BulletList') {
            out.push(mark('cm-md-number').range(from, to))
            return
          }
          if (touches(from, to + 1)) return
          if (task) out.push(hide.range(from, Math.min(to + 1, task.from)))
          else out.push(BULLET.range(from, to))
          return
        }
        case 'TaskMarker': {
          const checked = /x/i.test(doc.sliceString(from + 1, to - 1))
          if (checked) {
            const task = node.node.parent
            if (task && task.to > to) out.push(mark('cm-md-done').range(to, task.to))
          }
          if (!touches(from, to)) out.push((checked ? CHECKED : UNCHECKED).range(from, to))
          return
        }
        case 'FencedCode':
        case 'CodeBlock':
          block(from, to, 'cm-md-codeblock')
          return
        case 'CodeInfo':
          out.push(mark('cm-md-fence').range(from, to))
          return
        case 'HorizontalRule':
          if (!onLines(from, to)) {
            out.push(line('cm-md-rule').range(doc.lineAt(from).from))
            out.push(hide.range(from, to))
          }
          return
        case 'Frontmatter': {
          block(from, to, 'cm-md-frontmatter')
          // Each `key:` reads in the text color, its value muted, as a list of properties.
          const last = Math.min(doc.lineAt(to).number, doc.lineAt(bottom).number)
          for (let n = doc.lineAt(Math.max(from, top)).number; n <= last; n++) {
            const { from: start, text } = doc.line(n)
            const key = /^[\w-]+:/.exec(text)
            if (key) out.push(mark('cm-md-key').range(start, start + key[0].length))
          }
          return false
        }
        case 'Table':
          block(from, to, 'cm-md-table')
          return false
        default:
          return
      }
    },
  })
  return Decoration.set(out, true)
}

class LivePreview {
  decorations: DecorationSet
  constructor(view: EditorView) {
    this.decorations = decorate(view)
  }
  update(update: ViewUpdate) {
    if (
      update.docChanged ||
      update.viewportChanged ||
      update.selectionSet ||
      update.focusChanged ||
      syntaxTree(update.startState) !== syntaxTree(update.state)
    )
      this.decorations = decorate(update.view)
  }
}

/** Formatted editing. Leave it out for the plain Markdown view. */
export const livePreview = [
  ViewPlugin.fromClass(LivePreview, { decorations: (plugin) => plugin.decorations }),
  EditorView.editorAttributes.of({ class: 'cm-md-live' }),
]
