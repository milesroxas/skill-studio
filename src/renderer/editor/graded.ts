/**
 * The judge's reading of SKILL.md, drawn on the bullets it reads. A graded
 * rule's number takes the place of its bullet, "01", "02", in the order
 * Scoring lists them, hanging in the margin so the text keeps its edge; a
 * bullet the judge skips keeps its dot and says why to the pointer that rests
 * on it. The number turns amber when the writing checks find something in
 * the rule, the words that set a check off are underlined and say why when
 * pointed at, and while the cursor is in the rule its findings stand under it. A click on the number
 * selects the rule, so the popout opens with nothing to select by hand.
 * Nothing is drawn for bench.json rules, which do not come from the bullets.
 */

import { type EditorState, type Extension, Facet, type Range, StateField } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import { type Finding, lintScene, sceneOf } from '@domain/lint.ts'
import { type SkippedBullet, scanRules } from '@domain/rules.ts'

/** The skill's description, which the checks read a rule against. */
const description = Facet.define<string, string>({ combine: (values) => values[0] ?? '' })
/** Markdown view: the source mark stays, so the number hangs before it. Formatted: the live preview puts the number in the mark's place. */
const hanging = Facet.define<boolean, boolean>({ combine: (values) => values[0] ?? false })

/** One rule's place in the document and what the checks made of it. */
export interface GradedRule {
  from: number
  to: number
  label: string
  findings: Finding[]
}

interface Graded {
  rules: GradedRule[]
  skipped: SkippedBullet[]
}

/** Why a bullet is not a rule, for the pointer that rests on it. */
const SKIPPED: Record<SkippedBullet['reason'], string> = {
  short: 'Not checked: under four words. A rule is a top-level bullet of four words or more.',
  link: 'Not checked: a link only. Say what to do with it in the same bullet.',
}

const label = (index: number): string => String(index + 1).padStart(2, '0')

function read(state: EditorState): Graded {
  const doc = state.doc
  const text = doc.toString()
  const about = state.facet(description)
  const scan = scanRules(text)
  const rules = scan.spans.map((span, i) => {
    const from = doc.line(span.from).from
    const to = doc.line(span.to).to
    // The file's own length is a finding about the file, not about this rule.
    const scene = { ...sceneOf(text, { from, to }, about), band: 'fine' as const }
    return { from, to, label: label(i), findings: lintScene(scene) }
  })
  return { rules, skipped: scan.skipped }
}

const field = StateField.define<Graded>({
  create: read,
  update: (graded, tr) =>
    tr.docChanged || tr.startState.facet(description) !== tr.state.facet(description)
      ? read(tr.state)
      : graded,
})

/** The rule's number, standing in for its bullet or hanging before the source mark. */
class RuleNumber extends WidgetType {
  constructor(
    readonly label: string,
    readonly flagged: boolean,
    readonly hanging: boolean,
  ) {
    super()
  }
  eq(other: RuleNumber) {
    return (
      other.label === this.label && other.flagged === this.flagged && other.hanging === this.hanging
    )
  }
  toDOM() {
    const number = document.createElement('span')
    number.className = `cm-md-rulenum${this.flagged ? ' cm-md-flagged' : ''}${this.hanging ? ' cm-md-hanging' : ''}`
    number.textContent = this.label
    number.title = this.flagged
      ? `Rule ${this.label}: the writing checks found something. Click to select it.`
      : `Rule ${this.label}. Click to select it.`
    return number
  }
  ignoreEvent() {
    return false
  }
}

/** What the checks found in the rule the cursor is in, under the rule. */
class Findings extends WidgetType {
  constructor(readonly findings: Finding[]) {
    super()
  }
  eq(other: Findings) {
    return (
      other.findings.length === this.findings.length &&
      other.findings.every((f, i) => f.message === this.findings[i].message)
    )
  }
  toDOM() {
    const box = document.createElement('div')
    box.className = 'cm-md-findings'
    box.setAttribute('role', 'note')
    for (const finding of this.findings) {
      const line = document.createElement('div')
      const lead = document.createElement('b')
      lead.textContent = finding.lead
      line.append(lead, ` ${finding.message}`)
      box.append(line)
    }
    return box
  }
}

const skippedLine = (reason: SkippedBullet['reason']) =>
  Decoration.line({ class: 'cm-md-skipped', attributes: { title: SKIPPED[reason] } })
/** The words that set a check off, underlined, with the finding for the pointer that rests on them. */
const flagWord = (finding: Finding) =>
  Decoration.mark({
    class: 'cm-md-flag',
    attributes: { title: `${finding.lead} ${finding.message}` },
  })

const decorations = EditorView.decorations.compute([field, hanging, 'selection'], (state) => {
  const { rules, skipped } = state.field(field)
  const hang = state.facet(hanging)
  const head = state.selection.main.head
  const out: Range<Decoration>[] = []
  for (const bullet of skipped)
    out.push(skippedLine(bullet.reason).range(state.doc.line(bullet.line).from))
  for (const rule of rules) {
    const flagged = rule.findings.length > 0
    if (hang)
      out.push(
        Decoration.widget({ widget: new RuleNumber(rule.label, flagged, true), side: -1 }).range(
          rule.from,
        ),
      )
    const text = state.doc.sliceString(rule.from, rule.to).toLowerCase()
    for (const finding of rule.findings) {
      if (!finding.quote) continue
      const at = text.indexOf(finding.quote.toLowerCase())
      if (at >= 0)
        out.push(flagWord(finding).range(rule.from + at, rule.from + at + finding.quote.length))
    }
    if (flagged && head >= rule.from && head <= rule.to)
      out.push(
        Decoration.widget({ widget: new Findings(rule.findings), block: true, side: 1 }).range(
          rule.to,
        ),
      )
  }
  return Decoration.set(out, true)
})

/** The rule whose lines hold `pos`, or null when the position is prose. */
export function ruleAt(state: EditorState, pos: number): GradedRule | null {
  const graded = state.field(field, false)
  return graded?.rules.find((r) => pos >= r.from && pos <= r.to) ?? null
}

/** The number to draw in place of the bullet on the line at `lineFrom`, or null when it is not a rule. */
export function ruleBulletAt(state: EditorState, lineFrom: number): Decoration | null {
  const rule = state.field(field, false)?.rules.find((r) => r.from === lineFrom)
  if (!rule) return null
  return Decoration.replace({ widget: new RuleNumber(rule.label, rule.findings.length > 0, false) })
}

/** Number and mark the graded rules of a SKILL.md described by `about`. */
export const gradedRules = (about: string, hang: boolean): Extension => [
  field,
  decorations,
  description.of(about),
  hanging.of(hang),
]
