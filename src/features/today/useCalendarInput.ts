import { useEffect, useMemo, useState } from 'react'
import { useData } from '../../store/DataContext'
import { dayOrder } from '../../config/plan'
import { FLEX_ROUTINES, type FlexRoutineKey } from '../../config/flexRoutines'
import { calorieGoalOn } from '../../lib/calories'
import { cardioSessionsForWeek } from '../../lib/cardioPlan'
import { upcomingSessions, type Upcoming } from '../../lib/calendarSync'
import { toISODate } from '../../lib/dates'
import { hasPillar, ownerFlavour, PILLARS } from '../../lib/profile'
import { nextStretchRoutine, otherStretchRoutine } from '../../lib/stretchRotation'
import type { WeekCalendarInput } from '../../lib/weekCalendar'

/** Today's date, re-read each minute so a screen left open rolls over at midnight. */
function useToday(): string {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  return toISODate(now)
}

/**
 * Everything lib/weekCalendar needs to lay out a week, bar which week: the one
 * reading of the account's data that the calendar on Today, the calendar file
 * and the Google sync all share, so the three can't disagree about what is
 * planned.
 */
export function useCalendarInput(): Omit<WeekCalendarInput, 'weekStart' | 'plannedCardio'> {
  const { workouts, plan, flexEntries, cardioEntries, calorieEntries, settings } = useData()
  const profile = settings.profile
  const today = useToday()
  const pillars = useMemo(() => PILLARS.filter((p) => hasPillar(profile, p)), [profile])
  return useMemo(() => {
    // The same "up next" Today's buttons show: the owner's focus is head to
    // toe; anyone else's two routines take turns.
    const next: FlexRoutineKey = ownerFlavour(profile) ? 'head_to_toe' : nextStretchRoutine(flexEntries)
    return {
      today,
      pillars,
      workouts,
      liftDays: dayOrder(plan).filter((t) => plan[t].exercises.length > 0),
      liftLabels: { push: plan.push.label, pull: plan.pull.label, fullbody: plan.fullbody.label },
      flexEntries,
      stretchRotation: ownerFlavour(profile) ? [next] : [next, otherStretchRoutine(next)],
      stretchLabels: { side_split: FLEX_ROUTINES.side_split.label, head_to_toe: FLEX_ROUTINES.head_to_toe.label },
      cardioEntries,
      calorieEntries,
      calorieGoalOn,
      dietDirection: profile?.dietDirection ?? 'gain',
      pins: settings.calendarPins,
      weekPins: settings.calendarWeeks,
    }
  }, [
    today,
    pillars,
    workouts,
    plan,
    flexEntries,
    cardioEntries,
    calorieEntries,
    profile,
    settings.calendarPins,
    settings.calendarWeeks,
  ])
}

/** The sessions from today on that the calendar file and the Google sync carry (see lib/calendarSync). */
export function useUpcomingSessions(): Upcoming {
  const input = useCalendarInput()
  const { settings } = useData()
  const cardioPlan = settings.cardioPlan
  return useMemo(() => upcomingSessions(input, (week) => cardioSessionsForWeek(cardioPlan, week)), [input, cardioPlan])
}
