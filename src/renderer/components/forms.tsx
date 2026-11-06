/** Form rows the screens share: a checkbox with its label, a slider with its number. */
import { cva, type VariantProps } from 'class-variance-authority'
import { MinusIcon, PlusIcon } from 'lucide-react'
import { type ComponentProps, type KeyboardEvent, type ReactNode, useRef } from 'react'
import { cn } from '../lib/utils.ts'
import { Text } from './text.tsx'
import { Button } from './ui/button.tsx'
import { Checkbox } from './ui/checkbox.tsx'
import { FIELD_SURFACE, Input } from './ui/input.tsx'
import { Slider } from './ui/slider.tsx'

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

const numberVariants = cva('tabular-nums', {
  variants: {
    width: {
      default: 'w-19',
      /** A value beside a slider. */
      value: 'w-16 text-right',
      full: 'w-full',
    },
  },
  defaultVariants: { width: 'default' },
})

/** A short number field: a weight, a count, a bound. */
export function NumberInput({
  className,
  width,
  ...props
}: Omit<ComponentProps<typeof Input>, 'width'> & VariantProps<typeof numberVariants>) {
  return (
    <Input
      type="number"
      inputMode={props.step && Number(props.step) < 1 ? 'decimal' : 'numeric'}
      width="auto"
      className={cn(numberVariants({ width }), className)}
      {...props}
    />
  )
}

const stepperVariants = cva(
  `${FIELD_SURFACE} flex h-9 items-center rounded-sm px-1.25 transition-[color,box-shadow] has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50`,
  {
    variants: {
      /** `full` fills a grid track, as in a row of checks; `field` is 112px, in a `Field` on a form. */
      width: {
        full: 'w-full',
        field: 'w-28',
      },
    },
    defaultVariants: { width: 'full' },
  },
)

type StepperProps = VariantProps<typeof stepperVariants> & {
  value: number
  /** The range, both ends included. One digit each, so a key can name any value. */
  min: number
  max: number
  onChange: (value: number) => void
} & (
    | {
        /** What the number is, read to assistive technology. */
        label: string
        labelledBy?: never
        id?: never
      }
    | {
        /** The id of the visible `Label` that names it, in a `Field`. */
        labelledBy: string
        /** The number's own id, for the `Label`'s `htmlFor`, so a click on the label focuses it. */
        id: string
        label?: never
      }
  )

/**
 * A whole number from a short range, such as a weight from 1 to 5: the value
 * between a minus and a plus, in one field the height of an input.
 *
 * There is nothing to edit, so there is no caret: a digit typed is the new
 * value, the arrow keys step it, Home and End go to the ends, and a value out
 * of range lands on the nearest end. The buttons are for the pointer. They stay
 * out of the tab order and hand focus to the number, so the field is one stop
 * and the arrow keys carry on from a click.
 */
export function Stepper({ label, labelledBy, id, width, value, min, max, onChange }: StepperProps) {
  const number = useRef<HTMLInputElement>(null)
  const to = (next: number) => {
    const clamped = Math.min(max, Math.max(min, Math.round(next)))
    if (clamped !== value) onChange(clamped)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const next =
      e.key === 'ArrowUp'
        ? value + 1
        : e.key === 'ArrowDown'
          ? value - 1
          : e.key === 'Home'
            ? min
            : e.key === 'End'
              ? max
              : /^\d$/.test(e.key)
                ? Number(e.key)
                : null
    if (next === null) return
    e.preventDefault()
    to(next)
  }
  const button = (by: 1 | -1) => ({
    type: 'button' as const,
    variant: 'ghost-muted' as const,
    size: 'icon-xs' as const,
    tabIndex: -1,
    disabled: by > 0 ? value >= max : value <= min,
    // The press does not take focus; the click gives it to the number.
    onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
    onClick: () => {
      to(value + by)
      number.current?.focus()
    },
  })
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset brings a legend and its own box; this is one field
    <div
      role="group"
      aria-label={label}
      // 5px around the 24px buttons, on every side: 36px tall with the border.
      className={stepperVariants({ width })}
    >
      <Button {...button(-1)} aria-label="Decrease" className="rounded-xs">
        <MinusIcon aria-hidden="true" />
      </Button>
      <input
        ref={number}
        id={id}
        role="spinbutton"
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        inputMode="numeric"
        autoComplete="off"
        className="w-0 min-w-0 flex-1 cursor-default bg-transparent text-center text-sm font-medium tabular-nums caret-transparent outline-none selection:bg-transparent"
        value={value}
        onKeyDown={onKey}
        // What a key press does not reach: a paste, or text from an input method.
        onChange={(e) => {
          const digit = e.target.value.replace(/\D/g, '').slice(-1)
          if (digit) to(Number(digit))
        }}
      />
      <Button {...button(1)} aria-label="Increase" className="rounded-xs">
        <PlusIcon aria-hidden="true" />
      </Button>
    </div>
  )
}

interface KnobProps {
  label: string
  about?: string
  title?: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}

/**
 * A setting: its label and exact value on one line, the slider across the full
 * width under them, and what it does under that.
 */
export function Knob({ label, about, title, value, min, max, step, onChange }: KnobProps) {
  return (
    <div className="flex flex-col gap-2" title={title}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-ui">{label}</span>
        <NumberInput
          aria-label={`${label}, exact`}
          min={min}
          step={step}
          value={value}
          size="sm"
          width="value"
          onChange={(e) => {
            const next = e.target.valueAsNumber
            if (!Number.isNaN(next)) onChange(next)
          }}
        />
      </div>
      <Slider
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
      />
      {about ? (
        <Text as="span" tone="muted" size="xs">
          {about}
        </Text>
      ) : null}
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
