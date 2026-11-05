/**
 * Every place in the app: its route, the name the sidebar gives it and its
 * icon. The sidebar, the top bar, the welcome tour and the help all read this
 * one list, so a screen is called the same thing wherever it is mentioned.
 */
import {
  BookOpenIcon,
  ChartColumnIcon,
  Columns2Icon,
  CompassIcon,
  EyeOffIcon,
  HistoryIcon,
  LibraryIcon,
  ListChecksIcon,
  type LucideIcon,
  PencilLineIcon,
  PlayIcon,
  ScaleIcon,
  ScrollTextIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
} from 'lucide-react'

export interface Place {
  screen: string
  label: string
  icon: LucideIcon
}

interface Section {
  label?: string
  places: Place[]
}

/** The loop, top to bottom: write the skill and its cases, run them, review, tune the bench. */
export const SECTIONS: Section[] = [
  {
    places: [
      { screen: 'edit', label: 'Write', icon: PencilLineIcon },
      { screen: 'versions', label: 'Versions', icon: HistoryIcon },
      { screen: 'cases', label: 'Cases', icon: ListChecksIcon },
    ],
  },
  {
    label: 'Runs',
    places: [
      { screen: 'generate', label: 'New run', icon: PlayIcon },
      { screen: 'overview', label: 'Results', icon: ChartColumnIcon },
    ],
  },
  {
    label: 'Review',
    places: [
      { screen: 'blind', label: 'Rate blind', icon: EyeOffIcon },
      { screen: 'compare', label: 'Compare', icon: Columns2Icon },
      { screen: 'transcript', label: 'Transcripts', icon: ScrollTextIcon },
    ],
  },
  {
    label: 'Bench',
    places: [
      { screen: 'insights', label: 'Agreement', icon: ScaleIcon },
      { screen: 'knobs', label: 'Scoring', icon: SlidersHorizontalIcon },
    ],
  },
]

export const APP_PLACES: Place[] = [
  { screen: 'library', label: 'Library', icon: LibraryIcon },
  { screen: 'docs', label: 'Guide', icon: BookOpenIcon },
  { screen: 'settings', label: 'Settings', icon: SettingsIcon },
]

/** The welcome: where a first visit lands, and one click from the help ever after. Not in the sidebar. */
export const WELCOME: Place = { screen: 'welcome', label: 'Welcome', icon: CompassIcon }

/** Screens built as a workbench of columns that scroll on their own, not as one scrolling page. */
export const WORKBENCH = new Set(['edit', 'cases', 'blind', 'knobs'])

const SKILL_PLACES = SECTIONS.flatMap((s) => s.places)

export const placeFor = (screen: string): Place | undefined =>
  [...SKILL_PLACES, ...APP_PLACES, WELCOME].find((p) => p.screen === screen)

export const isSkillScreen = (screen: string): boolean =>
  SKILL_PLACES.some((p) => p.screen === screen)
