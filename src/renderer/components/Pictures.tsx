/**
 * Pictures as the app shows them wherever one is attached: a row of small
 * squares. A square opens its picture full size; its corner button takes it
 * off the list. One being added holds its place as an empty square, so the
 * row does not jump when it arrives.
 */
import type { ImageRef } from '@domain/image.ts'
import { cva, type VariantProps } from 'class-variance-authority'
import { ImagePlusIcon, XIcon } from 'lucide-react'
import { type DragEvent, type ReactNode, useRef, useState } from 'react'
import { api } from '../api.ts'
import { picturesIn } from '../images.ts'
import { CornerButton } from './CornerButton.tsx'
import { Button } from './ui/button.tsx'

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'

const thumbVariants = cva(
  // The picture is the surface: one hairline keeps a white screenshot off a white page.
  'relative block shrink-0 overflow-hidden rounded-sm border bg-muted focus-ring transition-[border-color,box-shadow] duration-150 ease-out',
  {
    variants: {
      size: {
        /** Beside a line of text, such as a message being written. */
        sm: 'size-10',
        /** In a form, where the picture is the field's value. */
        md: 'size-16',
      },
    },
    defaultVariants: { size: 'md' },
  },
)

type ThumbSize = VariantProps<typeof thumbVariants>['size']

interface PictureProps {
  image: ImageRef
  size?: ThumbSize
  /** Present when the picture can be taken off; the label names what it is taken from. */
  onRemove?: () => void
}

/** One picture. Wrapped in a positioned box so the remove button can sit on its corner. */
function Picture({ image, size, onRemove }: PictureProps) {
  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        className={thumbVariants({ size })}
        aria-label={`Open ${image.name}`}
        title={image.name}
        onClick={() => api.openImage(image)}
      >
        <img
          src={api.imageUrl(image)}
          alt=""
          draggable={false}
          className="size-full object-cover"
        />
      </button>
      {onRemove ? (
        <button
          type="button"
          // 16px to look at, 32px to hit (44px under a finger): the pseudo-element reaches past the
          // corner. The ring cuts it out of the picture, so it reads on a white screenshot and a dark
          // photo alike.
          className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-foreground text-background ring-2 ring-background focus-ring transition-[scale,box-shadow] duration-150 ease-out before:absolute before:-inset-2 pointer-coarse:before:-inset-3.5 active:scale-[0.96]"
          aria-label={`Remove ${image.name}`}
          title="Remove"
          onClick={onRemove}
        >
          <XIcon aria-hidden="true" className="size-2.5" strokeWidth={3} />
        </button>
      ) : null}
    </span>
  )
}

const stripVariants = cva('m-0 flex list-none flex-wrap items-center p-0', {
  variants: {
    size: {
      sm: 'gap-2',
      md: 'gap-3',
    },
  },
  defaultVariants: { size: 'md' },
})

interface PictureStripProps {
  images: ImageRef[]
  size?: ThumbSize
  /** How many more are on their way: each holds a square. */
  adding?: number
  onRemove?: (image: ImageRef) => void
  /** What the row is, read to assistive technology. */
  label: string
  /** A control at the end of the row, such as the button that adds one. */
  children?: ReactNode
  className?: string
}

export function PictureStrip({
  images,
  size,
  adding = 0,
  onRemove,
  label,
  children,
  className,
}: PictureStripProps) {
  return (
    <ul aria-label={label} className={stripVariants({ size, className })}>
      {images.map((image) => (
        <li key={image.upload ?? image.file} className="flex">
          <Picture image={image} size={size} onRemove={onRemove && (() => onRemove(image))} />
        </li>
      ))}
      {Array.from({ length: adding }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders are interchangeable
        <li key={`adding-${i}`} className="flex" aria-label="Adding a picture">
          <span className={thumbVariants({ size, className: 'animate-pulse' })} />
        </li>
      ))}
      {children ? <li className="flex">{children}</li> : null}
    </ul>
  )
}

interface PicturePickerProps {
  onFiles: (files: File[]) => void
  /**
   * `button` names what it adds; `icon-sm` sits in a row of controls; `corner`
   * is a `CornerButton` in a text field's corner, for the picture its text is about.
   */
  variant?: 'icon-sm' | 'button' | 'corner'
  /** What it adds to, read to assistive technology and shown on the button form. */
  label: string
  /** One picture at a time, for a field that holds one. */
  single?: boolean
  disabled?: boolean
}

/** The button that opens the file picker for pictures. */
export function PicturePicker({
  onFiles,
  variant = 'button',
  label,
  single,
  disabled,
}: PicturePickerProps) {
  const input = useRef<HTMLInputElement>(null)
  const open = () => input.current?.click()
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple={!single}
        hidden
        tabIndex={-1}
        onChange={(event) => {
          onFiles([...(event.target.files ?? [])])
          // The same file can be picked again after it is removed.
          event.target.value = ''
        }}
      />
      {variant === 'button' ? (
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={open}>
          <ImagePlusIcon aria-hidden="true" />
          {label}
        </Button>
      ) : variant === 'corner' ? (
        <CornerButton aria-label={label} title={label} disabled={disabled} onClick={open}>
          <ImagePlusIcon aria-hidden="true" />
        </CornerButton>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          title={label}
          disabled={disabled}
          onClick={open}
        >
          <ImagePlusIcon aria-hidden="true" />
        </Button>
      )}
    </>
  )
}

/**
 * Take pictures dropped on an element. `over` is true while one is held above
 * it, for the element to show where the drop will land. Where one such element
 * is inside another, the inner one takes the drop and the outer never hears of it.
 */
export function usePictureDrop(onFiles: (files: File[]) => void) {
  const [over, setOver] = useState(false)
  const carriesFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files')
  return {
    over,
    handlers: {
      onDragOver: (event: DragEvent) => {
        if (!carriesFiles(event)) return
        event.preventDefault()
        event.stopPropagation()
        setOver(true)
      },
      onDragLeave: (event: DragEvent) => {
        // Moving onto a child is not leaving.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false)
      },
      onDrop: (event: DragEvent) => {
        if (!carriesFiles(event)) return
        event.preventDefault()
        event.stopPropagation()
        setOver(false)
        onFiles(picturesIn(event.dataTransfer))
      },
    },
  }
}
