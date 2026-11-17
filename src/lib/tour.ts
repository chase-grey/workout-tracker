/**
 * The first-run tour: a handful of cards, one idea each, shown in turn on Today
 * while guide mode is on.
 *
 * The steps are data and the rules for which ones a person gets and where they
 * are in them are pure, so the card that renders them has nothing to decide.
 * Progress is a list of the ids already seen, kept in Settings, rather than a
 * position: a step added later shows up for someone mid-tour without moving
 * the ones behind them, and a step a person doesn't track (see `needs`) is
 * simply never in their list.
 */

import { hasPillar, type Pillar, type Profile } from './profile'

/** Where on Today a step's card sits, above the control it is about. */
export type TourAnchor = 'week' | 'habits' | 'tiles'

export type TourStep = {
  id: string
  anchor: TourAnchor
  title: string
  body: string
  /** Added to the body when the coach is switched on. */
  coachBody?: string
  /** The pillar a person must be tracking to be told about this. */
  needs?: Pillar
}

/** In the order they are shown. */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'tiles',
    anchor: 'tiles',
    title: 'quick tiles',
    body: 'these start a workout or a stretch, or log cardio. hold one to rearrange or remove it, or tap edit.',
  },
  {
    id: 'streak',
    anchor: 'week',
    title: 'your weekly streak',
    body: 'hit every weekly goal you track, monday to sunday, and the streak goes up by one. tap the flame to see past weeks.',
  },
  {
    id: 'freeze',
    anchor: 'week',
    title: 'streak freezes',
    body: 'in a week where you hit every goal, each extra day over a goal banks a freeze. a short week spends one freeze for each day it missed, less any extra days elsewhere. with none to spend, the streak resets.',
  },
  {
    id: 'calories',
    anchor: 'habits',
    title: 'logging calories',
    body: 'tap +100 or +500 each time you eat. tap a day to log for it, and −100 takes some back.',
    needs: 'diet',
  },
  {
    id: 'plan',
    anchor: 'tiles',
    title: 'your workout plan',
    body: 'in edit mode, the pencil on a workout tile opens that day to change. the whole plan is in settings too.',
    coachBody: 'or ask the coach to change it for you.',
    needs: 'strength',
  },
  {
    id: 'progress',
    anchor: 'tiles',
    title: 'where progress lives',
    body: 'the progress tab keeps your weight, lifts and streak history.',
  },
]

/** What Settings remembers of the tour. */
export type TourState = { seen: readonly string[]; done: boolean }

export const FRESH_TOUR: TourState = { seen: [], done: false }

/** The steps this person gets: those whose pillar they track, or that need none. */
export function tourSteps(
  profile: Profile | null | undefined,
  steps: readonly TourStep[] = TOUR_STEPS,
): TourStep[] {
  return steps.filter((s) => !s.needs || hasPillar(profile, s.needs))
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

/** A step's body as this person should read it. */
export function tourBody(step: TourStep, coachOn: boolean): string {
  return coachOn && step.coachBody ? `${step.body} ${step.coachBody}` : step.body
}
