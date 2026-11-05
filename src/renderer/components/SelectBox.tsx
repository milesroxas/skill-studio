/**
 * A select over a list of options, flat or grouped. Radix forbids an item with
 * an empty value, so the "none" choice is a sentinel inside and '' outside.
 */
import { cva, type VariantProps } from 'class-variance-authority'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from './ui/select.tsx'

interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface SelectOptionGroup {
  label: string
  options: SelectOption[]
}

const NONE = '\u0000none'

const triggerVariants = cva('', {
  variants: {
    width: {
      auto: 'max-w-full',
      full: 'w-full',
      /** Long labels, such as a run with its writer and time. */
      wide: 'max-w-[min(440px,calc(100vw-80px))]',
    },
  },
  defaultVariants: { width: 'auto' },
})

interface Props extends VariantProps<typeof triggerVariants> {
  value: string
  onChange: (value: string) => void
  options?: SelectOption[]
  groups?: SelectOptionGroup[]
  /** The label of the choice that means no value. Without it, '' shows the placeholder. */
  none?: string
  placeholder?: string
  id?: string
  'aria-label'?: string
  size?: 'sm' | 'default'
  disabled?: boolean
}

export function SelectBox({
  value,
  onChange,
  options = [],
  groups = [],
  none,
  placeholder,
  id,
  size,
  width,
  disabled,
  ...aria
}: Props) {
  const item = (o: SelectOption) => (
    <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
      {o.label}
    </SelectItem>
  )
  return (
    <Select
      value={value === '' && none ? NONE : value}
      onValueChange={(v) => onChange(v === NONE ? '' : v)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        size={size}
        className={triggerVariants({ width })}
        aria-label={aria['aria-label']}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {none ? <SelectItem value={NONE}>{none}</SelectItem> : null}
        {options.map(item)}
        {groups.map((g) => (
          <SelectGroup key={g.label}>
            <SelectLabel>{g.label}</SelectLabel>
            {g.options.map(item)}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
