/**
 * Skill files: front matter between `---` lines at the very top, then
 * GitHub-flavored Markdown. Built from `markdownLanguage` rather than
 * `markdown()`, which would also bundle the editing support of every embedded
 * language. A code block is read by its own language's parser alone, so its
 * comments and keywords can be told from the rest (`theme.ts`).
 */
import { markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown'
import { Language, LanguageSupport, StreamLanguage } from '@codemirror/language'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { type Extension, Prec } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { parser as css } from '@lezer/css'
import { tags } from '@lezer/highlight'
import { parser as html } from '@lezer/html'
import { parser as javascript } from '@lezer/javascript'
import { parser as json } from '@lezer/json'
import { type MarkdownConfig, type MarkdownParser, parseCode } from '@lezer/markdown'
import { parser as python } from '@lezer/python'
import { parser as yaml } from '@lezer/yaml'

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

const typescript = javascript.configure({ dialect: 'ts' })
const sh = StreamLanguage.define(shell).parser
/** The parser for each name a code block is opened with. A name not here reads as plain text. */
const CODE: Record<string, typeof javascript | typeof sh> = {
  js: javascript,
  javascript,
  mjs: javascript,
  cjs: javascript,
  jsx: javascript.configure({ dialect: 'jsx' }),
  ts: typescript,
  typescript,
  tsx: javascript.configure({ dialect: 'ts jsx' }),
  css,
  html,
  json,
  jsonc: javascript,
  py: python,
  python,
  yaml,
  yml: yaml,
  sh,
  bash: sh,
  zsh: sh,
  shell: sh,
}
/** A block's language is the first word after its fence, in any case: `TS title="a.ts"` is `ts`. */
export const codeParser = (info: string) =>
  CODE[/^[\w+#-]*/.exec(info.trim())?.[0].toLowerCase() ?? ''] ?? null

/** Markdown's own language with the front matter rule and code blocks' languages added; its commands still know it. */
const skillLanguage = new Language(
  markdownLanguage.data,
  (markdownLanguage.parser as MarkdownParser).configure([frontmatter, parseCode({ codeParser })]),
  [],
  'markdown',
)

export const skillMarkdown = (): Extension =>
  // Enter continues a list or quote; Backspace takes a marker off.
  new LanguageSupport(skillLanguage, Prec.high(keymap.of(markdownKeymap)))
