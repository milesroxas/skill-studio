/**
 * Jev's reading of SKILL.md, drawn on the bullets it reads. A graded
 * rule's number takes the place of its bullet, "01", "02", in the order
 * they stand in the file, hanging in the margin so the text keeps its edge; a
 * bullet Jev skips keeps its dot and says why to the pointer that rests
 * on it. The number turns amber when the writing checks find something in
 * the rule, and the words that set a check off are underlined: the pointer
 * resting on them opens the popout on the rule, with what they set off. A
 * click on the number selects the rule, so the popout opens with nothing to
 * select by hand.
 * Nothing is drawn for bench.json rules, which do not come from the bullets.
 */

import {
  type EditorState,
  type Extension,
  Facet,
  type Range,
  StateEffect,
  StateField,
} from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view'
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
  repeat: 'Not checked: the same as a rule above. A rule written twice counts once.',
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
  override eq(other: RuleNumber) {
    return (
      other.label === this.label && other.flagged === this.flagged && other.hanging === this.hanging
    )
  }
  override toDOM() {
    const number = document.createElement('span')
    number.className = `cm-md-rulenum${this.flagged ? ' cm-md-flagged' : ''}${this.hanging ? ' cm-md-hanging' : ''}`
    number.textContent = this.label
    number.title = this.flagged
      ? `Rule ${this.label}: the writing checks found something. Click to select it.`
      : `Rule ${this.label}. Click to select it.`
    return number
  }
  override ignoreEvent() {
    return false
  }
}

const skippedLine = (reason: SkippedBullet['reason']) =>
  Decoration.line({ class: 'cm-md-skipped', attributes: { title: SKIPPED[reason] } })

/** Words in a rule that set a check off, and the findings they set off. */
export interface Flag {
  from: number
  to: number
  findings: Finding[]
}

/** Where each finding's quote stands in its rule. Findings that quote the same words share a flag. */
function flagsOf(state: EditorState, rule: GradedRule): Flag[] {
  const text = state.doc.sliceString(rule.from, rule.to).toLowerCase()
  const flags: Flag[] = []
  for (const finding of rule.findings) {
    if (!finding.quote) continue
    const at = text.indexOf(finding.quote.toLowerCase())
    if (at < 0) continue
    const from = rule.from + at
    const to = from + finding.quote.length
    const same = flags.find((f) => f.from === from && f.to === to)
    if (same) same.findings.push(finding)
    else flags.push({ from, to, findings: [finding] })
  }
  return flags
}

/** The flag that holds `pos`, or null when no flagged word stands there. */
function flagAt(state: EditorState, pos: number): Flag | null {
  const rule = ruleAt(state, pos)
  return rule ? (flagsOf(state, rule).find((f) => pos >= f.from && pos < f.to) ?? null) : null
}

/** The flag whose popout is open: the pointer rests on its words or on the popout. */
const point = StateEffect.define<Flag | null>()
const pointed = StateField.define<Flag | null>({
  create: () => null,
  update: (flag, tr) => {
    for (const effect of tr.effects) if (effect.is(point)) return effect.value
    // The words under it changed: what the popout says may no longer hold.
    return tr.docChanged ? null : flag
  },
})

/** The flag whose popout is open, for the editor to draw the popout beside. */
export const pointedFlag = (state: EditorState): Flag | null => state.field(pointed, false) ?? null

/** The beat a passing pointer gets before a popout opens, and before one goes: `HoverCard`'s delays. */
const OPEN_MS = 150
const CLOSE_MS = 120

/**
 * Opens a flag's popout once the pointer rests on its words, and puts it away
 * once the pointer has left both the words and the popout. With one open, the
 * next word's opens at once: the reader is already reading them.
 */
class Pointing {
  private timer: ReturnType<typeof setTimeout> | undefined
  /** The pointer is on the popout. Leaving the text does not close it then, whichever event comes first. */
  private held = false
  constructor(private readonly view: EditorView) {
    window.addEventListener('scroll', this.away, { capture: true, passive: true })
  }
  aim(flag: Flag | null) {
    if (this.held && !flag) return
    clearTimeout(this.timer)
    const now = pointedFlag(this.view.state)
    if (now?.from === flag?.from && now?.to === flag?.to) return
    const wait = flag ? (now ? 0 : OPEN_MS) : CLOSE_MS
    this.timer = setTimeout(() => this.view.dispatch({ effects: point.of(flag) }), wait)
  }
  hold() {
    // A popout already fading out is not held open again.
    if (!pointedFlag(this.view.state)) return
    this.held = true
    clearTimeout(this.timer)
  }
  release() {
    this.held = false
    this.aim(null)
  }
  update() {
    // A popout gone by any way leaves nothing to hold.
    if (!pointedFlag(this.view.state)) this.held = false
  }
  /** Gone now: the page moved under the popout, or the reader dismissed it. */
  readonly away = () => {
    clearTimeout(this.timer)
    this.held = false
    if (pointedFlag(this.view.state)) this.view.dispatch({ effects: point.of(null) })
  }
  destroy() {
    clearTimeout(this.timer)
    window.removeEventListener('scroll', this.away, { capture: true })
  }
}

const pointing = ViewPlugin.fromClass(Pointing, {
  eventHandlers: {
    mousemove(event, view) {
      const words = (event.target as HTMLElement).closest?.('.cm-md-flag')
      this.aim(words ? flagAt(view.state, view.posAtDOM(words)) : null)
    },
    mouseleave() {
      this.aim(null)
    },
  },
})

/** The pointer is on the popout: keep it open. */
export const holdFlag = (view: EditorView) => view.plugin(pointing)?.hold()
/** The pointer left the popout: put it away after the beat. */
export const releaseFlag = (view: EditorView) => view.plugin(pointing)?.release()
/** Put the popout away now: Escape, or a press elsewhere. */
export const dismissFlag = (view: EditorView) => view.plugin(pointing)?.away()

/** The words that set a check off, underlined; lit while their popout is open. */
const flagWords = Decoration.mark({ class: 'cm-md-flag' })
const flagWordsPointed = Decoration.mark({ class: 'cm-md-flag cm-md-pointed' })

const decorations = EditorView.decorations.compute([field, hanging, pointed], (state) => {
  const { rules, skipped } = state.field(field)
  const hang = state.facet(hanging)
  const open = state.field(pointed)
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
    for (const flag of flagsOf(state, rule)) {
      const lit = open?.from === flag.from && open.to === flag.to
      out.push((lit ? flagWordsPointed : flagWords).range(flag.from, flag.to))
    }
  }
  return Decoration.set(out, true)
})

/** What the checks found in the rule that holds `from`..`to`; nothing when the range is prose or crosses rules. */
export function findingsWithin(state: EditorState, from: number, to: number): Finding[] {
  const rule = ruleAt(state, from)
  return rule && to <= rule.to ? rule.findings : []
}

/** The rule whose lines hold `pos`, or null when the position is prose. */
export function ruleAt(state: EditorState, pos: number): GradedRule | null {
  const graded = state.field(field, false)
  return graded?.rules.find((r) => pos >= r.from && pos <= r.to) ?? null
}

/** The number of the rule that holds all of `from`..`to`, such as `04`; null for prose or a range across rules. */
export function ruleNumberOf(
  state: EditorState,
  range: { from: number; to: number },
): string | null {
  const rule = ruleAt(state, range.from)
  return rule && range.to <= rule.to ? rule.label : null
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
  pointed,
  pointing,
  decorations,
  description.of(about),
  hanging.of(hang),
]
