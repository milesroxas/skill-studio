/** Form rows the screens share: a checkbox with its label, a slider with its number. */
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps, ReactNode } from 'react'
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
  size?: 'default' | 'sm'
}

/** A checkbox and its label on one line; the whole line toggles it. */
export function CheckRow({ checked, onCheckedChange, disabled, children, size }: CheckRowProps) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the Radix checkbox inside is the control
    <label
      className={cn(
        'flex min-h-6 cursor-pointer items-center gap-2 pointer-coarse:min-h-11',
        size === 'sm' ? 'text-xs' : 'text-sm',
        disabled && 'cursor-default opacity-60',
      )}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onCheckedChange(v === true)}
      />
      <span>{children}</span>
    </label>
  )
}

const numberVariants = cva('tabular-nums', {
  variants: {
    width: {
      default: 'w-19',
      /** One digit: a weight from 1 to 5. */
      narrow: 'w-14',
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

/** A setting with a slider and the exact number beside it. */
export function Knob({ label, about, title, value, min, max, step, onChange }: KnobProps) {
  return (
    <div
      className="grid grid-cols-[96px_minmax(0,1fr)_64px] items-center gap-x-3 gap-y-0.5 text-[13px] md:grid-cols-[104px_minmax(0,1fr)_76px]"
      title={title}
    >
      <span>{label}</span>
      <Slider
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
      />
      <NumberInput
        aria-label={`${label}, exact`}
        min={min}
        step={step}
        value={value}
        width="full"
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {about ? (
        <Text as="span" tone="muted" size="xs" className="col-span-full -mt-0.5">
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
        <Text tone="muted" size="sm">
          {label}
        </Text>
      ) : (
        label
      )}
      {children}
    </span>
  )
}
