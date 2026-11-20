/**
 * Code an output wrote, colored by its language as the editor colors a code
 * block: a language's own words, its values, and its comments. The language
 * is read from the file's name. Each is parsed by its own grammar, so a
 * keyword inside a string is never colored as one.
 *
 * It only reads: no editor is made, and no style tag, so it works under the
 * built app's policy. The grammars are heavy, so this module is loaded when
 * the first code file is shown (`CodeFile` in `components/Artifact.tsx`).
 */
import { StreamLanguage, type StreamParser } from '@codemirror/language'
import { java, kotlin } from '@codemirror/legacy-modes/mode/clike'
import { go } from '@codemirror/legacy-modes/mode/go'
import { ruby } from '@codemirror/legacy-modes/mode/ruby'
import { rust } from '@codemirror/legacy-modes/mode/rust'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { standardSQL } from '@codemirror/legacy-modes/mode/sql'
import { swift } from '@codemirror/legacy-modes/mode/swift'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { parser as css } from '@lezer/css'
import { highlightTree, tagHighlighter, tags } from '@lezer/highlight'
import { parser as html } from '@lezer/html'
import { parser as javascript } from '@lezer/javascript'
import { parser as json } from '@lezer/json'
import { parser as python } from '@lezer/python'
import { parser as yaml } from '@lezer/yaml'

/** What reads a file into the tree its colors come from: a grammar of its own, or an older mode read as one. */
interface Grammar {
  parse(text: string): Parameters<typeof highlightTree>[0]
}

const legacy = (mode: StreamParser<unknown>): Grammar => StreamLanguage.define(mode).parser

/** The grammar for each ending a file may have. One not here reads as plain text. */
const BY_ENDING: Record<string, Grammar> = {
  js: javascript,
  mjs: javascript,
  cjs: javascript,
  jsx: javascript.configure({ dialect: 'jsx' }),
  ts: javascript.configure({ dialect: 'ts' }),
  mts: javascript.configure({ dialect: 'ts' }),
  cts: javascript.configure({ dialect: 'ts' }),
  tsx: javascript.configure({ dialect: 'ts jsx' }),
  json,
  // Comments are allowed in these, which the JSON grammar reads as errors.
  jsonc: javascript,
  json5: javascript,
  css,
  // Close enough to CSS for its words and values; nesting reads as rules.
  scss: css,
  html,
  htm: html,
  svg: html,
  xml: html,
  vue: html,
  py: python,
  yaml,
  yml: yaml,
  sh: legacy(shell),
  bash: legacy(shell),
  zsh: legacy(shell),
  go: legacy(go),
  rs: legacy(rust),
  java: legacy(java),
  kt: legacy(kotlin),
  kts: legacy(kotlin),
  rb: legacy(ruby),
  toml: legacy(toml),
  sql: legacy(standardSQL),
  swift: legacy(swift),
}

/**
 * The same three classes the editor gives code in a block (`editor/theme.ts`),
 * so code reads alike wherever the app shows it: `tok-keyword` for the
 * language's own words and a tag's name, `tok-value` for what is written in
 * it, `tok-mark` for a comment and the like.
 */
const classes = tagHighlighter([
  { tag: [tags.keyword, tags.tagName], class: 'tok-keyword' },
  {
    tag: [
      tags.string,
      tags.number,
      tags.bool,
      tags.null,
      tags.atom,
      tags.color,
      tags.attributeValue,
    ],
    class: 'tok-value',
  },
  { tag: [tags.comment, tags.meta, tags.processingInstruction], class: 'tok-mark' },
])

/** A run of text, and the class that colors it; none for plain text. */
export interface Token {
  text: string
  class?: string
}

/** Past this, a file is shown plain: tens of thousands of colored runs slow the page more than they help the reader. */
const MOST = 200_000

/** The ending of a file's name, in lower case: `src/Card.TSX` is `tsx`. */
const endingOf = (file: string): string =>
  /\.([\w+-]+)$/.exec(file.slice(file.lastIndexOf('/') + 1))?.[1].toLowerCase() ?? ''

/**
 * `text` as runs, each with its class, in order and with nothing left out:
 * joined, they are `text`. Null for a language not known here and for a file
 * too long to color, which the caller shows plain.
 */
export function highlighted(text: string, file: string): Token[] | null {
  const parser = BY_ENDING[endingOf(file)]
  if (!parser || text.length > MOST) return null
  const tokens: Token[] = []
  let at = 0
  highlightTree(parser.parse(text), classes, (from, to, cls) => {
    if (from > at) tokens.push({ text: text.slice(at, from) })
    tokens.push({ text: text.slice(from, to), class: cls })
    at = to
  })
  if (at < text.length) tokens.push({ text: text.slice(at) })
  return tokens
}
