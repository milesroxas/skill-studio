import { toggleVariants } from '@renderer/components/ui/toggle.tsx'
import { cn } from '@renderer/lib/utils.ts'
import type { VariantProps } from 'class-variance-authority'
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui'
import * as React from 'react'

/** What a group sets for every item in it. An item's label (`font`, `text`) is its own. */
type GroupVariants = Pick<VariantProps<typeof toggleVariants>, 'variant' | 'size'>

const ToggleGroupContext = React.createContext<
  GroupVariants & {
    spacing?: number
  }
>({
  size: 'default',
  variant: 'default',
  spacing: 0,
})

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 0,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  GroupVariants & {
    spacing?: number
  }) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      style={{ '--gap': spacing } as React.CSSProperties}
      className={cn(
        'group/toggle-group flex w-fit max-w-full items-center gap-[--spacing(var(--gap))] overflow-x-auto rounded-sm data-[spacing=default]:data-[variant=outline]:shadow-xs',
        className,
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size, spacing }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  font,
  text,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  Omit<VariantProps<typeof toggleVariants>, 'place'>) {
  const context = React.useContext(ToggleGroupContext)

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      data-spacing={context.spacing}
      className={cn(
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
          place: 'group',
          font,
          text,
        }),
        'w-auto min-w-0 shrink-0 px-3',
        // Joined items stay joined when pressed. The group clips a hit area that
        // reaches past it, so under a finger the items themselves grow to 44px.
        'active:scale-100 pointer-coarse:h-11 pointer-coarse:before:hidden',
        'data-[spacing=0]:rounded-none data-[spacing=0]:shadow-none data-[spacing=0]:first:rounded-l-sm data-[spacing=0]:last:rounded-r-sm data-[spacing=0]:data-[variant=outline]:border-l-0 data-[spacing=0]:data-[variant=outline]:first:border-l',
        className,
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  )
}

export { ToggleGroup, ToggleGroupItem }
