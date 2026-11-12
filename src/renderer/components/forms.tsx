/** Form rows the screens share: a checkbox with its label, a number field, a label inline. */
import { cva, type VariantProps } from 'class-variance-authority'
import { MinusIcon, PlusIcon } from 'lucide-react'
import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { cn } from '../lib/utils.ts'
import { Text } from './text.tsx'
import { Checkbox } from './ui/checkbox.tsx'
import { FIELD_SURFACE } from './ui/input.tsx'

interface CheckRowProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  children: ReactNode
  /** A second, quieter line under the label. */
  description?: ReactNode
  size?: 'default' | 'sm'
}

/** A checkbox and its label; the whole row toggles it. */
export function CheckRow({
  checked,
  onCheckedChange,
  disabled,
  children,
  description,
  size,
}: CheckRowProps) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the Radix checkbox inside is the control
    <label
      className={cn(
        'flex min-h-6 cursor-pointer gap-2.5 pointer-coarse:min-h-11',
        description ? 'items-start' : 'items-center',
        size === 'sm' ? 'text-xs' : 'text-sm',
        disabled && 'cursor-default opacity-60',
      )}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        className={description ? 'mt-0.5' : undefined}
        onCheckedChange={(v) => onCheckedChange(v === true)}
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span>{children}</span>
        {description ? (
          <Text tone="muted" size="xs">
            {description}
          </Text>
        ) : null}
      </span>
    </label>
  )
}

const numberVariants = cva(
  `${FIELD_SURFACE} relative flex h-9 items-center gap-0.5 rounded-sm p-0.5 transition-[color,box-shadow] focus-edge has-[input:disabled]:opacity-50 has-[input[aria-invalid=true]]:border-destructive`,
  {
    variants: {
      width: {
        default: 'w-30',
        full: 'w-full',
      },
    },
    defaultVariants: { width: 'default' },
  },
)

/*
 * A step button: a quiet minus or plus at each end of the field, lit as a
 * ghost-muted button is when pointed at. 30px square inside the field's 2px
 * padding, its corner 2px: the field's 4px less the padding and the edge.
 * Its hit area reaches the field's outer edge (36px) and, toward the number,
 * only across the 2px gap, so it never takes a click meant for the text.
 * Under a finger it reaches 7px past the field above and below and 12px
 * outward (44px), never inward.
 */
const STEP_BUTTON =
  'relative flex aspect-square h-full shrink-0 items-center justify-center rounded-xs text-muted-foreground transition-[color,background-color,opacity,scale] duration-150 ease-out before:absolute before:-inset-y-0.75 pointer-coarse:before:-inset-y-1.75 hover:bg-accent hover:text-foreground active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-accent/50 [&_svg]:pointer-events-none [&_svg]:size-3.5'
const STEP_SIDE = {
  [-1]: 'before:-left-0.75 before:-right-0.5 pointer-coarse:before:-left-3',
  1: 'before:-left-0.5 before:-right-0.75 pointer-coarse:before:-right-3',
} as const

/** Held this long, a step button starts to repeat; then it steps every `REPEAT_MS`, and faster after a while. */
const HOLD_MS = 400
const REPEAT_MS = 70
const RUSH_MS = 35
const RUSH_AFTER = 12

/** The number a field's text reads as, or NaN for nothing yet, a lone sign or a lone point. */
const parse = (text: string): number => (/^-?\.?$/.test(text.trim()) ? Number.NaN : Number(text))

/** Digits after the point in a step, so 0.1 + 0.2 lands on 0.3. */
const decimals = (step: number): number => (String(step).split('.')[1] ?? '').length

interface NumberInputProps extends VariantProps<typeof numberVariants> {
  value: number
  /** Called with each whole number the reader types or steps to, always within `min` and `max`. */
  onValueChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  id?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

/**
 * A short number field: a count, a bound. Type the number, or step it with the
 * minus and plus at its ends: hold one to keep stepping, Shift for ten at a
 * time. Arrow keys step too, Page Up and Page Down by ten, Home and End to the
 * bounds. A number past a bound is held to it when the field is left.
 */
export function NumberInput({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  disabled,
  width,
  'aria-invalid': invalid,
  ...aria
}: NumberInputProps) {
  const input = useRef<HTMLInputElement>(null)
  // What the reader is typing, or null to show the value as it stands.
  const [draft, setDraft] = useState<string | null>(null)
  // The value as last committed, read by a held button's timer between renders.
  const current = useRef(value)
  current.current = value
  const timer = useRef<number | undefined>(undefined)

  const clamp = (n: number): number =>
    Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, n))
  const allowed = new RegExp(
    `^${(min ?? -1) < 0 ? '-?' : ''}\\d*${decimals(step) > 0 ? '\\.?\\d*' : ''}$`,
  )

  const commit = (n: number): void => {
    current.current = n
    if (n !== value) onValueChange(n)
  }

  /** Move by `count` steps from the number shown. False when a bound stops it. */
  const stepBy = (count: number): boolean => {
    // The number on screen, typed or not; a held button's timer reads it after each render.
    const shown = parse(input.current?.value ?? '')
    const from = Number.isFinite(shown) ? shown : current.current
    const next = clamp(Number((from + count * step).toFixed(decimals(step))))
    setDraft(null)
    if (next === current.current) return false
    commit(next)
    return true
  }

  /*
   * The new number rolls in from the side it came from: up from below when it
   * grows, down from above when it shrinks. Only the first step of a press
   * moves; a held button repeats too fast for it to read.
   */
  const roll = (direction: 1 | -1): void => {
    if (document.documentElement.dataset.motion === 'reduced') return
    input.current?.animate(
      [
        { transform: `translateY(${direction * 6}px)`, opacity: 0.35 },
        { transform: 'none', opacity: 1 },
      ],
      // --ease-out-strong in styles.css; WAAPI cannot read a custom property.
      { duration: 180, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    )
  }

  const release = (): void => {
    window.clearTimeout(timer.current)
    timer.current = undefined
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const press = (direction: 1 | -1, event: PointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return
    release()
    const count = direction * (event.shiftKey ? 10 : 1)
    if (!stepBy(count)) return
    roll(direction)
    let repeats = 0
    const tick = (delay: number): void => {
      timer.current = window.setTimeout(() => {
        repeats += 1
        if (stepBy(count)) tick(repeats > RUSH_AFTER ? RUSH_MS : REPEAT_MS)
        else release()
      }, delay)
    }
    tick(HOLD_MS)
    // The button may go disabled at a bound and miss its own pointerup.
    window.addEventListener('pointerup', release, { once: true })
    window.addEventListener('pointercancel', release, { once: true })
  }

  const leave = (): void => {
    if (draft === null) return
    const n = parse(draft)
    if (Number.isFinite(n)) commit(clamp(n))
    setDraft(null)
  }

  /** How many steps a key moves, or null for a key the field leaves alone. */
  const keySteps = (key: string, shift: boolean): number | null => {
    if (key === 'ArrowUp') return shift ? 10 : 1
    if (key === 'ArrowDown') return shift ? -10 : -1
    if (key === 'PageUp') return 10
    if (key === 'PageDown') return -10
    if (key === 'Home' && min !== undefined) return (min - current.current) / step
    if (key === 'End' && max !== undefined) return (max - current.current) / step
    return null
  }

  const button = (direction: 1 | -1) => (
    <button
      type="button"
      tabIndex={-1}
      aria-label={direction > 0 ? 'Increase' : 'Decrease'}
      aria-controls={aria.id}
      disabled={
        disabled ||
        (direction > 0 ? max !== undefined && value >= max : min !== undefined && value <= min)
      }
      className={cn(STEP_BUTTON, STEP_SIDE[direction])}
      // Keep the caret where it is: a click on a step button never takes the focus.
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => press(direction, e)}
      // A screen reader presses with no pointer: detail is 0 then.
      onClick={(e) => e.detail === 0 && stepBy(direction)}
    >
      {direction > 0 ? <PlusIcon aria-hidden="true" /> : <MinusIcon aria-hidden="true" />}
    </button>
  )

  return (
    <div className={numberVariants({ width })}>
      {button(-1)}
      <input
        ref={input}
        {...aria}
        type="text"
        role="spinbutton"
        inputMode={decimals(step) > 0 ? 'decimal' : 'numeric'}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        value={draft ?? String(value)}
        className="h-full min-w-0 flex-1 bg-transparent text-center text-base tabular-nums outline-none selection:bg-primary selection:text-primary-foreground disabled:cursor-not-allowed md:text-sm"
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          // A pasted "1,280" or " 12 " reads as the number it shows.
          const text = e.target.value.replace(/[\s,]/g, '')
          if (!allowed.test(text)) return
          setDraft(text)
          const n = parse(text)
          if (Number.isFinite(n) && n === clamp(n)) commit(n)
        }}
        onBlur={leave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') return leave()
          const count = keySteps(e.key, e.shiftKey)
          if (count === null) return
          e.preventDefault()
          stepBy(count)
        }}
      />
      {button(1)}
    </div>
  )
}

/** A short label before a control on one line, such as "From" before a select. */
export function InlineField({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2">
      {typeof label === 'string' ? (
        <Text tone="muted" size="ui">
          {label}
        </Text>
      ) : (
        label
      )}
      {children}
    </span>
  )
}
