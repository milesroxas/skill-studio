/**
 * A confirmation the caller awaits: `const ok = await confirm({ title })`. The
 * shell renders the one dialog; screens get `confirm` from the context.
 */
import { type ReactNode, useCallback, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog.tsx'

export interface ConfirmOptions {
  title: string
  description?: string
  /** The confirming button's label. */
  action?: string
  /** A destructive action gets the destructive button. */
  destructive?: boolean
}

export type Confirm = (options: ConfirmOptions) => Promise<boolean>

interface Pending {
  options: ConfirmOptions
  resolve: (ok: boolean) => void
}

export function useConfirm(): [Confirm, ReactNode] {
  const [pending, setPending] = useState<Pending | null>(null)
  const confirm = useCallback<Confirm>(
    (options) => new Promise((resolve) => setPending({ options, resolve })),
    [],
  )
  const settle = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }
  const options = pending?.options
  const dialog = (
    <AlertDialog open={pending !== null} onOpenChange={(open) => !open && settle(false)}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{options?.title}</AlertDialogTitle>
          {options?.description ? (
            <AlertDialogDescription>{options.description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={options?.destructive ? 'destructive' : 'default'}
            onClick={() => settle(true)}
          >
            {options?.action ?? 'Continue'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
  return [confirm, dialog]
}
