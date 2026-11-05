/**
 * Skill files: front matter between `---` lines at the very top, then
 * GitHub-flavored Markdown. Built from `markdownLanguage` rather than
 * `markdown()`, which would also bundle the HTML, CSS and JavaScript parsers
 * for embedded HTML (about 150 KB gzipped) that skill files do not need.
 */
import { markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown'
import { Language, LanguageSupport } from '@codemirror/language'
import { type Extension, Prec } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import type { MarkdownConfig, MarkdownParser } from '@lezer/markdown'

const FENCE = /^---[ \t]*$/

/**
 * The front matter as one `Frontmatter` block, so its `---` lines never read
 * as a rule or a heading underline. Left open, it runs to the end, as it is
 * read on disk.
 */
const frontmatter: MarkdownConfig = {
  defineNodes: [
    { name: 'Frontmatter', block: true },
    { name: 'FrontmatterMark', style: tags.processingInstruction },
  ],
  parseBlock: [
    {
      name: 'Frontmatter',
      before: 'HorizontalRule',
      parse(cx, line) {
        if (cx.lineStart !== 0 || !FENCE.test(line.text)) return false
        const marks = [cx.elt('FrontmatterMark', 0, line.text.length)]
        while (cx.nextLine()) {
          if (!FENCE.test(line.text)) continue
          const end = cx.lineStart + line.text.length
          marks.push(cx.elt('FrontmatterMark', cx.lineStart, end))
          cx.nextLine()
          cx.addElement(cx.elt('Frontmatter', 0, end, marks))
          return true
        }
        cx.addElement(cx.elt('Frontmatter', 0, cx.prevLineEnd(), marks))
        return true
      },
    },
  ],
}

/** Markdown's own language with the front matter rule added; its commands still know it. */
const skillLanguage = new Language(
  markdownLanguage.data,
  (markdownLanguage.parser as MarkdownParser).configure(frontmatter),
  [],
  'markdown',
)

export const skillMarkdown = (): Extension =>
  // Enter continues a list or quote; Backspace takes a marker off.
  new LanguageSupport(skillLanguage, Prec.high(keymap.of(markdownKeymap)))
