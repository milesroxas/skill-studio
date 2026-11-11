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
  /** A quieter line under the label, in the list only, such as who wrote a run and when. */
  detail?: string
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
      /** Takes the room its row has to spare and truncates, so two in a row are the same width. */
      fill: 'min-w-0 flex-1',
    },
  },
  defaultVariants: { width: 'auto' },
})

interface Props extends VariantProps<typeof triggerVariants> {
  value: string
  onChange: (value: string) => void
  options?: SelectOption[]
  groups?: SelectOptionGroup[]
  /** The label of the choice that means no value. */
  none?: string
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
  id,
  size,
  width,
  disabled,
  ...aria
}: Props) {
  const item = (o: SelectOption) => (
    <SelectItem key={o.value} value={o.value} disabled={o.disabled} detail={o.detail}>
      {o.label}
    </SelectItem>
  )
  // A name the field cuts short is whole in its title, with the line the list shows under it.
  const chosen = [...options, ...groups.flatMap((g) => g.options)].find((o) => o.value === value)
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
        title={chosen?.detail ? `${chosen.label} · ${chosen.detail}` : undefined}
      >
        <SelectValue />
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
