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

export interface SelectOption {
  value: string
  label: string
  /** A quieter line under the label, in the list only, such as who wrote a run and when. */
  detail?: string
  /** What the field shows while this is picked, where the label is longer than the field needs. */
  short?: string
  disabled?: boolean
}

export interface SelectOptionGroup {
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
  /**
   * `caption`: a value in a line of meta, changed where it is read. `title`: a
   * card's title that picks what the card shows. A field otherwise.
   */
  variant?: 'field' | 'caption' | 'title'
  disabled?: boolean
}

/** The whole name in the field's title: what the field shows, when the list's label leaves it out, then the label and its line. */
const hoverText = (o: SelectOption): string =>
  [o.short && !o.label.startsWith(o.short) ? o.short : null, o.label, o.detail]
    .filter(Boolean)
    .join(' · ')

export function SelectBox({
  value,
  onChange,
  options = [],
  groups = [],
  none,
  id,
  size,
  variant,
  width,
  disabled,
  ...aria
}: Props) {
  // A caption's list hangs from it, clear of the line it sits in, and is one line a row: laid
  // over a control a quarter its size, a field's list hides what was picked and runs off the window.
  const caption = variant === 'caption'
  // A caption's or a title's list hangs from it, so what it picks for stays in view.
  const hangs = caption || variant === 'title'
  const item = (o: SelectOption) => (
    <SelectItem
      key={o.value}
      value={o.value}
      disabled={o.disabled}
      detail={o.detail}
      detailPlace={caption ? 'end' : 'under'}
    >
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
        variant={variant}
        className={triggerVariants({ width })}
        aria-label={aria['aria-label']}
        title={chosen?.detail ? hoverText(chosen) : undefined}
      >
        <SelectValue>{chosen?.short}</SelectValue>
      </SelectTrigger>
      <SelectContent
        position={hangs ? 'popper' : 'item-aligned'}
        align={hangs ? 'start' : 'center'}
      >
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
