/**
 * How big a skill file is: its lines, its tokens and a level from 1 to 5.
 * An agent reads the whole of SKILL.md before it works, so its size is
 * attention taken from the task. The top of the scale is 500 lines or 5,000
 * tokens, the most Anthropic's skill guidance gives a SKILL.md body.
 */

/** A token is about four characters of English. Close enough to judge size, not to bill. */
const CHARS_PER_TOKEN = 4

/** The most lines and tokens at levels 1 to 4. Anything past the last is level 5. */
const LINE_STEPS = [40, 120, 250, 500] as const
const TOKEN_STEPS = [500, 1500, 3000, 5000] as const

export const SIZE_LEVELS = 5

export interface TextSize {
  lines: number
  /** An estimate: characters over four, rounded up. */
  tokens: number
  /** 0 for an empty text, else 1 to 5: the higher of the line and token levels. */
  level: number
}

/**
 * How the level stands. Up to 3 is fine. 4 is long: worth a look for what
 * could move to `references/`. 5 is past the guidance.
 */
export type SizeBand = 'fine' | 'long' | 'over'

export const sizeBand = (level: number): SizeBand =>
  level >= SIZE_LEVELS ? 'over' : level === SIZE_LEVELS - 1 ? 'long' : 'fine'

const levelOf = (value: number, steps: readonly number[]): number => {
  const step = steps.findIndex((most) => value <= most)
  return step === -1 ? SIZE_LEVELS : step + 1
}

export function textSize(text: string): TextSize {
  if (!text.trim()) return { lines: 0, tokens: 0, level: 0 }
  // A newline at the end closes the last line; it does not start another.
  const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
  const tokens = Math.ceil(text.length / CHARS_PER_TOKEN)
  return {
    lines,
    tokens,
    level: Math.max(levelOf(lines, LINE_STEPS), levelOf(tokens, TOKEN_STEPS)),
  }
}
