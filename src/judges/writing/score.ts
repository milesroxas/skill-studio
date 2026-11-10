/**
 * The writing pack's pure half: lint, shape, structure, substance, tone and
 * grounding from stored answers. A port of the reference skill's
 * bench-core.mjs, so a run graded here scores as it did there. Thresholds and
 * weights come from the config; nothing here asks Jev.
 */
import type { PackScore, PackScoring, ScoreSubject } from '@domain/pack.ts'
import type { BenchConfig } from '@domain/schemas.ts'
import { certainty, mean, weighted } from '@domain/stats.ts'
import { finding } from '@domain/verdict.ts'
import type { ShapeMeasures } from './shape.ts'

type Band = [number, number]

/** The config an active writing pack sees: domain/config.ts lays the defaults below under bench.json. */
export type WritingConfig = BenchConfig & {
  writingKind: string
  lint: { command: string | null; timeoutSeconds: number }
  warningCost: number
  structure: {
    opening: number
    point: number
    ending: number
    title: number
    pointerCredit: number
  }
  substance: { specificity: number; decision: number; setback: number; aiSplit: number }
  groundingPrior: number
  contradictionCap: number
  bands: Record<string, Band>
  writer: string | null
  borrowed: string[]
}

const WRITING_LAYERS = ['lint', 'shape', 'structure', 'substance', 'tone', 'grounding']

/** Layers each kind is scored on. A layer that does not apply is left out and the rest rescale. */
const KIND_LAYERS: Record<string, string[]> = {
  article: WRITING_LAYERS,
  linkedinPost: ['lint', 'structure', 'substance', 'tone', 'grounding'],
  coverLetter: ['lint', 'structure', 'substance', 'tone', 'grounding'],
  youtubeScript: ['lint', 'structure', 'substance', 'tone', 'grounding'],
}
const DEFAULT_KIND_LAYERS = ['lint', 'substance', 'tone', 'grounding']

export interface LintRaw {
  /** The command that produced the findings, or null for the fallback lint. */
  command: string | null
  errors: number
  errorExcerpts: string[]
  warnings: string[]
  info: number
  /** Set when the command could not run or printed no findings JSON. */
  failed: string | null
}

export interface UnitAnswer {
  text: string
  list: boolean
  /** 0 to 1: general to concrete. */
  specificity: number
  /** 0 to 1: plain to selling. */
  selling: number
  decision: number
  setback: number
  aiDidWork: number | null
  aiSplit: number | null
}

type GroundingVerdict = 'supported' | 'contradicted' | 'missing' | 'no_facts'

export interface ClaimVerdict {
  claim: string
  before: string | null
  verdict: GroundingVerdict
  /** The literal second check, asked only after `contradicted`. */
  conflict: number | null
  confidence: number
  evidence: string[]
}

export interface WritingJev {
  opensOnWork: number
  pointEarly: number
  ending: string
  endingBefore: string | null
  endingProbabilities: Record<string, number>
  title: string | null
  aiBuilt: boolean
  aiMentioned: boolean
  grounding: { verdicts: ClaimVerdict[] } | null
  perUnit: UnitAnswer[]
}

export interface WritingRaw {
  kind: string
  lint: LintRaw | null
  shape: ShapeMeasures | null
  borrowed: string[]
  hasEvidence: boolean
  jev: WritingJev | null
}

interface WritingDerived {
  ending: string
  opensOnWork: boolean
  pointEarly: boolean
  title: string | null
  specificity: number | null
  selling: number | null
  decisions: number
  setbacks: number
  aiWork: number
  aiSplitShare: number | null
  aiUnmentioned: boolean
  graded: boolean
  verdicts: Array<ClaimVerdict & { final: GroundingVerdict }>
  factual: number
  supported: number
  contradicted: ClaimVerdict[]
  missing: ClaimVerdict[]
  share: number
}

const inBand = (value: number | null | undefined, [low, high]: Band): boolean =>
  value !== null && value !== undefined && value >= low && value <= high

function shapeScore(shape: ShapeMeasures, config: WritingConfig): number {
  const checks = Object.entries(config.bands).map(([key, band]) =>
    inBand(shape.measures[key], band),
  )
  checks.push(shape.questionHeadings === 0 && shape.longHeadings === 0)
  return checks.filter(Boolean).length / checks.length
}

/** Counts and verdicts that depend on the thresholds, from Jev's raw answers. */
function deriveWriting(jev: WritingJev | null, config: WritingConfig): WritingDerived | null {
  if (!jev) return null
  const { yes } = config
  const units = jev.perUnit
  const aiUnits = units.filter((u) => u.aiDidWork !== null && u.aiDidWork >= yes)
  const ending =
    jev.ending === 'pointer' && jev.endingBefore === 'implication' ? 'implication' : jev.ending
  const verdicts: WritingDerived['verdicts'] = (jev.grounding?.verdicts ?? []).map((v) => ({
    ...v,
    final:
      v.verdict === 'contradicted' && v.conflict !== null && v.conflict < yes
        ? 'missing'
        : v.verdict,
  }))
  const factual = verdicts.filter((v) => v.final !== 'no_facts')
  const supported = factual.filter((v) => v.final === 'supported').length
  return {
    ending,
    opensOnWork: jev.opensOnWork >= yes,
    pointEarly: jev.pointEarly >= yes,
    title: jev.title,
    specificity: mean(units.map((u) => u.specificity)),
    selling: mean(units.map((u) => u.selling)),
    decisions: units.filter((u) => u.decision >= yes).length,
    setbacks: units.filter((u) => u.setback >= yes).length,
    aiWork: aiUnits.length,
    aiSplitShare: aiUnits.length
      ? aiUnits.filter((u) => (u.aiSplit ?? 0) >= yes).length / aiUnits.length
      : null,
    aiUnmentioned: jev.aiBuilt && aiUnits.length === 0 && !jev.aiMentioned,
    graded: Boolean(jev.grounding),
    verdicts,
    factual: factual.length,
    supported,
    contradicted: factual.filter((v) => v.final === 'contradicted'),
    missing: factual.filter((v) => v.final === 'missing'),
    share: (supported + config.groundingPrior) / (factual.length + 1),
  }
}

function flagsOf(raw: WritingRaw, d: WritingDerived | null): string[] {
  const flags: string[] = []
  for (const pattern of raw.borrowed) flags.push(`borrowed line: ${pattern}`)
  if (raw.lint?.failed) flags.push(`lint command failed: ${raw.lint.failed}`)
  for (const excerpt of raw.lint?.errorExcerpts ?? []) flags.push(`lint error ${excerpt}`)
  if (!d) return flags
  if (!d.opensOnWork) flags.push('opening is not inside the work')
  if (!d.pointEarly) flags.push('point not stated in the first two paragraphs')
  if (d.ending !== 'implication') flags.push(`ending reads as ${d.ending}`)
  if (d.decisions === 0) flags.push('no decision against an alternative')
  if (d.setbacks === 0) flags.push('no cost, failure or open question')
  if (d.aiUnmentioned) flags.push('evidence says AI helped build it; the copy does not say so')
  for (const v of d.contradicted) flags.push(`CONTRADICTS evidence: "${v.claim}"`)
  for (const v of d.missing) flags.push(`not in evidence: "${v.claim}"`)
  return flags
}

function scoreWriting(
  raw: WritingRaw | null,
  _subject: ScoreSubject,
  benchConfig: BenchConfig,
): PackScore {
  const config = benchConfig as WritingConfig
  const layers: Record<string, number | null> = Object.fromEntries(
    WRITING_LAYERS.map((l) => [l, null]),
  )
  if (!raw) return { layers, flags: [], verdicts: [] }
  const active = KIND_LAYERS[raw.kind] ?? DEFAULT_KIND_LAYERS
  const d = deriveWriting(raw.jev, config)
  if (active.includes('lint') && raw.lint && !raw.lint.failed)
    layers.lint = raw.lint.errors
      ? 0
      : Math.max(0, 1 - raw.lint.warnings.length * config.warningCost)
  if (active.includes('shape') && raw.shape) layers.shape = shapeScore(raw.shape, config)
  if (d) {
    const { structure, substance } = config
    if (active.includes('structure')) {
      const ending =
        d.ending === 'implication' ? 1 : d.ending === 'pointer' ? structure.pointerCredit : 0
      const parts: Array<[number, number]> = [
        [d.opensOnWork ? 1 : 0, structure.opening],
        [d.pointEarly ? 1 : 0, structure.point],
        [ending, structure.ending],
      ]
      if (d.title) parts.push([['descriptive', 'claim'].includes(d.title) ? 1 : 0, structure.title])
      layers.structure = weighted(parts)
    }
    if (active.includes('substance')) {
      const parts: Array<[number, number]> = [
        [d.specificity ?? 0, substance.specificity],
        [d.decisions > 0 ? 1 : 0, substance.decision],
        [d.setbacks > 0 ? 1 : 0, substance.setback],
      ]
      if (d.aiSplitShare !== null) parts.push([d.aiSplitShare, substance.aiSplit])
      if (d.aiUnmentioned) parts.push([0, substance.aiSplit])
      layers.substance = weighted(parts)
    }
    if (active.includes('tone')) layers.tone = 1 - (d.selling ?? 0)
    if (active.includes('grounding') && raw.hasEvidence && d.graded && d.factual > 0)
      layers.grounding = d.contradicted.length
        ? Math.min(d.share, config.contradictionCap)
        : d.share
  }
  // Its layers are measures, not counts of facts: what it found wrong is all a reader can act on.
  const flags = flagsOf(raw, d)
  return { layers, flags, verdicts: flags.map(finding) }
}

function confidenceWriting(raw: WritingRaw | null): number | null {
  const jev = raw?.jev
  if (!jev) return null
  const nouls = [
    jev.opensOnWork,
    jev.pointEarly,
    ...jev.perUnit.flatMap((u) => [u.decision, u.setback]),
  ].map(certainty)
  const grounding = (jev.grounding?.verdicts ?? []).map((v) => v.confidence)
  return mean([...nouls, ...grounding])
}

export const writingScoring: PackScoring<WritingRaw> = {
  id: 'writing',
  layers: WRITING_LAYERS,
  checks: null,
  defaults: {
    weights: { lint: 15, shape: 15, structure: 20, substance: 25, tone: 10, grounding: 15 },
    /** The kind a case takes when its bench names none; KIND_LAYERS picks the layers. */
    writingKind: 'article',
    /** `command` runs from the skill dir with the copy on stdin and prints findings JSON. */
    lint: { command: null, timeoutSeconds: 60 },
    /** What one lint warning costs the lint layer. Any error scores it 0. */
    warningCost: 0.2,
    structure: { opening: 5, point: 5, ending: 6, title: 4, pointerCredit: 0.5 },
    substance: { specificity: 13, decision: 5, setback: 4, aiSplit: 3 },
    /** Grounding is (supported + prior) / (factual claims + 1). */
    groundingPrior: 0.9,
    /** Any contradiction caps grounding here. */
    contradictionCap: 0.5,
    bands: {
      sentenceMedian: [12, 22],
      shortSentenceShare: [0.08, 0.3],
      paragraphMedian: [25, 75],
      oneLineShare: [0, 0.2],
    },
    /** Who "I" is in the copy, for the grounding question. */
    writer: null,
    /** Case-insensitive patterns for lines the copy must not lift from a source; each match is a flag. */
    borrowed: [],
  },
  score: scoreWriting,
  confidence: confidenceWriting,
}
