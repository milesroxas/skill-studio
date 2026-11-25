import { cn } from '@renderer/lib/utils.ts'
import { cva, type VariantProps } from 'class-variance-authority'
import { Popover as PopoverPrimitive, Slot } from 'radix-ui'
import type * as React from 'react'
import { useCallback, useRef } from 'react'
import { floatingMotion, floatingRow, floatingRowTone, floatingSheet } from './floating.ts'

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

/** What Radix hangs a sheet from: a box on screen, and the element whose scrolling and resizing move it. */
interface Measured {
  getBoundingClientRect: () => DOMRect
  readonly contextElement: Element | undefined
}

/**
 * An element's box as laid out, not as drawn. A button shrinks while it is
 * pressed (`scale`, from its centre), and a popover opens on the release, so
 * the drawn box would hang the sheet a pixel or two in from the button's edge,
 * and Radix does not measure again when the button grows back. Its own scale
 * is taken out; a scale on something around it, such as a dialog still
 * zooming in, is where it really is and stays.
 */
function laidOut(element: Element): DOMRect {
  const drawn = element.getBoundingClientRect()
  const { scale } = getComputedStyle(element)
  if (!scale || scale === 'none') return drawn
  const [sx = 1, sy = sx] = scale.split(' ').map(Number)
  if (!sx || !sy) return drawn
  const width = drawn.width / sx
  const height = drawn.height / sy
  return new DOMRect(
    drawn.x + (drawn.width - width) / 2,
    drawn.y + (drawn.height - height) / 2,
    width,
    height,
  )
}

/** The element to measure, and the anchor Radix reads it through. */
function useLaidOutAnchor() {
  const element = useRef<Element | null>(null)
  const anchor = useRef<Measured | null>(null)
  if (anchor.current === null)
    anchor.current = {
      getBoundingClientRect: () => (element.current ? laidOut(element.current) : new DOMRect()),
      get contextElement() {
        return element.current ?? undefined
      },
    }
  return { element, anchor }
}

/** One ref from the caller's and ours, kept while the caller's is the same. */
function useBothRefs<T>(theirs: React.Ref<T> | undefined, ours: React.RefObject<T | null>) {
  return useCallback(
    (node: T | null) => {
      ours.current = node
      if (typeof theirs === 'function') theirs(node)
      else if (theirs) theirs.current = node
    },
    [theirs, ours],
  )
}

/** Opens the sheet, which hangs from it as laid out (`laidOut`). */
function PopoverTrigger({ ref, ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  const { element, anchor } = useLaidOutAnchor()
  const refs = useBothRefs(ref, element)
  return (
    <>
      <PopoverPrimitive.Anchor virtualRef={anchor} />
      <PopoverPrimitive.Trigger data-slot="popover-trigger" ref={refs} {...props} />
    </>
  )
}

/**
 * What the sheet hangs from when that is not what opens it: an element, as
 * laid out (`laidOut`), or a box of the caller's own (`virtualRef`), such as a
 * selection in the editor.
 */
function PopoverAnchor({
  ref,
  asChild,
  virtualRef,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  const { element, anchor } = useLaidOutAnchor()
  const refs = useBothRefs(ref, element)
  if (virtualRef)
    return <PopoverPrimitive.Anchor data-slot="popover-anchor" virtualRef={virtualRef} />
  const Comp = asChild ? Slot.Root : 'div'
  return (
    <>
      <PopoverPrimitive.Anchor virtualRef={anchor} />
      <Comp data-slot="popover-anchor" ref={refs} {...props} />
    </>
  )
}

/**
 * A sheet that holds a reply is never taller than the room on its side of what
 * it opened from (Radix measures it): past that it scrolls, or the part of it
 * that scrolls on its own does. On a small window it would else run off the top.
 */
const FITS = 'max-h-(--radix-popover-content-available-height) overflow-y-auto overscroll-contain'

/** A sheet the assistant writes into opens on a spring, a little past its size; it still leaves as every sheet does. */
const SPRUNG = 'data-[state=open]:animate-sheet'

const popoverContentVariants = cva(
  [floatingSheet, floatingMotion, 'origin-(--radix-popover-content-transform-origin)'],
  {
    variants: {
      size: {
        default: 'w-72 p-1',
        /** A list to pick from, in sections divided by rules (`PopoverSection`). */
        menu: 'flex w-80 flex-col p-0',
        /** The sidebar, opened from the top bar on a narrow window: ink, as the sidebar is. */
        nav: 'flex max-h-[80dvh] w-64 flex-col bg-sidebar p-0 py-2 text-sidebar-foreground',
        /** A log or a long reading, as wide as the window allows. */
        wide: 'w-[min(520px,calc(100vw-280px))] p-2',
        /** A few fields under their labels. */
        form: 'flex w-72 flex-col gap-4 p-3',
        /**
         * A request to write and the reply under it, in sections (`PopoverSection`).
         * Asked for once per reply, it springs open from its button (`animate-sheet`).
         */
        compose: ['flex w-[min(440px,calc(100vw-32px))] flex-col p-0', FITS, SPRUNG],
        /** The same, for a reply as long as a file. */
        'compose-wide': ['flex w-[min(640px,calc(100vw-32px))] flex-col p-0', FITS, SPRUNG],
        /** What a screen is for and the words it uses, in sections (`PopoverSection`). */
        help: 'flex w-[min(340px,calc(100vw-32px))] flex-col p-0',
        /** One word and what it means, beside the word. */
        note: 'flex w-64 flex-col gap-1 px-3 py-2.5',
        /** The list under a field (`ComboBox`): as wide as the field it opens from. */
        field: 'flex w-(--radix-popover-trigger-width) min-w-40 flex-col p-0',
        /** A row of actions over a selection in the editor: as wide as its buttons. */
        selection: 'flex w-auto flex-row items-center gap-0.5 p-1',
      },
      /** Opened from the keyboard many times a day: no animation at all. */
      still: {
        true: 'data-[state=closed]:animate-none data-[state=open]:animate-none',
        false: '',
      },
    },
    defaultVariants: { size: 'default', still: false },
  },
)

/**
 * Scales in from its trigger (Radix sets the origin) in 150ms and fades out
 * faster than it came.
 */
function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  size,
  still,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> &
  VariantProps<typeof popoverContentVariants>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        data-surface={size === 'nav' ? 'ink' : undefined}
        align={align}
        sideOffset={sideOffset}
        className={cn(popoverContentVariants({ size, still }), className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

const popoverSectionVariants = cva('flex flex-col [&+&]:border-t', {
  variants: {
    pad: {
      /** Rows to pick from, each with its own padding. */
      rows: 'gap-px p-1',
      /** Text to read. */
      text: 'gap-2 p-3',
    },
    /** Scrolls on its own when the list runs long. Rows keep their height: a flex column would squeeze them to fit. */
    scroll: {
      true: 'max-h-80 overflow-y-auto overscroll-contain *:shrink-0',
      false: '',
    },
  },
  defaultVariants: { pad: 'rows', scroll: false },
})

/** One part of a `menu` popover: a search, a list, a footer. Parts are divided by a rule. */
function PopoverSection({
  className,
  pad,
  scroll,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof popoverSectionVariants>) {
  return <div className={cn(popoverSectionVariants({ pad, scroll }), className)} {...props} />
}

const popoverActionVariants = cva(
  [
    floatingRow,
    'focus-ring-inset transition-[background-color] duration-150 ease-out disabled:pointer-events-none disabled:opacity-50',
  ],
  {
    variants: {
      tone: {
        default: [floatingRowTone.default, 'hover:bg-accent'],
        /** It deletes something the reader made, as `destructive-ghost`. */
        destructive: [
          floatingRowTone.destructive,
          'hover:bg-destructive/10 dark:hover:bg-destructive/20',
        ],
      },
    },
    defaultVariants: { tone: 'default' },
  },
)

/** A row that does something, in a section of rows: an icon, what it does, and its shortcut. */
function PopoverAction({
  icon,
  hint,
  tone,
  className,
  children,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof popoverActionVariants> & {
    icon?: React.ReactNode
    /** A shortcut, at the far edge. */
    hint?: string
  }) {
  return (
    <button type="button" className={cn(popoverActionVariants({ tone }), className)} {...props}>
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint ? <kbd className="font-sans text-xs text-muted-foreground">{hint}</kbd> : null}
    </button>
  )
}

/** The name of a list inside a popover, or a line in place of an empty one. */
function PopoverLabel({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      className={cn('m-0 px-2 py-1.5 text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverAction,
  PopoverAnchor,
  PopoverContent,
  PopoverLabel,
  PopoverSection,
  PopoverTrigger,
}
