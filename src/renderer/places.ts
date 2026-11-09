/**
 * Every place in the app: its route, the name the sidebar gives it and its
 * icon. The sidebar, the top bar, the welcome tour and the help all read this
 * one list, so a screen is called the same thing wherever it is mentioned.
 */
import {
  BookOpenIcon,
  Columns2Icon,
  CompassIcon,
  LibraryIcon,
  ListChecksIcon,
  type LucideIcon,
  PencilLineIcon,
  PlayIcon,
  SettingsIcon,
} from 'lucide-react'

export interface Place {
  screen: string
  label: string
  icon: LucideIcon
}

/**
 * The loop, top to bottom: write the skill, write the cases that test it,
 * compare what each version made of them. Running is a button in the top bar,
 * not a place: it is the step between the second and the third.
 */
export const SKILL_PLACES: Place[] = [
  { screen: 'editor', label: 'Skill', icon: PencilLineIcon },
  { screen: 'cases', label: 'Cases', icon: ListChecksIcon },
  { screen: 'results', label: 'Results', icon: Columns2Icon },
]

export const APP_PLACES: Place[] = [
  { screen: 'library', label: 'Library', icon: LibraryIcon },
  { screen: 'docs', label: 'Guide', icon: BookOpenIcon },
  { screen: 'settings', label: 'Settings', icon: SettingsIcon },
]

/**
 * Running, which is a button and not a place, so it has no route. Its name and
 * icon are here so the button and the welcome's picture of a run match.
 */
export const RUN: Pick<Place, 'label' | 'icon'> = { label: 'Run', icon: PlayIcon }

/** The welcome: where a first visit lands, and one click from the help ever after. Not in the sidebar. */
export const WELCOME: Place = { screen: 'welcome', label: 'Welcome', icon: CompassIcon }

/** Screens built as a workbench of columns that scroll on their own, not as one scrolling page. */
export const WORKBENCH = new Set(['editor', 'cases', 'results'])

export const placeFor = (screen: string): Place | undefined =>
  [...SKILL_PLACES, ...APP_PLACES, WELCOME].find((p) => p.screen === screen)

export const isSkillScreen = (screen: string): boolean =>
  SKILL_PLACES.some((p) => p.screen === screen)
