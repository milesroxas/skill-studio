import type { Artifact, BenchConfig, LayerHome } from './schemas.ts'

/** What a pack's scorer knows about the output besides its own raw answers. */
export interface ScoreSubject {
  case: string | null
  primary: Artifact | null
  artifacts: Artifact[]
  words: number
  range: [number, number] | null
}

export interface PackScore {
  /** Layer shares, 0 to 1; null leaves the layer out of the total. */
  layers: Record<string, number | null>
  flags: string[]
}

/**
 * The pure half of a judge pack: raw Jev answers in, layer shares and flags
 * out. Shared by the server and the browser so Knobs can rescore from stored
 * answers without new calls. The server half (questions, code checks) lives in
 * `judges/<pack>/index.ts` and extends this.
 */
export interface PackScoring<Raw = unknown> {
  id: string
  /** Layers this pack scores, in display order. */
  layers: string[]
  /** The layer that marks the case's checks, one of `layers`; null when the pack reads none. */
  checks: string | null
  /** Points for its layers and its own knobs, laid under `bench.json`. */
  defaults: Partial<BenchConfig>
  /** Where each layer is fixed when it is low: the skill section, or the benchmark knob. */
  layerHome: Record<string, LayerHome>
  score(raw: Raw | null, subject: ScoreSubject, config: BenchConfig): PackScore
  /** Mean certainty of the pack's Nouls, 0 to 1; null when it asked none. */
  confidence(raw: Raw | null): number | null
}
