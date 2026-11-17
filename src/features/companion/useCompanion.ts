import { useReducer, useRef } from 'react'
import { useData } from '../../store/DataContext'
import type { CompanionState } from '../../lib/companion/apply'
import type { CardioContext } from '../../lib/companion/cardio'
import { clearAiChange, lastAiChange, saveAiChange, undoneCardioPlan } from '../../lib/companion/undo'
import { liftingWeekdays } from '../../lib/cardioPlan'
import { currentWeeklyGoals } from '../../lib/weeklyStreak'
import { hasPillar, withWeeklyGoals } from '../../lib/profile'
import { trainingDates } from '../../lib/session'
import { toISODate, weekStartISO } from '../../lib/dates'
import { showUpdateToast } from '../../lib/version'

/**
 * The live plan, weekly goal and cardio plan as a companion sees them, and the
 * two ways to act on its reply: commit it (keeping the undo snapshot and
 * offering undo in the toast) and undo the last one.
 *
 * A device with no profile is the owner's, whose weekly goals are the shipped
 * history rather than anything a reply can edit, so its weekly goal is null.
 * Cardio is offered where it's one of the person's pillars, or where the
 * companion was opened on cardio (`cardio`), as the welcome page does before
 * there is a profile to hold the pillar; elsewhere there's no context to
 * apply a cardio line against, and the parser says so.
 */
export function useCompanion({ cardio: onCardio = false }: { cardio?: boolean } = {}) {
  const { plan, updatePlan, settings, updateSettings, workouts, cardioEntries } = useData()
  const [, bump] = useReducer((n: number) => n + 1, 0)
  // The toast's undo runs after this render's settings have moved on.
  const latest = useRef(settings)
  latest.current = settings

  const profile = settings.profile
  const weekly = profile ? currentWeeklyGoals().workouts : 0
  const today = toISODate(new Date())
  const state: CompanionState = {
    plan,
    weeklyWorkouts: profile && weekly > 0 ? weekly : null,
    ...(settings.cardioPlan ? { cardioPlan: settings.cardioPlan } : {}),
  }
  const cardio: CardioContext | undefined = onCardio || hasPillar(profile, 'cardio')
    ? {
        today,
        entries: cardioEntries,
        liftDays: liftingWeekdays(trainingDates(workouts), today),
        weeklyCardio: currentWeeklyGoals().cardio,
      }
    : undefined

  const undo = () => {
    const snap = lastAiChange()
    if (!snap) return
    if (!snap.liftsUntouched) updatePlan(snap.plan)
    let now = latest.current
    if (snap.weeklyGoals && now.profile) now = { ...now, profile: { ...now.profile, weeklyGoals: snap.weeklyGoals } }
    const cardioPlan = undoneCardioPlan(snap, now.cardioPlan, toISODate(new Date()))
    if (cardioPlan) now = { ...now, cardioPlan }
    if (now !== latest.current) updateSettings(now)
    clearAiChange()
    bump()
    showUpdateToast('AI change undone')
  }

  const commit = (next: CompanionState, summary: string) => {
    const weeklyMoved = next.weeklyWorkouts !== state.weeklyWorkouts && next.weeklyWorkouts != null
    const cardioMoved = next.cardioPlan !== state.cardioPlan
    const liftsMoved = next.plan !== plan
    saveAiChange({
      at: new Date().toISOString(),
      summary,
      plan,
      ...(weeklyMoved && profile ? { weeklyGoals: profile.weeklyGoals } : {}),
      ...(cardioMoved ? { cardioPlan: state.cardioPlan ?? null } : {}),
      ...(liftsMoved ? {} : { liftsUntouched: true }),
    })
    if (liftsMoved) updatePlan(next.plan)
    let nextSettings = settings
    if (weeklyMoved && profile) {
      const goals = { ...currentWeeklyGoals(), workouts: next.weeklyWorkouts! }
      nextSettings = { ...nextSettings, profile: withWeeklyGoals(profile, goals, weekStartISO(toISODate(new Date()))) }
    }
    if (cardioMoved) nextSettings = { ...nextSettings, cardioPlan: next.cardioPlan }
    if (nextSettings !== settings) updateSettings(nextSettings)
    bump()
    showUpdateToast(cardioMoved && !liftsMoved && !weeklyMoved ? 'cardio plan updated' : 'plan updated', {
      label: 'undo',
      run: undo,
    })
  }

  return { state, cardio, workouts, profile, heightIn: settings.heightIn, commit, undo, last: lastAiChange() }
}
