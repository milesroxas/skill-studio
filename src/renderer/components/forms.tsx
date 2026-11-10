/** Form rows the screens share: a checkbox with its label, a slider with its number. */
import { cva, type VariantProps } from 'class-variance-authority'
import { type ComponentProps, type ReactNode, useState } from 'react'
import { cn } from '../lib/utils.ts'
import { Text } from './text.tsx'
import { Checkbox } from './ui/checkbox.tsx'
import { Input } from './ui/input.tsx'
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

/** A short number field: a count, a bound. */
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
  /** The exact value as it is being typed; null while the field shows the setting. */
  const [typed, setTyped] = useState<string | null>(null)
  const inRange = (n: number) => !Number.isNaN(n) && n >= min && n <= max
  return (
    <div className="flex flex-col gap-2" title={title}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-ui">{label}</span>
        <NumberInput
          aria-label={`${label}, exact`}
          min={min}
          max={max}
          step={step}
          value={typed ?? value}
          size="sm"
          width="value"
          onChange={(e) => {
            // What is typed shows as typed, and counts once it is a number in the slider's range:
            // "0" on the way to "0.5" is not a setting yet.
            setTyped(e.target.value)
            const next = e.target.valueAsNumber
            if (inRange(next)) onChange(next)
          }}
          onBlur={(e) => {
            // Left outside the range, it goes to the nearest end: the field never holds what the slider cannot reach.
            const next = e.target.valueAsNumber
            if (!Number.isNaN(next) && !inRange(next)) onChange(Math.min(max, Math.max(min, next)))
            setTyped(null)
          }}
        />
      </div>
      <Slider
        label={label}
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
