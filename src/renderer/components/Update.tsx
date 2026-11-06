/**
 * The app's own update, where the reader meets it: one button at the head of
 * the sidebar's foot, under the same rule as the app's places, that is there
 * only while an update is. One click takes the step in hand, and the button
 * says which: download it, or restart into it. A download shows how far it has
 * come and asks for nothing. Resting the pointer on the button opens what the
 * update brings: its number, how long it has been out, and its notes.
 *
 * It moves only when its state does, a few times per release. The button folds
 * in and out so the sidebar above it never jumps, the icon and the label change
 * places with the state, and the bar follows the download.
 */
import { releasedAgo, type Update, type UpdateState } from '@domain/update.ts'
import { cva } from 'class-variance-authority'
import {
  ArrowDownToLineIcon,
  LoaderCircleIcon,
  type LucideIcon,
  RotateCwIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { useState } from 'react'
import { api } from '../api.ts'
import type { ShowToast } from '../hooks.ts'
import { cn } from '../lib/utils.ts'
import { useArrived } from '../motion.ts'
import { offerOf, useUpdate, useUpdateStep } from '../updates.ts'
import type { Confirm } from './confirm.tsx'
import { Prose } from './Prose.tsx'
import { Heading, Hint, VisuallyHidden } from './text.tsx'
import { Button } from './ui/button.tsx'
import {
  HoverCard,
  HoverCardContent,
  HoverCardSection,
  HoverCardTrigger,
} from './ui/hover-card.tsx'

/**
 * How far a download has come, as a hairline along the foot of whatever holds
 * it. Only its scale and opacity move. It is decoration: the percentage beside
 * it is what is read.
 */
export function ProgressLine({ percent, active }: { percent: number; active: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-active={active || undefined}
      className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left bg-current opacity-0 transition-[transform,opacity] duration-300 ease-linear data-active:opacity-60"
      style={{ transform: `scaleX(${percent / 100})` }}
    />
  )
}

const control = cva(
  // 7px and the 1px border: the icon and the label stand in the columns the places below keep.
  'group/update relative flex h-8 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-sm border bg-background px-1.75 text-left text-ui font-medium shadow-xs outline-none transition-[background-color,border-color,box-shadow,scale] duration-150 ease-out focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:border-input dark:bg-input/30 pointer-coarse:h-11',
  {
    variants: {
      /** A step waits to be taken, or one is under way and there is nothing to press. */
      waits: {
        true: 'hover:bg-accent active:scale-[0.96] dark:hover:bg-input/50',
        false: 'cursor-default',
      },
      tone: {
        default: 'text-sidebar-foreground',
        destructive: 'text-destructive',
      },
    },
  },
)

/**
 * The icon answers the pointer with the step it stands for: down for a
 * download, round for a restart. Only while the row waits for a click.
 */
const icon = cva('size-4 transition-transform duration-200 ease-out', {
  variants: {
    kind: {
      download: 'group-data-waits/update:group-hover/update:translate-y-0.5',
      restart: 'group-data-waits/update:group-hover/update:rotate-90',
      working: 'animate-spin',
      problem: '',
    },
  },
})

type IconKind = 'download' | 'restart' | 'working' | 'problem'

const ICONS: Record<IconKind, LucideIcon> = {
  download: ArrowDownToLineIcon,
  restart: RotateCwIcon,
  working: LoaderCircleIcon,
  problem: TriangleAlertIcon,
}

interface View {
  icon: IconKind
  label: string
  /** Where the update stands, at the head of the card the button opens. */
  heading: string
  /** What went wrong, under the heading. */
  problem?: string
  /** The state in a sentence, read out when it changes. */
  announce: string
  update: Update
}

/** What the row shows for a state, or null for a state with nothing to offer. */
function viewOf(state: UpdateState): View | null {
  switch (state.status) {
    case 'available': {
      const { update } = state
      return {
        icon: 'download',
        label: 'Download update',
        heading: 'Update ready to download',
        announce: `Skill Studio ${update.version} is available.`,
        update,
      }
    }
    case 'downloading': {
      const { update } = state
      return {
        icon: 'download',
        label: 'Downloading',
        heading: 'Downloading update',
        announce: `Downloading Skill Studio ${update.version}.`,
        update,
      }
    }
    case 'ready': {
      const { update } = state
      return {
        icon: 'restart',
        label: 'Restart to update',
        heading: 'Update ready to install',
        announce: `Skill Studio ${update.version} is ready. Restart to install it.`,
        update,
      }
    }
    case 'installing': {
      const { update } = state
      return {
        icon: 'working',
        label: 'Restarting…',
        heading: 'Restarting to update',
        announce: 'Restarting to update.',
        update,
      }
    }
    case 'error':
      // A check that failed has no release to show: the changelog's window says so where it was asked.
      return state.update
        ? {
            icon: 'problem',
            label: 'Retry update',
            heading: 'The update did not go through',
            problem: state.message,
            announce: `The update failed. ${state.message}`,
            update: state.update,
          }
        : null
    default:
      return null
  }
}

/**
 * What the update brings, in the card the button opens: where it stands, its
 * number and how long it has been out, then its notes. The way to every
 * release is at its foot.
 */
function UpdateNotes({ view, onChangelog }: { view: View; onChangelog: () => void }) {
  const { version, date, notes } = view.update
  const ago = releasedAgo(date, Date.now())
  return (
    <HoverCardContent side="top">
      <HoverCardSection part="head">
        <Heading level={3} as="p">
          {view.heading}
        </Heading>
        <Hint className="tabular-nums">{ago ? `${version} · ${ago}` : version}</Hint>
        {view.problem ? <Hint tone="destructive">{view.problem}</Hint> : null}
      </HoverCardSection>
      <HoverCardSection>
        {notes ? (
          <Prose text={notes} density="notes" />
        ) : (
          <Hint>This release came without notes the app can show.</Hint>
        )}
      </HoverCardSection>
      <HoverCardSection part="foot">
        <Button type="button" variant="link-muted" size="inline-sm" onClick={onChangelog}>
          See every release
        </Button>
      </HoverCardSection>
    </HoverCardContent>
  )
}

export function UpdateControl({ confirm, toast }: { confirm: Confirm; toast: ShowToast }) {
  const state = useUpdate()
  const take = useUpdateStep(confirm, toast)
  const open = viewOf(state) !== null
  // The last state shown stays in the button while it folds away, so it leaves whole.
  const [shown, setShown] = useState(state)
  if (open && state !== shown) setShown(state)
  const arrived = useArrived(shown.status)
  // The card opens under the pointer and steps aside for a click, so it never covers what the click brings.
  const [peeking, setPeeking] = useState(false)
  const host = api.updates
  if (!host) return null

  const view = viewOf(shown)
  const offer = offerOf(shown)
  const Icon = view ? ICONS[view.icon] : null
  const downloading = shown.status === 'downloading'
  const percent = downloading ? shown.percent : shown.status === 'available' ? 0 : 100

  return (
    <>
      <VisuallyHidden role="status">{open && view ? view.announce : ''}</VisuallyHidden>
      <section
        aria-label="Update"
        data-open={open || undefined}
        inert={!open}
        className="grid shrink-0 grid-rows-[0fr] transition-[grid-template-rows] duration-200 ease-out-strong data-open:grid-rows-[1fr] data-open:duration-300"
      >
        <div className="min-h-0 overflow-hidden">
          {view && Icon ? (
            <div className="flex px-2 pt-2 opacity-0 transition-opacity duration-150 ease-out in-data-open:opacity-100 in-data-open:duration-300">
              <HoverCard open={open && peeking} onOpenChange={setPeeking}>
                <HoverCardTrigger asChild>
                  <button
                    type="button"
                    className={control({
                      waits: offer !== null,
                      tone: view.icon === 'problem' ? 'destructive' : 'default',
                    })}
                    data-waits={offer !== null || undefined}
                    aria-disabled={offer === null || undefined}
                    onClick={() => {
                      if (!offer) return
                      setPeeking(false)
                      take(offer.step)
                    }}
                  >
                    <span
                      key={view.icon}
                      className={cn(
                        'flex shrink-0',
                        arrived && 'animate-in duration-300 ease-out-strong fade-in-0 zoom-in-50',
                      )}
                    >
                      <Icon aria-hidden="true" className={icon({ kind: view.icon })} />
                    </span>
                    <span
                      key={view.label}
                      className={cn(
                        'min-w-0 flex-1 truncate',
                        arrived &&
                          'animate-in duration-200 ease-out-strong fade-in-0 slide-in-from-bottom-1',
                      )}
                    >
                      {view.label}
                    </span>
                    {downloading ? (
                      <span className="text-xs font-normal text-muted-foreground tabular-nums">
                        {Math.round(shown.percent)}%
                      </span>
                    ) : null}
                    <ProgressLine percent={percent} active={downloading} />
                  </button>
                </HoverCardTrigger>
                <UpdateNotes view={view} onChangelog={() => host.openChangelog()} />
              </HoverCard>
            </div>
          ) : null}
        </div>
      </section>
    </>
  )
}
