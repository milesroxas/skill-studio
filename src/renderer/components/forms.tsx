/** Form rows the screens share: a checkbox with its label, a number field, a label inline. */
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/utils.ts'
import { Text } from './text.tsx'
import { Checkbox } from './ui/checkbox.tsx'
import { Input } from './ui/input.tsx'

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
