/**
 * What `RowActions`, `MoreActions` and `ContextActions` decide before they
 * draw anything, kept apart from them so it can be tested.
 */
import { Children, Fragment, isValidElement, type ReactNode } from 'react'

/**
 * Whether `actions` holds anything to draw. A screen writes its actions once,
 * often as a fragment of parts each shown only sometimes, so a fragment counts
 * by what is inside it, and one holding only nulls is empty.
 */
export function hasActions(actions: ReactNode): boolean {
  return Children.toArray(actions).some((child) =>
    isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment
      ? hasActions(child.props.children)
      : true,
  )
}

/** What a right-click lands in. */
export interface ClickedOn {
  /** A field to type in, or a frame with a page of its own. */
  typing: boolean
  /** Text the reader selected, inside what was clicked. */
  selected: boolean
}

/**
 * Whether a right-click keeps the system's own menu instead of the actions:
 * Cut, Copy and Paste in a field, Copy over selected text. The reader came to
 * do something to the text, not to the row it sits in.
 */
export const keepsTextMenu = ({ typing, selected }: ClickedOn): boolean => typing || selected
