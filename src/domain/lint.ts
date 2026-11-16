/**
 * Best practice for a rule, as far as code can tell before any model is asked.
 * Four dimensions: the six principles a rule is written by (`RULE_GUIDE`),
 * how much the agent must hold to follow it (complexity), the words in it
 * that do no work (length), and how long its file is (file). Each check is a
 * word list or a count, so it runs as the selection is made and costs nothing.
 * What code cannot read, such as whether a step is really a step, is left to
 * the judge (`improve.ts`). Pure data and functions.
 *
 * A rule has no word limit. Anthropic's guide to writing skills sets one for
 * the file alone (500 lines) and asks of each piece whether it earns what it
 * costs, so a rule may run as long as what it says needs. Every finding names
 * something the writer can change, and changing it clears the finding: a
 * count of words did neither.
 */
import { bulletsOf } from './rules.ts'
import { type SizeBand, sizeBand, textSize } from './size.ts'
import { type Principle, principleGuide } from './templates.ts'
import { LIST_MARKER, sentencesOf, tokens } from './text.ts'

export type Dimension = 'principle' | 'complexity' | 'length' | 'file'

/** One thing wrong with the selection, as the writer reads it. */
export interface Finding {
  dimension: Dimension
  /** The principle at stake; null for a complexity, length or file finding. */
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

/**
 * What answers a hedge, so that code leaves the rule to Jev. A measure answers
 * any hedge: a number in figures or words, or a phrase that bounds one. An
 * absolute answers only a hedge about effort or scope ("where possible",
 * "try to"): "always reasonably short" is still no length, so a hedge about
 * how much (`DEGREE`) needs a measure. A word that only counts over things,
 * "each" or "every", answers neither: "keep each paragraph reasonably short"
 * says how many paragraphs and not how short.
 */
const MEASURE =
  /\d|\b(?:two|three|four|five|six|seven|eight|nine|ten|twelve|zero|single|at most|at least|or fewer|or more|or less|maximum|minimum|once|twice)\b/i
const ABSOLUTE = /\b(?:always|never|exactly|only|must|none)\b/i

/** Hedges about how much of something. */
const DEGREE = new Set<string>([
  'reasonably',
  'reasonable',
  'tasteful',
  'tastefully',
  'appropriately',
  'sensible',
  'suitable',
  'relatively',
  'fairly',
  'somewhat',
  'a bit',
])

/** The reason follows one of these, a comma and "so", or a colon, or stands as a second sentence. */
const REASON =
  /\b(?:because|so that|so the|so a|so an|so it|so they|since|otherwise|which means|or else|or the|or a|or it)\b|, so\b|: /i

/**
 * A line that tells the agent what a thing is. It knows. The subject is a
 * short noun phrase and what follows the verb names a thing ("A modal is a
 * dialog"), so an instruction in which "are" happens to follow its object
 * ("Read the code you are about to change") is not one.
 */
const DEFINITION =
  /^(?:\*\*)?(?:An? |The )?[A-Z][\w'-]*(?: [\w'/-]+){0,3}(?:\*\*)? (?:is|are|means|refers to|stands for|describes) (?:an? |the |one |what |how |when )/

/**
 * Phrases that add words and change nothing the agent does: the rule reads
 * the same with each one cut. Only ones that can go without a second look, so
 * a word that sometimes carries the rule is not here: "just" and "very" can,
 * "feel free to" grants a leave, and "note that" is also a note that opens.
 * The longer phrase stands before the one it holds.
 */
const FILLERS = [
  'due to the fact that',
  'the fact that',
  'in order to',
  'for the purpose of',
  'it is important to',
  'it is important that',
  'it’s important to',
  'it’s important that',
  "it's important to",
  "it's important that",
  'make sure to',
  'make sure that',
  'be sure to',
  'please note that',
  'keep in mind that',
  'keep in mind',
  'remember to',
  'remember that',
  'needless to say',
  'as you know',
  'when it comes to',
  'with regard to',
  'please',
  'basically',
  'essentially',
  'actually',
] as const

/**
 * Several words where one exact word says the same: each phrase with the word
 * to use in its place. Only pairs that mean the same thing every time, so the
 * swap never changes the rule. The longer phrase stands before the one it holds.
 */
const WORDY: ReadonlyArray<readonly [string, string]> = [
  ['in spite of the fact that', 'although'],
  ['until such time as', 'until'],
  ['at this point in time', 'now'],
  ['has the ability to', 'can'],
  ['have the ability to', 'can'],
  ['is able to', 'can'],
  ['are able to', 'can'],
  ['in the event that', 'if'],
  ['for the reason that', 'because'],
  ['with the exception of', 'except'],
  ['in close proximity to', 'near'],
  ['the majority of', 'most'],
  ['each and every', 'every'],
  ['any and all', 'all'],
  ['first and foremost', 'first'],
  ['whether or not', 'whether'],
  ['as a means of', 'to'],
  ['so as to', 'to'],
  ['prior to', 'before'],
  ['subsequent to', 'after'],
  ['utilize', 'use'],
  ['utilizes', 'uses'],
]

/**
 * Where a rule's own sentence turns to its why. Narrower than `REASON`: a
 * colon may open the list of things asked, and "or a" may be its last item.
 */
const WHY_FOLLOWS = /\b(?:because|so that|since|which means)\b|, so\b/i

/** Where one condition ends and the next begins. A list of things, "a, b and c", is not conditions. */
const CONDITION = /\b(?:or|unless|if|when|while|except|but|otherwise)\b/gi

/** The most conditions one rule holds before it is a tree written as prose. */
const CLAUSES_MAX = 4
/**
 * Where one thing to mark ends and the next begins: a list's commas and its
 * last and, or or nor. A comma in a number is none, and neither is the or of
 * a bound, "300ms or less".
 */
const PART = /,(?!\d)|;|\b(?:and|nor)\b|\bor\b(?! (?:less|more|fewer|under|over|later|earlier)\b)/i
/**
 * The most things one rule asks for before Jev's one answer stops saying which
 * was missed. Four is a list a reader checks at a glance: "a doctype, a lang,
 * a title and a viewport meta".
 */
const PARTS_MAX = 4
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
      : 'Cut what changes nothing.',
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
      .replace(/^\s*[-*]\s+/, '')
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
const FILLER_PATTERNS = wordPatterns(FILLERS)
const WORDY_PATTERNS = wordPatterns(WORDY.map(([phrase]) => phrase))
const exactFor = (phrase: string): string => WORDY.find(([wordy]) => wordy === phrase)?.[1] ?? ''

/**
 * `text` in lower case with what stands in quotes or in a code span taken out:
 * a quoted word is mentioned, not used. A single quote opens only where no
 * letter stands before it, so the apostrophe of "don't" opens nothing.
 */
const used = (text: string): string =>
  text.toLowerCase().replace(/["“”][^"“”]*["“”]|`[^`]*`|‘[^‘’]*’|(?<![\w'])'[^']*'(?!\w)/g, ' ')

const firstMatch = (patterns: Array<[string, RegExp]>, text: string): string | null =>
  patterns.find(([, pattern]) => pattern.test(text))?.[0] ?? null

/** What the principles say of one rule: a hedge, an outcome, a missing reason, a definition. */
function principleFindings(text: string): Finding[] {
  const out: Finding[] = []
  // The rule is the first sentence; what follows is its why, which may name an outcome or a thing.
  const rule = sentences(text)[0] ?? text
  // A word in quotes is mentioned, not used: a rule that bans "reasonably" is not hedging.
  const lower = used(rule)

  // A hedge nothing in the bullet answers leaves the boundary to the agent: the first such one
  // is the finding. A bare rule with no hedge is left to the judge: code cannot tell a boundary
  // from a habit.
  const measured = MEASURE.test(text)
  const absolute = ABSOLUTE.test(text)
  const hedge =
    HEDGE_PATTERNS.find(
      ([word, pattern]) => pattern.test(lower) && !measured && !(absolute && !DEGREE.has(word)),
    )?.[0] ?? null
  if (hedge)
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

/** How much one rule asks the agent to hold, and the words in it that do no work. */
function sizeFindings(raw: string, text: string): Finding[] {
  const out: Finding[] = []
  if (/\n(?:\t|\s{2,})\s*[-*+]\s/.test(raw))
    out.push(
      found(
        'complexity',
        null,
        'Nested bullets are not graded. Fold them into the rule, or make each a rule of its own.',
      ),
    )

  // What the rule asks, without the why that follows it in the same sentence: a reason's own
  // commas and conditions are not things asked. Then the main clause and one more per condition
  // word, so "or when" counts both.
  // A rule that opens with its why has nothing before it: then the whole sentence is counted.
  const sentence = sentences(text)[0] ?? text
  const rule = sentence.split(WHY_FOLLOWS)[0]?.trim() || sentence
  const clauses = (rule.match(CONDITION) ?? []).length + 1
  if (clauses > CLAUSES_MAX)
    out.push(
      found(
        'complexity',
        null,
        `This rule holds ${clauses} conditions. Split them into a decision tree or numbered steps, so the agent takes one branch at a time.`,
      ),
    )
  // "9:41, full signal and a full battery, with no notifications, cursor or scrollbars" is six facts and one answer.
  else if (rule.split(PART).filter((part) => part.trim()).length > PARTS_MAX)
    out.push(
      found(
        'complexity',
        null,
        'This rule asks for several things, and Jev marks them with one answer. Make each a rule of its own to see which one an output missed.',
      ),
    )

  // Anywhere in the bullet, the why included: a filler phrase does no more work there.
  // Read from the bullet as written, where a word the rule only names still stands in its code span.
  const words = used(raw)
  const filler = firstMatch(FILLER_PATTERNS, words)
  if (filler)
    out.push(found('length', null, `“${filler}” adds words and changes nothing. Cut it.`, filler))
  const wordy = firstMatch(WORDY_PATTERNS, words)
  if (wordy)
    out.push(
      found(
        'length',
        null,
        `“${wordy}” says “${exactFor(wordy)}” in more words. Use the one word.`,
        wordy,
      ),
    )
  return out
}

/** The findings of one rule. */
function checkUnit(unit: { raw: string; text: string }): Finding[] {
  const words = count(unit.text)
  if (words < WORDS_MIN) return []
  return [...principleFindings(unit.text), ...sizeFindings(unit.raw, unit.text)]
}

/** What a long or oversized file means for the selection. */
const FILE_FINDING: Record<Exclude<SizeBand, 'fine'>, string> = {
  long: 'The file is long. Anything that is background, not a rule, belongs in a reference file.',
  over: 'The file is past the guide of 500 lines or 5,000 tokens. Nothing in it may get longer.',
}

/** Every finding code can make about the selection in its file. */
export function lintScene(scene: RuleScene): Finding[] {
  const findings = lintRule(scene.selection)
  if (scene.band !== 'fine') findings.push(found('file', null, FILE_FINDING[scene.band]))
  return findings
}

/**
 * What the checks find in one rule, by its text alone: what its number in the
 * margin and the words underlined in it are drawn from. The file's size is a
 * finding about the file, so it is not among them.
 */
export const lintRule = (selection: string): Finding[] => rulesIn(selection).flatMap(checkUnit)

/** The words of a passage as a reader counts them: its list marks are not words. */
export const proseWords = (text: string): number => count(unmarked(text))

/** How many graded rules `text` holds: one for a rule, more once it is split. */
export const ruleCount = (text: string): number => rulesIn(text).length

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
