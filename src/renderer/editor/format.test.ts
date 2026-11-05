import { insertNewlineContinueMarkup } from '@codemirror/lang-markdown'
import { EditorSelection, EditorState, type StateCommand } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { insertLink, toggleHeading, toggleInline, toggleList, toggleQuote } from './format.ts'
import { skillMarkdown } from './language.ts'

/** `«` and `»` mark a selection, `‸` a cursor. */
function stateOf(marked: string): EditorState {
  const cursor = marked.indexOf('‸')
  const doc = marked.replace(/[«»‸]/g, '')
  const selection =
    cursor >= 0
      ? EditorSelection.cursor(cursor)
      : EditorSelection.range(marked.indexOf('«'), marked.indexOf('»') - 1)
  return EditorState.create({ doc, selection, extensions: skillMarkdown() })
}

function show(state: EditorState): string {
  const { from, to } = state.selection.main
  const doc = state.doc.toString()
  if (from === to) return `${doc.slice(0, from)}‸${doc.slice(from)}`
  return `${doc.slice(0, from)}«${doc.slice(from, to)}»${doc.slice(to)}`
}

function run(marked: string, command: StateCommand): string {
  let state = stateOf(marked)
  command({ state, dispatch: (tr) => (state = tr.state) })
  return show(state)
}

describe('toggleInline', () => {
  it('wraps the selection and keeps it selected', () => {
    expect(run('a «word» b', toggleInline('strong'))).toBe('a **«word»** b')
  })

  it('takes the style off when the selection already has it', () => {
    expect(run('a **«word»** b', toggleInline('strong'))).toBe('a «word» b')
    expect(run('a *wo‸rd* b', toggleInline('emphasis'))).toBe('a wo‸rd b')
  })

  it('leaves edge spaces outside the marks', () => {
    expect(run('a« word »b', toggleInline('code'))).toBe('a `«word»` b')
  })

  it('puts an empty pair at a cursor and the cursor between them', () => {
    expect(run('a ‸b', toggleInline('strike'))).toBe('a ~~‸~~b')
  })
})

describe('toggleHeading', () => {
  it('makes a line a heading, changes its level, and takes it off', () => {
    expect(run('Ti‸tle', toggleHeading(2))).toBe('## Ti‸tle')
    expect(run('## Ti‸tle', toggleHeading(1))).toBe('# Ti‸tle')
    expect(run('# Ti‸tle', toggleHeading(1))).toBe('Ti‸tle')
  })

  it('leaves a cursor at the start of an empty line after the marks', () => {
    expect(run('‸', toggleHeading(3))).toBe('### ‸')
  })
})

describe('toggleList', () => {
  it('numbers the lines it turns into a list, skipping blank ones', () => {
    expect(run('«one\n\ntwo»', toggleList('ordered'))).toBe('«1. one\n\n2. two»')
  })

  it('swaps one kind of list for another and keeps the indent', () => {
    expect(run('  - it‸em', toggleList('task'))).toBe('  - [ ] it‸em')
  })

  it('turns a list back into lines', () => {
    expect(run('«- a\n- b»', toggleList('bullet'))).toBe('«a\nb»')
  })
})

describe('toggleQuote', () => {
  it('quotes lines and unquotes them', () => {
    expect(run('«a\nb»', toggleQuote)).toBe('«> a\n> b»')
    expect(run('«> a\n>b»', toggleQuote)).toBe('«a\nb»')
  })
})

describe('insertLink', () => {
  it('selects the address to type over', () => {
    expect(run('see «docs»', insertLink)).toBe('see [docs](«url»)')
  })

  it('takes a selected address as the target', () => {
    expect(run('«https://a.dev»', insertLink)).toBe('[‸](https://a.dev)')
  })
})

describe('skillMarkdown', () => {
  it('reads front matter as one block and still continues a list on Enter below it', () => {
    expect(run('---\nname: x\n---\n- one‸', insertNewlineContinueMarkup)).toBe(
      '---\nname: x\n---\n- one\n- ‸',
    )
  })
})
