/**
 * What colors code, wherever the app shows it: a code block in the editor
 * (`editor/theme.ts`) and a file a run wrote (`highlight.ts`). Three classes,
 * one hue each, written once so the two never color the same code two ways.
 *
 *  - `tok-keyword`: the language's own words, and a tag's name.
 *  - `tok-value`: what is written in it: a string, a number, `true`, `null`.
 *  - `tok-name`: what the code itself names and calls: a function, a type, a
 *    class.
 *
 * A comment is `tok-mark`, quieter than the text, and everything else is in
 * the text's color: a variable, a property, punctuation.
 */
import { tags } from '@lezer/highlight'

export const CODE_TOKENS = [
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
  {
    tag: [
      tags.function(tags.variableName),
      tags.function(tags.propertyName),
      tags.typeName,
      tags.className,
      tags.namespace,
      tags.macroName,
    ],
    class: 'tok-name',
  },
]
