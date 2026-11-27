/**
 * Whether one output can meet two exact readings, worked out by code from the
 * readings alone where it can be sure (`bothHold`). Two rules that no output
 * can both meet are in conflict; a rule that no answer to a case can meet
 * beside one of its checks is left out of that case's score (`CannotHold` in
 * `sorting.ts`). `st sort` holds the assistant's word on both to this, and
 * code's stands wherever it gives one.
 *
 * Code compares two kinds of test, one of each reading, on the same part:
 * - Two `has` tests at `start` of a part that is one piece, looking for
 *   values the same way (both as words or both as characters, in the same
 *   case): one piece can start with both only when one value starts the
 *   other ("Ferry" and "Ferry 3.2"). Values drawn from a request are drawn
 *   from each case's request, as an output is answered.
 * - Two `count` tests of the same thing: their ranges meet ("at most 120
 *   words" beside "at least 100 words", or "exactly 120") or they do not
 *   ("at least 121").
 * Two tests of other places, other units or other kinds are nothing code
 * compares, so a reading made of them gets no answer, and the assistant's
 * word stands.
 *
 * "Cannot both hold" is said only where code is sure on every case: it holds
 * every kind of output the case may be and every set of the parts an output
 * may lack (a labelled line, another file), so a reading of an email that
 * opens with its subject line or with the line below it (`join: 'same'`) is
 * held both ways, and it says nothing where one reading reads a kind of output
 * the other does not, or where code may give no answer and Jev's would stand.
 * "Both hold" is said only where every test of both readings is in one such
 * comparison and one value, or one count, meets them all.
 *
 * Whether two rules apply to the same outputs at all is not in their
 * readings: `sameScope` and `everywhere` say where grading surely asks both.
 *
 * Pure.
 */
import { hasInPiece, lookedFor } from './exact.ts'
import type { Compare, ExactTest, Part, ReadOutput, RuleReading } from './rule-reading.ts'
import { headingOf, type Rule } from './rules.ts'

type Exact = Extract<RuleReading, { reading: 'exact' }>
type HasTest = Extract<ExactTest, { test: 'has' }>
type CountTest = Extract<ExactTest, { test: 'count' }>

/** One case's request, as code draws a reading's values from it. */
export interface Asked {
  /** The case's id. */
  case: string
  request: string
  /** The text files the request came with, by the name the agent gets each under. */
  files: Readonly<Record<string, string>>
  /** The kinds of output the case is graded on; null when it names no kind of file graded, so any. */
  kinds: readonly ReadOutput[] | null
}

/** What code worked out of two exact readings. */
export interface BothHold {
  /** Whether one output can meet both. */
  holds: boolean
  /** One test of each reading the answer rests on. */
  a: ExactTest
  b: ExactTest
  /**
   * For two `has` tests, the values each looked for, as drawn from the
   * request of `case`; null for two counts.
   */
  values: { a: string[]; b: string[] } | null
  /** The case those values were drawn from; null when both tests list their own, or count. */
  case: string | null
}

const KINDS: readonly ReadOutput[] = ['text', 'page', 'code']
const PAGE_ONLY: ReadonlySet<Part['part']> = new Set(['styles', 'elements', 'after'])
const NO_PAGE: ReadonlySet<Part['part']> = new Set(['line', 'lines'])
/** Parts an output may not have: the line asked for, the tag the text after is read from, another file. */
const MAY_LACK: ReadonlySet<Part['part']> = new Set(['line', 'after', 'other file'])
/** The most parts an output may lack that are held both ways: past it, code gives no answer. */
const LACKING_MAX = 8

/** A word, as the app counts one: a value with none is not looked for as words. */
const WORDISH = /[\p{L}\p{M}\p{N}]/u

/** Whether `test` reads an output of `kind` at all. */
function readsOn(test: ExactTest, kind: ReadOutput): boolean {
  if (test.test === 'measure') return kind === 'page'
  const { part } = test.read
  return kind === 'page' ? !NO_PAGE.has(part) : !PAGE_ONLY.has(part)
}

/** A part as one string, the same for two parts that read the same thing. */
function keyOf(part: Part): string {
  switch (part.part) {
    case 'text':
      return `text\n${part.skip ?? ''}`
    case 'line':
      return `line\n${part.label ?? ''}\n${part.number ?? ''}`
    case 'elements':
      return `elements\n${part.tag}\n${part.attribute ?? ''}\n${part.which}`
    case 'after':
      return `after\n${part.tag}`
    case 'other file':
      return `other file\n${part.path}`
    default:
      return part.part
  }
}

/** A part read as one piece: the file, its text, one line, its styles, the text after a tag, the first or the last of a tag. */
const onePiece = (part: Part): boolean =>
  part.part === 'elements' ? part.which !== 'every' : !['lines', 'other file'].includes(part.part)

// ---------------------------------------------------------------- one test beside another

/** The values each `has` test of a case looks for, drawn from its request; null where they are not there. */
type Drawn = ReadonlyMap<ExactTest, readonly string[] | null>

function drawnOn(tests: readonly ExactTest[], asked: Asked): Drawn {
  const drawn = new Map<ExactTest, readonly string[] | null>()
  for (const test of tests)
    if (test.test === 'has' || test.test === 'order') drawn.set(test, lookedFor(test.values, asked))
  return drawn
}

/** A `has` test code compares: at the start of a part that is one piece, for values it needs. */
const startTest = (test: ExactTest): test is HasTest =>
  test.test === 'has' && test.at === 'start' && test.need !== 'none' && onePiece(test.read)

/** A `count` test code compares: anything but the pieces of a part that is one piece, which is always one. */
const countTest = (test: ExactTest): test is CountTest =>
  test.test === 'count' && !(test.what === 'items' && onePiece(test.read))

const sameStart = (x: HasTest, y: HasTest): boolean =>
  keyOf(x.read) === keyOf(y.read) && x.match === y.match && x.case === y.case

const sameCount = (x: CountTest, y: CountTest): boolean =>
  keyOf(x.read) === keyOf(y.read) && x.what === y.what

/** The counts a test is met at, from `low` to `high`. */
const rangeOf = (compare: Compare, n: number): [number, number] =>
  compare === 'at most' ? [0, n] : compare === 'at least' ? [n, Infinity] : [n, n]

/**
 * The one piece among `values` that meets every test of `tests`, each with
 * the values it looks for. Where one piece meets them all, one of their
 * values does: the longest value it starts with, since every other starts
 * that one. Null when none does.
 */
function pieceMeeting(tests: ReadonlyArray<[HasTest, readonly string[]]>): string | null {
  const pieces = tests.flatMap(([, values]) => values)
  return pieces.find((piece) => tests.every(([t, v]) => hasInPiece(t, v, piece))) ?? null
}

/** Two tests no output can both meet, or null: two starts no piece can begin with both of, two counts whose ranges do not meet. */
function clashOf(x: ExactTest, y: ExactTest, drawn: Drawn): BothHold | null {
  if (countTest(x) && countTest(y)) {
    if (!sameCount(x, y)) return null
    const [xLow, xHigh] = rangeOf(x.compare, x.n)
    const [yLow, yHigh] = rangeOf(y.compare, y.n)
    return xLow > yHigh || yLow > xHigh
      ? { holds: false, a: x, b: y, values: null, case: null }
      : null
  }
  if (!startTest(x) || !startTest(y) || !sameStart(x, y)) return null
  const xValues = drawn.get(x)
  const yValues = drawn.get(y)
  if (!xValues || !yValues) return null
  // A test no piece of its own values meets is one that is never met: nothing to set beside another.
  if (!pieceMeeting([[x, xValues]]) || !pieceMeeting([[y, yValues]])) return null
  if (
    pieceMeeting([
      [x, xValues],
      [y, yValues],
    ]) !== null
  )
    return null
  return { holds: false, a: x, b: y, values: { a: [...xValues], b: [...yValues] }, case: null }
}

// ---------------------------------------------------------------- one reading on one output

/**
 * How a test is answered on an output: surely (`yes`); perhaps not, and then
 * set aside as not sure, which is never met (`aside`: a count ordinary ways
 * part on, a colour code written as a name); surely not, so Jev's answer
 * stands (`jev`: the part or the values are not there, or the test does not
 * read this kind); perhaps not, and then Jev's (`maybe jev`: a page not drawn).
 */
type Answered = 'yes' | 'aside' | 'jev' | 'maybe jev'

function answered(
  test: ExactTest,
  kind: ReadOutput,
  present: ReadonlySet<string>,
  drawn: Drawn,
): Answered {
  if (!readsOn(test, kind)) return 'jev'
  if (test.test === 'measure') return 'maybe jev'
  if (MAY_LACK.has(test.read.part) && !present.has(keyOf(test.read))) return 'jev'
  if (test.test === 'has' || test.test === 'order') {
    const values = drawn.get(test)
    if (!values) return 'jev'
    return test.match === 'words' && !values.some((v) => WORDISH.test(v)) ? 'jev' : 'yes'
  }
  if (test.test === 'count')
    return test.what === 'words' || test.what === 'characters' ? 'aside' : 'yes'
  return 'aside'
}

const toJev = (status: Answered): boolean => status === 'jev' || status === 'maybe jev'

/**
 * Whether code may give no answer on a reading where Jev's then stands
 * (`exact.ts` joins, `SETS_ASIDE` in `verdict.ts`): joined `all` or `any`,
 * when any test may be Jev's; joined `same`, when no test is surely answered
 * and one may be Jev's.
 */
function maybeJev(reading: Exact, status: readonly Answered[]): boolean {
  if (reading.join === 'same' && reading.tests.length > 1)
    return !status.includes('yes') && status.some(toJev)
  return status.some(toJev)
}

/**
 * The tests a reading needs met on one output where code answers it, as the
 * fewest that will do: every test, joined `all`; those surely answered, joined
 * `same`, or any one that may be when none surely is; any one, joined `any`.
 */
function needed(reading: Exact, status: readonly Answered[]): ExactTest[][] {
  const { tests } = reading
  if (reading.join === 'all' || tests.length === 1) return [tests]
  const sure = tests.filter((_, i) => status[i] === 'yes')
  const maybe = tests.filter((_, i) => status[i] === 'aside')
  if (reading.join === 'same') return sure.length ? [sure] : maybe.map((t) => [t])
  return [...sure, ...maybe].map((t) => [t])
}

/** The first two tests of `xs` and `ys` that no output can both meet; with `xs` as `ys`, two of one set. */
function firstClash(
  xs: readonly ExactTest[],
  ys: readonly ExactTest[],
  drawn: Drawn,
): BothHold | null {
  for (const [i, x] of xs.entries())
    for (const [j, y] of ys.entries()) {
      if (xs === ys && j <= i) continue
      const clash = clashOf(x, y, drawn)
      if (clash) return clash
    }
  return null
}

/** Every set of the parts in `keys` an output has. */
function* presences(keys: readonly string[]): Generator<ReadonlySet<string>> {
  for (let mask = 0; mask < 2 ** keys.length; mask++)
    yield new Set(keys.filter((_, i) => mask & (2 ** i)))
}

/**
 * On one case, whether no output of it can meet both readings, with the two
 * tests that rests on; or `unsure`. Every kind of output the case may be is
 * held, and every set of the parts an output may lack. It is unsure where one
 * reading reads a kind of output the other does not, where on some output code
 * may give no answer on either and Jev's would stand, and where some output may
 * meet both. Null where the case has no output both read.
 */
function clashOnCase(a: Exact, b: Exact, asked: Asked, drawn: Drawn): BothHold | 'unsure' | null {
  let clash: BothHold | null = null
  for (const kind of asked.kinds ?? KINDS) {
    const readsA = a.outputs.includes(kind)
    if (readsA !== b.outputs.includes(kind)) return 'unsure'
    if (!readsA) continue
    const lacking = [
      ...new Set(
        [...a.tests, ...b.tests].flatMap((t) =>
          t.test !== 'measure' && MAY_LACK.has(t.read.part) && readsOn(t, kind)
            ? [keyOf(t.read)]
            : [],
        ),
      ),
    ]
    if (lacking.length > LACKING_MAX) return 'unsure'
    for (const present of presences(lacking)) {
      const statusA = a.tests.map((t) => answered(t, kind, present, drawn))
      const statusB = b.tests.map((t) => answered(t, kind, present, drawn))
      if (maybeJev(a, statusA) || maybeJev(b, statusB)) return 'unsure'
      const ofA = needed(a, statusA).filter((tests) => !firstClash(tests, tests, drawn))
      const ofB = needed(b, statusB).filter((tests) => !firstClash(tests, tests, drawn))
      // Code answers both here, and one of them is never met: no output here meets both.
      if (!ofA.length || !ofB.length) continue
      for (const xs of ofA)
        for (const ys of ofB) {
          const found = firstClash(xs, ys, drawn)
          if (!found) return 'unsure'
          clash ??= found
        }
    }
  }
  return clash
}

/**
 * On one case: the comparison that shows one output meets both, where every
 * test of both readings is in it: starts of one part that one of their values
 * meets, or counts of one thing whose ranges all meet. Null otherwise.
 */
function heldOnCase(a: Exact, b: Exact, asked: Asked, drawn: Drawn): BothHold | null {
  const [x] = a.tests
  const [y] = b.tests
  const all = [...a.tests, ...b.tests]
  const kinds = (asked.kinds ?? KINDS).filter((k) => a.outputs.includes(k) && b.outputs.includes(k))
  if (!kinds.some((kind) => all.every((t) => readsOn(t, kind)))) return null
  if (countTest(x) && countTest(y) && all.every((t) => countTest(t) && sameCount(t, x))) {
    const ranges = (all as CountTest[]).map((t) => rangeOf(t.compare, t.n))
    const low = Math.max(...ranges.map((r) => r[0]))
    const high = Math.min(...ranges.map((r) => r[1]))
    return low <= high ? { holds: true, a: x, b: y, values: null, case: null } : null
  }
  if (!startTest(x) || !startTest(y) || !all.every((t) => startTest(t) && sameStart(t, x)))
    return null
  const tests = (all as HasTest[]).map((t): [HasTest, readonly string[] | null | undefined] => [
    t,
    drawn.get(t),
  ])
  if (tests.some(([, values]) => !values)) return null
  if (pieceMeeting(tests as Array<[HasTest, readonly string[]]>) === null) return null
  const values = { a: [...(drawn.get(x) ?? [])], b: [...(drawn.get(y) ?? [])] }
  return { holds: true, a: x, b: y, values, case: null }
}

/** Whether a test draws its values from the request, so what it looks for is the case's. */
const fromRequest = (test: ExactTest): boolean =>
  (test.test === 'has' || test.test === 'order') && test.values.from === 'request'

/**
 * Whether one output can meet both exact readings, over the cases `asked`:
 * no, where on every case with an output both read, no output can meet both;
 * yes, where on every such case code shows one can. Null where code cannot be
 * sure of either, and where the cases differ: then the assistant's word
 * stands. A rule is read over every case of the skill, a check over its own
 * case; with no case, values the readings list are compared alone, on any
 * kind of output.
 *
 * It reads the two readings alone. Whether the two rules apply to the same
 * outputs at all is the caller's to settle first (`sameScope`, `everywhere`).
 */
export function bothHold(a: Exact, b: Exact, asked: readonly Asked[]): BothHold | null {
  if (!KINDS.some((kind) => a.outputs.includes(kind) && b.outputs.includes(kind))) return null
  const cases: Asked[] = asked.length
    ? [...asked]
    : [{ case: '', request: '', files: {}, kinds: null }]
  let shared = 0
  let clashed: BothHold | null = null
  let clashes = 0
  let held: BothHold | null = null
  let holds = 0
  for (const one of cases) {
    const kinds = one.kinds ?? KINDS
    if (!kinds.some((kind) => a.outputs.includes(kind) && b.outputs.includes(kind))) continue
    shared += 1
    const drawn = drawnOn([...a.tests, ...b.tests], one)
    const where = (found: BothHold): BothHold => ({
      ...found,
      case: fromRequest(found.a) || fromRequest(found.b) ? one.case || null : null,
    })
    const shown = heldOnCase(a, b, one, drawn)
    if (shown) {
      holds += 1
      held ??= where(shown)
      continue
    }
    const clash = clashOnCase(a, b, one, drawn)
    if (clash && clash !== 'unsure') {
      clashes += 1
      clashed ??= where(clash)
    }
  }
  if (!shared) return null
  if (clashes === shared) return clashed
  return holds === shared ? held : null
}

// ---------------------------------------------------------------- where two rules apply

/**
 * Words by which a rule may set a condition of its own on where it applies,
 * which grading asks Jev of each rule ("does the rule come up?"): when, if,
 * unless and their like, and "for a ..." or "in an email". Read loosely, so a
 * rule that only might hold one is left to the assistant.
 */
const CONDITION =
  /\b(?:if|when|whenever|unless|while|whilst|where|wherever|except|otherwise|provided|whether)\b|\bfor (?:a|an|any|each|every|all|[a-z]+s)\b|\b(?:in|on) (?:a|an|any|each|every)\b/i

/** Whether a rule's own words may set a condition on where it applies. */
export const ownCondition = (rule: Pick<Rule, 'text'>): boolean => CONDITION.test(rule.text)

/**
 * Whether two rules surely apply to the same outputs, as grading decides it:
 * under the same heading of SKILL.md, or both above every heading, or both
 * listed in `bench.json` (grading asks of each heading once whether its rules
 * are for the work, so two rules under one heading apply together), and
 * neither with a condition of its own in its words.
 */
export const sameScope = (a: Rule, b: Rule): boolean =>
  a.section === b.section && !ownCondition(a) && !ownCondition(b)

/**
 * Whether a rule surely applies to every output, as grading decides it: no
 * heading it stands under, so grading asks no "does not apply" question of
 * it, and no condition of its own in its words. Only such a rule is held
 * beside a case's check: under a heading, whether it applies to the case is
 * Jev's answer at grading, which code cannot know when it sorts.
 */
export const everywhere = (rule: Rule): boolean => headingOf(rule) === null && !ownCondition(rule)
