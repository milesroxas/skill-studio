/** Joined toggles: one choice (`Segmented`) or a set of filters (`FilterGroup`). */
import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group.tsx'

interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  title?: string
}

const groupVariants = cva('', {
  variants: {
    fill: {
      true: 'w-full *:flex-1',
      false: '',
    },
  },
  defaultVariants: { fill: false },
})

interface SegmentedProps<T extends string> extends VariantProps<typeof groupVariants> {
  /** The choice pressed; null when none is yet, such as a pick not made. */
  value: T | null
  /** A choice stays pressed when it is pressed again, so this is never null. */
  onChange: (value: T) => void
  options: ReadonlyArray<SegmentOption<T>>
  /** A change is being saved: no choice can be pressed until it lands. */
  disabled?: boolean
  size?: 'sm' | 'default'
  'aria-label'?: string
  'aria-labelledby'?: string
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  disabled,
  fill,
  size = 'sm',
  ...aria
}: SegmentedProps<T>) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={0}
      size={size}
      disabled={disabled}
      value={value ?? ''}
      onValueChange={(v) => {
        if (v) onChange(v as T)
      }}
      className={groupVariants({ fill })}
      {...aria}
    >
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} title={o.title}>
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

interface FilterGroupProps<T extends string> {
  values: ReadonlySet<T>
  onToggle: (value: T) => void
  options: ReadonlyArray<SegmentOption<T>>
  'aria-label': string
}

/** Filters: everything shown reads plain, what is hidden fades. */
export function FilterGroup<T extends string>({
  values,
  onToggle,
  options,
  ...aria
}: FilterGroupProps<T>) {
  return (
    <ToggleGroup
      type="multiple"
      variant="filter"
      size="sm"
      value={[...values]}
      onValueChange={(next) => {
        const was = new Set(values)
        const now = new Set(next as T[])
        for (const o of options) if (was.has(o.value) !== now.has(o.value)) onToggle(o.value)
      }}
      className="rounded-sm border shadow-xs"
      {...aria}
    >
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} title={o.title}>
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
