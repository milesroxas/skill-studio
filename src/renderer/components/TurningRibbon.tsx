/**
 * The turning ribbon: a sheet of hairlines that says the assistant is at
 * work here. Each line is the mark's own curve (both control points at the
 * horizontal midpoint); its two ends rise and fall a beat apart, and each
 * line runs a step behind the one before, so the lines read as one ribbon
 * turning in space. A line is dimmer while it is at the back, and the lines
 * fade out at both ends. It takes the text color. See docs/design/brand.md.
 *
 * It moves by SVG's own animation, sampled once, so nothing renders again
 * while it runs. With movement reduced it is drawn at rest.
 */
import { useId, useMemo } from 'react'

const W = 112
const H = 88
const LINES = 11
/** Seconds for one turn: slow, so it is felt more than watched. */
const TURN = 11
/** How far the ends travel from the middle, in px. */
const REACH = 30
/** How far a line runs behind the one before, and its far end behind its near end, in turns. */
const STEP = 0.5 / LINES
const TWIST = 0.19
/** Points of the turn that are written down; the browser draws straight between them. */
const SAMPLES = 24

const TAU = Math.PI * 2
const mid = H / 2
const at = (turn: number) => mid + REACH * Math.cos(turn * TAU)
const round = (n: number) => Math.round(n * 100) / 100

const shape = (turn: number): string => {
  const near = round(at(turn))
  const far = round(at(turn + TWIST))
  return `M 0 ${near} C ${W / 2} ${near}, ${W / 2} ${far}, ${W} ${far}`
}
/** In front it is plain; at the back it is a quarter as strong. */
const depth = (turn: number): number => round(0.25 + 0.75 * (0.5 + 0.5 * Math.sin(turn * TAU)))

const reducedMotion = (): boolean => document.documentElement.dataset.motion === 'reduced'

export function TurningRibbon({ className }: { className?: string }) {
  const fade = useId()
  const lines = useMemo(
    () =>
      Array.from({ length: LINES }, (_, i) => {
        const turns = Array.from({ length: SAMPLES + 1 }, (_, s) => i * STEP + s / SAMPLES)
        return {
          rest: shape(i * STEP),
          restDepth: depth(i * STEP),
          shapes: turns.map(shape).join(';'),
          depths: turns.map(depth).join(';'),
        }
      }),
    [],
  )
  const still = reducedMotion()
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      fill="none"
      className={className}
    >
      <defs>
        {/* In the picture's own units: a flat line has no box of its own to measure a fade by. */}
        <linearGradient id={fade} gradientUnits="userSpaceOnUse" x1="0" x2={W} y1="0" y2="0">
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset="0.3" stopColor="currentColor" stopOpacity="1" />
          <stop offset="0.7" stopColor="currentColor" stopOpacity="1" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {lines.map((line, i) => (
        <path
          // biome-ignore lint/suspicious/noArrayIndexKey: the lines are fixed and told apart only by their place
          key={i}
          d={line.rest}
          stroke={`url(#${fade})`}
          strokeWidth="1"
          strokeOpacity={line.restDepth}
          vectorEffect="non-scaling-stroke"
        >
          {still ? null : (
            <>
              <animate
                attributeName="d"
                dur={`${TURN}s`}
                repeatCount="indefinite"
                values={line.shapes}
              />
              <animate
                attributeName="stroke-opacity"
                dur={`${TURN}s`}
                repeatCount="indefinite"
                values={line.depths}
              />
            </>
          )}
        </path>
      ))}
    </svg>
  )
}
