/**
 * The question before the app starts over. It cannot be undone, so the dialog
 * says both halves in full: what is deleted, and what is not. The second half
 * is the one a person needs before they can agree. Cancel has the focus when
 * it opens, so a stray Return deletes nothing.
 */
import { List, Stack } from './layout.tsx'
import { Heading, Text } from './text.tsx'
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

const DELETED = [
  'Your preferences, and the folders and recent skills the Library remembers',
  'Drafts you have not saved',
  'The practice skill, with its runs and ratings',
  'The Assistant’s conversation',
  'The version you deleted last, which Undo could still bring back',
]

const KEPT = ['Your skills, with their cases, runs and versions', 'Your stored keys']

interface Props {
  open: boolean
  /** A run is going, and starting over stops it. */
  running: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ResetDialog({ open, running, onCancel, onConfirm }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset Skill Studio?</AlertDialogTitle>
          <AlertDialogDescription>
            Every window closes, and the app opens again on the welcome, as it does the first time.
            This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Stack gap="lg">
          <Stack gap="sm">
            <Heading level={3}>Deleted</Heading>
            <List gap="sm">
              {DELETED.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </List>
          </Stack>
          <Stack gap="sm">
            <Heading level={3}>Kept</Heading>
            <List gap="sm">
              {KEPT.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </List>
          </Stack>
          {running ? (
            <Text as="p" tone="warning">
              A run is going. Resetting stops it.
            </Text>
          ) : null}
        </Stack>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Reset Skill Studio
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
