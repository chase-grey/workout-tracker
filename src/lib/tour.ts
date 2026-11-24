/**
 * The first-run tour: a handful of steps, one idea each, shown in turn in a
 * card that floats over the app while guide mode is on.
 *
 * It walks the tabs left to right, and each step says why the thing it points
 * at gets a person to their goal rather than how to press it. The steps are
 * data and the rules for which ones a person gets, where they are in them and
 * where the card sits are pure, so the overlay that draws them has nothing to
 * decide. Progress is a list of the ids already seen, kept in Settings, rather
 * than a position: a step added later shows up for someone mid-tour without
 * moving the ones behind them, and a step a person doesn't track (see `needs`)
 * is simply never in their list.
 */

import { hasPillar, type Pillar, type Profile } from './profile'

/** The tabs a step can be about; the bottom bar's own ids. */
export type TourTab = 'today' | 'progress' | 'coach' | 'settings'

export type TourStep = {
  id: string
  /** The tab that is open behind the card while this step is up. */
  tab: TourTab
  /**
   * The card on that tab the step lights up, by its id in the tab's stack.
   * Without one the step is about the tab as a whole, and lights its icon.
   */
  card?: string
  title: string
  body: string
  /** The pillar a person must be tracking to be told about this. */
  needs?: Pillar
  /** Only for someone with the coach switched on. */
  needsCoach?: boolean
}

/** In the order they are shown: down Today, then along the bar. */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'week',
    tab: 'today',
    card: 'week',
    title: 'your week',
    body: 'results come from showing up week after week, not from one big day. hit each weekly goal and your streak grows, so this is the card to keep an eye on.',
  },
  {
    id: 'food',
    tab: 'today',
    card: 'calories',
    title: 'what you eat',
    body: 'food decides which way your weight moves. one tap each time you eat keeps the day honest, without weighing every bite.',
    needs: 'diet',
  },
  {
    id: 'start',
    tab: 'today',
    card: 'tiles',
    title: 'getting started',
    body: 'one tap starts a workout, a stretch or a cardio log. the less it takes to start, the more often you will.',
  },
  {
    id: 'progressTab',
    tab: 'progress',
    title: 'progress',
    body: 'your goals, and the trend toward each one. a single day tells you nothing; the line over weeks shows whether what you are doing is working.',
  },
  {
    id: 'coachTab',
    tab: 'coach',
    title: 'coach',
    body: 'ask it anything about your training or food. it can see how you are doing, and change your plan when you stall or life gets in the way.',
    needsCoach: true,
  },
  {
    id: 'settingsTab',
    tab: 'settings',
    title: 'settings',
    body: 'your plan, your goals and what you track all change here. a plan that fits your life is one you will keep.',
  },
]

/** What Settings remembers of the tour. */
export type TourState = { seen: readonly string[]; done: boolean }

export const FRESH_TOUR: TourState = { seen: [], done: false }

/**
 * The steps this person gets: those whose pillar they track, with the coach's
 * step only when the coach is on.
 */
export function tourSteps(
  profile: Profile | null | undefined,
  coachOn: boolean,
  steps: readonly TourStep[] = TOUR_STEPS,
): TourStep[] {
  return steps.filter((s) => (!s.needs || hasPillar(profile, s.needs)) && (!s.needsCoach || coachOn))
}

/** The step to show now, or null when the tour is over. */
export function currentTourStep(steps: readonly TourStep[], state: TourState): TourStep | null {
  if (state.done) return null
  return steps.find((s) => !state.seen.includes(s.id)) ?? null
}

/** Where `step` falls among the steps, for "2 of 5". */
export function tourPosition(steps: readonly TourStep[], step: TourStep): { index: number; total: number } {
  return { index: steps.findIndex((s) => s.id === step.id) + 1, total: steps.length }
}

/** `next`: the step is seen; seeing the last one ends the tour. */
export function advanceTour(steps: readonly TourStep[], state: TourState, id: string): TourState {
  const seen = state.seen.includes(id) ? [...state.seen] : [...state.seen, id]
  const next: TourState = { seen, done: state.done }
  return { ...next, done: next.done || currentTourStep(steps, next) === null }
}

/** `skip tour`: over, and it stays over. */
export function skipTour(state: TourState): TourState {
  return { seen: [...state.seen], done: true }
}

/** The tour from the top, for the settings button. */
export function restartTour(): TourState {
  return { seen: [], done: false }
}

/** A box on the screen, in viewport pixels. */
export type TourBox = { top: number; left: number; width: number; height: number }

/**
 * The part of `target` that is on screen between `top` and `bottom`, grown by
 * `pad` so the light doesn't sit hard against what it is lighting. Null when
 * none of it is: a card scrolled away, or one that has no size yet.
 */
export function tourSpot(
  target: TourBox,
  bounds: { top: number; bottom: number; width: number },
  pad: number,
): TourBox | null {
  if (target.width <= 0 || target.height <= 0) return null
  const top = Math.max(target.top - pad, bounds.top)
  const bottom = Math.min(target.top + target.height + pad, bounds.bottom)
  const left = Math.max(target.left - pad, 0)
  const right = Math.min(target.left + target.width + pad, bounds.width)
  if (bottom - top <= 0 || right - left <= 0) return null
  return { top, left, width: right - left, height: bottom - top }
}

/**
 * Where the top of the tour's card goes, given what it is pointing at.
 *
 * Under the lit box when it fits there, over it when it only fits there, and
 * otherwise against the bottom of the screen, across the lit box: a card as
 * tall as the screen leaves nowhere clear of it. With nothing lit the card
 * sits in the middle.
 */
export function tourCardTop(spot: TourBox | null, cardHeight: number, viewHeight: number, gap: number): number {
  const lowest = Math.max(gap, viewHeight - cardHeight - gap)
  if (!spot) return Math.max(gap, (viewHeight - cardHeight) / 2)
  const below = spot.top + spot.height + gap
  if (below <= lowest) return below
  const above = spot.top - gap - cardHeight
  if (above >= gap) return above
  return lowest
}
