/**
 * Best practice for a rule, as far as code can tell before any model is asked.
 * Three dimensions: the six principles a rule is written by (`RULE_GUIDE`),
 * how much the agent must hold to follow it (complexity), and how long the
 * rule and its file are (length). Each check is a word list or a count, so it
 * runs as the selection is made and costs nothing. What code cannot read,
 * such as whether a step is really a step, is left to the judge
 * (`improve.ts`). Pure data and functions.
 */
import { bulletsOf } from './rules.ts'
import { type SizeBand, sizeBand, textSize } from './size.ts'
import { type Principle, principleGuide } from './templates.ts'
import { LIST_MARKER, sentencesOf, tokens } from './text.ts'

export type Dimension = 'principle' | 'complexity' | 'length'

/** One thing wrong with the selection, as the writer reads it. */
export interface Finding {
  dimension: Dimension
  /** The principle at stake; null for a complexity or length finding. */
  principle: Principle | null
  /** The guide line it stands under, for the label over the message. */
  lead: string
  /** What is wrong, in one sentence a writer can act on. */
  message: string
  /** The words that set it off, when some did. */
  quote: string | null
  /** `code` found it by rule, `judge` by Jev's reading, `maybe` when Jev could not decide. */
  source: 'code' | 'judge' | 'maybe'
}

/** What the checks and the judge read: the selection and what stands around it. */
export interface RuleScene {
  /** The selected text, whole lines when it crossed a line. */
  selection: string
  /** Up to two bullets or lines above and below, so a rule is read in its place. */
  before: string
  after: string
  /** The skill's description, which says the one aspect it is about. */
  description: string
  /** How big the whole file is. A long file turns every action toward cutting. */
  band: SizeBand
}

/** Words that leave the boundary to the agent's judgment. */
const HEDGES = [
  'reasonably',
  'reasonable',
  'where appropriate',
  'as appropriate',
  'when appropriate',
  'if appropriate',
  'appropriately',
  'try to',
  'tries to',
  'tasteful',
  'tastefully',
  'generally',
  'as needed',
  'if possible',
  'where possible',
  'when possible',
  'should consider',
  'consider using',
  'aim for',
  'aim to',
  'ideally',
  'preferably',
  'as much as possible',
  'avoid where you can',
  'if you can',
  'sensible',
  'suitable',
  'relatively',
  'fairly',
  'somewhat',
  'a bit',
] as const

/** Qualities of a result. A rule made of these describes the outcome and leaves the step to guess. */
const OUTCOMES = [
  'clear',
  'clearly',
  'smooth',
  'smoothly',
  'concise',
  'good',
  'great',
  'well written',
  'well-written',
  'natural',
  'nice',
  'clean',
  'readable',
  'high quality',
  'high-quality',
  'professional',
  'polished',
  'elegant',
  'intuitive',
  'engaging',
  'compelling',
  'effective',
  'user-friendly',
  'easy to read',
  'easy to understand',
  'feel',
  'feels',
  'looks',
] as const

/**
 * The words of `OUTCOMES` that are also verbs a rule can open with: "Clear the
 * cache" and "Feel free to" are steps. Only these are passed over at the start
 * of a rule; "Concise answers only" and "Clearly state" open on the quality.
 */
const OPENING_VERBS = new Set<string>(['clear', 'clean', 'smooth', 'feel'])

/** A number, or a word that closes the boundary, an order among them: these make a rule checkable. */
const ANCHOR =
  /\d|\b(?:always|never|exactly|only|every|each|none|no|all|must|at most|at least|or fewer|or more|or less|under|over|within|maximum|minimum|once|twice|first|last|before|whole|same)\b/i

/** The reason follows one of these, or stands as a second sentence. */
const REASON =
  /\b(?:because|so that|so the|so a|so an|so it|so they|since|otherwise|which means|or else|or the|or a|or it)\b|: /i

/**
 * A line that tells the agent what a thing is. It knows. The subject is a
 * short noun phrase and what follows the verb names a thing ("A modal is a
 * dialog"), so an instruction in which "are" happens to follow its object
 * ("Read the code you are about to change") is not one.
 */
const DEFINITION =
  /^(?:\*\*)?(?:An? |The )?[A-Z][\w'-]*(?: [\w'/-]+){0,3}(?:\*\*)? (?:is|are|means|refers to|stands for|describes) (?:an? |the |one |what |how |when )/

/** Where one condition ends and the next begins. A list of things, "a, b and c", is not conditions. */
const CONDITION = /\b(?:or|unless|if|when|while|except|but|otherwise)\b/gi

/** The most conditions one rule holds before it is a tree written as prose. */
const CLAUSES_MAX = 4
/** Words per rule: worth a look past the first, a finding past the second. */
const WORDS_LONG = 40
const WORDS_OVER = 60
/** Under this, a selection has nothing for the checks to read. */
const WORDS_MIN = 4

const count = (text: string): number => tokens(text).length

export const wordCount = count

const sentences = (text: string): string[] => sentencesOf(text)

const quoteOf = (text: string, re: RegExp): string | null => re.exec(text)?.[0] ?? null

/** A rule's text without its list marker, each line's own. */
const unmarked = (text: string): string =>
  text
    .split('\n')
    .map((line) => line.replace(LIST_MARKER, ''))
    .join('\n')

const found = (
  dimension: Dimension,
  principle: Principle | null,
  message: string,
  quote: string | null = null,
  source: Finding['source'] = 'code',
): Finding => ({
  dimension,
  principle,
  lead: principle
    ? principleGuide(principle).lead
    : dimension === 'complexity'
      ? 'Keep each rule walkable.'
      : 'Keep it short.',
  message,
  quote,
  source,
})

/**
 * The rules in a selection: each top-level bullet with its indented lines, as
 * `scanRules` reads a SKILL.md. Prose, headings, numbered steps and code are
 * not rules, so they are not checked: a selection of prose has nothing to
 * find. `raw` keeps the indentation, `text` is one line.
 */
export function rulesIn(selection: string): Array<{ raw: string; text: string }> {
  return bulletsOf(selection.split('\n')).flatMap((bullet) => {
    const raw = bullet.lines.join('\n')
    const text = raw
      .replace(/^[-*]\s+/, '')
      .replace(/\n\s*(?:[-*+]|\d+[.)])?\s*/g, ' ')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
    return text ? [{ raw, text }] : []
  })
}

/** A word list as one pattern per entry, a space in an entry standing for any run of space. */
const wordPatterns = (list: readonly string[]): Array<[string, RegExp]> =>
  list.map((word) => [word, new RegExp(`\\b${word.replace(/ /g, '\\s+')}\\b`)])

const HEDGE_PATTERNS = wordPatterns(HEDGES)
const OUTCOME_PATTERNS = wordPatterns(OUTCOMES)

const firstMatch = (patterns: Array<[string, RegExp]>, text: string): string | null =>
  patterns.find(([, pattern]) => pattern.test(text))?.[0] ?? null

/** What the principles say of one rule: a hedge, an outcome, a missing reason, a definition. */
function principleFindings(text: string): Finding[] {
  const out: Finding[] = []
  // The rule is the first sentence; what follows is its why, which may name an outcome or a thing.
  const rule = sentences(text)[0] ?? text
  // A word in quotes is mentioned, not used: a rule that bans "reasonably" is not hedging.
  const lower = rule.toLowerCase().replace(/["“”][^"“”]*["“”]/g, ' ')

  // A hedge with no number or absolute anywhere in the rule leaves the boundary to the agent.
  // A bare rule with neither is left to the judge: code cannot tell a boundary from a habit.
  const hedge = firstMatch(HEDGE_PATTERNS, lower)
  if (hedge && !ANCHOR.test(text))
    out.push(
      found(
        'principle',
        'strict',
        `“${hedge}” leaves the line to the agent’s judgment. Put a number or an always or never in its place.`,
        hedge,
      ),
    )

  // A rule that opens on a verb names a step: "Clear the cache" is not a quality of the result.
  const opening = /^\s*([a-z]+)/.exec(lower)?.[1] ?? ''
  const read = OPENING_VERBS.has(opening) ? lower.replace(/^\s*[a-z]+/, ' ') : lower
  const outcome = firstMatch(OUTCOME_PATTERNS, read)
  if (outcome)
    out.push(
      found(
        'principle',
        'process',
        `“${outcome}” is a quality of the result. Say the step that gets there instead.`,
        outcome,
      ),
    )

  if (sentences(text).length < 2 && !REASON.test(text))
    out.push(
      found(
        'principle',
        'why',
        'The rule stands without its reason. Add what goes wrong without it, in the same bullet.',
      ),
    )

  if (DEFINITION.test(rule))
    out.push(
      found(
        'principle',
        'earns',
        'This line explains what something is. The agent knows; the line takes attention from the rules.',
        quoteOf(rule, /^[^.:]{0,48}/),
      ),
    )
  return out
}

/** How much one rule asks the agent to hold, and how long it is. */
function sizeFindings(raw: string, text: string, words: number): Finding[] {
  const out: Finding[] = []
  if (/\n(?:\t|\s{2,})\s*[-*+]\s/.test(raw))
    out.push(
      found(
        'complexity',
        null,
        'Nested bullets are not graded. Fold them into the rule, or make each a rule of its own.',
      ),
    )

  // The main clause and one more per condition word, so "or when" counts both.
  const rule = sentences(text)[0] ?? text
  const clauses = (rule.match(CONDITION) ?? []).length + 1
  if (clauses > CLAUSES_MAX)
    out.push(
      found(
        'complexity',
        null,
        `This rule holds ${clauses} conditions. Split them into a decision tree or numbered steps, so the agent takes one branch at a time.`,
      ),
    )

  if (words > WORDS_OVER)
    out.push(
      found(
        'length',
        null,
        `${words} words. A rule and its why fit in two sentences; past that the agent skims.`,
      ),
    )
  else if (words > WORDS_LONG)
    out.push(found('length', null, `${words} words. Cut every word that changes nothing.`))
  return out
}

/** The findings of one rule. */
function checkUnit(unit: { raw: string; text: string }): Finding[] {
  const words = count(unit.text)
  if (words < WORDS_MIN) return []
  return [...principleFindings(unit.text), ...sizeFindings(unit.raw, unit.text, words)]
}

/** What a long or oversized file means for the selection. */
const FILE_FINDING: Record<Exclude<SizeBand, 'fine'>, string> = {
  long: 'The file is long. Anything that is background, not a rule, belongs in a reference file.',
  over: 'The file is past the guide of 500 lines or 5,000 tokens. Nothing in it may get longer.',
}

/** Every finding code can make about the selection in its file. */
export function lintScene(scene: RuleScene): Finding[] {
  const findings = rulesIn(scene.selection).flatMap(checkUnit)
  if (scene.band !== 'fine') findings.push(found('length', null, FILE_FINDING[scene.band]))
  return findings
}

/** Whether the selection has enough in it to check: four words or more, a list marker not counted. */
export const worthChecking = (selection: string): boolean => count(unmarked(selection)) >= WORDS_MIN

/** Lines around `from`..`to` in `text`, up to `n` non-blank lines on the side asked for. */
function linesAround(text: string, at: number, n: number, side: 'before' | 'after'): string {
  const part = side === 'before' ? text.slice(0, at) : text.slice(at)
  const lines = part.split('\n').filter((line) => line.trim())
  const picked = side === 'before' ? lines.slice(-n) : lines.slice(0, n)
  return picked.join('\n')
}

/**
 * A selection of `text` as the checks and the judge read it. The selection is
 * widened to whole lines: a rule is a line, and a fragment has no why or
 * boundary to check, so judging or rewriting one would break the sentence it
 * sits in. `before` and `after` are the lines around it.
 */
export function sceneOf(
  text: string,
  range: { from: number; to: number },
  description: string,
): RuleScene & { from: number; to: number } {
  let { from, to } = range
  // A drag often takes the newline that closes the last line: that is not a line of its own.
  while (to > from && text[to - 1] === '\n') to -= 1
  from = text.lastIndexOf('\n', from - 1) + 1
  const end = text.indexOf('\n', to)
  to = end === -1 ? text.length : end
  return {
    selection: text.slice(from, to),
    before: linesAround(text, from, 2, 'before'),
    after: linesAround(text, to, 2, 'after'),
    description,
    band: sizeBand(textSize(text).level),
    from,
    to,
  }
}
