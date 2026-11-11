/** Joined toggles: one choice (`Segmented`) or a set of filters (`FilterGroup`). */
import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'
import { cn } from '../lib/utils.ts'
import type { toggleVariants } from './ui/toggle.tsx'
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
  /**
   * `ink`, the default: joined segments, the pressed one ink fill. `quiet`:
   * separate labels, the pressed one on `accent`, for a choice beside an ink
   * one that it must not compete with, such as the file under an A or B.
   */
  tone?: 'ink' | 'quiet'
  /** `mono` when the choices are literals, such as file names. */
  font?: VariantProps<typeof toggleVariants>['font']
  /** `xs` for a choice over an object, at the size of the meta around it. */
  text?: VariantProps<typeof toggleVariants>['text']
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
  tone = 'ink',
  font,
  text,
  ...aria
}: SegmentedProps<T>) {
  return (
    <ToggleGroup
      type="single"
      variant={tone === 'quiet' ? 'default' : 'outline'}
      spacing={tone === 'quiet' ? 1 : 0}
      size={size}
      disabled={disabled}
      value={value ?? ''}
      onValueChange={(v) => {
        if (v) onChange(v as T)
      }}
      // Separate labels wrap onto a second line; joined segments scroll, as one piece.
      className={cn(groupVariants({ fill }), tone === 'quiet' && 'flex-wrap')}
      {...aria}
    >
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} title={o.title} font={font} text={text}>
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
