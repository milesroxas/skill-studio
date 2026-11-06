/** Joined toggles: one choice (`Segmented`) or a set of filters (`FilterGroup`). */
import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'
import { cn } from '../lib/utils.ts'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group.tsx'

interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  title?: string
  /** The verdict this choice states, coloring it when pressed. */
  tone?: 'success' | 'destructive'
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
  value: T | null
  /** `null` when the pressed choice is pressed again and `clearable` is set. */
  onChange: (value: T | null) => void
  options: ReadonlyArray<SegmentOption<T>>
  clearable?: boolean
  size?: 'sm' | 'default'
  tabular?: boolean
  'aria-label'?: string
  'aria-labelledby'?: string
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  clearable = false,
  fill,
  size = 'sm',
  tabular,
  ...aria
}: SegmentedProps<T>) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size={size}
      value={value ?? ''}
      onValueChange={(v) => {
        if (v) onChange(v as T)
        else if (clearable) onChange(null)
      }}
      className={cn(groupVariants({ fill }))}
      {...aria}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          title={o.title}
          tone={o.tone}
          className={tabular ? 'tabular-nums' : undefined}
        >
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
