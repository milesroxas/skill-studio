/** Files dropped on an element from outside the window. */
import { type DragEvent, useState } from 'react'

/**
 * Take what is dropped on an element. `over` is true while a file is held
 * above it, for the element to show where the drop will land. Where one such
 * element is inside another, the inner one takes the drop and the outer never
 * hears of it. `onDrop` gets the transfer while the drop is still being
 * handled: what it holds can only be read then.
 */
export function useFileDrop(onDrop: (data: DataTransfer) => void) {
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
        onDrop(event.dataTransfer)
      },
    },
  }
}
