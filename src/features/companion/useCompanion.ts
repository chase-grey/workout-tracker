import { useReducer, useRef } from 'react'
import { useData } from '../../store/DataContext'
import type { CompanionState } from '../../lib/companion/apply'
import { clearAiChange, lastAiChange, saveAiChange } from '../../lib/companion/undo'
import { currentWeeklyGoals } from '../../lib/weeklyStreak'
import { withWeeklyGoals } from '../../lib/profile'
import { toISODate, weekStartISO } from '../../lib/dates'
import { showUpdateToast } from '../../lib/version'

/**
 * The live plan and weekly goal as a companion sees them, and the two ways to
 * act on its reply: commit it (keeping the undo snapshot and offering undo in
 * the toast) and undo the last one.
 *
 * A device with no profile is the owner's, whose weekly goals are the shipped
 * history rather than anything a reply can edit, so its weekly goal is null.
 */
export function useCompanion() {
  const { plan, updatePlan, settings, updateSettings, workouts } = useData()
  const [, bump] = useReducer((n: number) => n + 1, 0)
  // The toast's undo runs after this render's settings have moved on.
  const latest = useRef(settings)
  latest.current = settings

  const profile = settings.profile
  const weekly = profile ? currentWeeklyGoals().workouts : 0
  const state: CompanionState = { plan, weeklyWorkouts: profile && weekly > 0 ? weekly : null }

  const undo = () => {
    const snap = lastAiChange()
    if (!snap) return
    updatePlan(snap.plan)
    const now = latest.current
    if (snap.weeklyGoals && now.profile) {
      updateSettings({ ...now, profile: { ...now.profile, weeklyGoals: snap.weeklyGoals } })
    }
    clearAiChange()
    bump()
    showUpdateToast('AI change undone')
  }

  const commit = (next: CompanionState, summary: string) => {
    const weeklyMoved = next.weeklyWorkouts !== state.weeklyWorkouts && next.weeklyWorkouts != null
    saveAiChange({
      at: new Date().toISOString(),
      summary,
      plan,
      ...(weeklyMoved && profile ? { weeklyGoals: profile.weeklyGoals } : {}),
    })
    updatePlan(next.plan)
    if (weeklyMoved && profile) {
      const goals = { ...currentWeeklyGoals(), workouts: next.weeklyWorkouts! }
      updateSettings({
        ...settings,
        profile: withWeeklyGoals(profile, goals, weekStartISO(toISODate(new Date()))),
      })
    }
    bump()
    showUpdateToast('plan updated', { label: 'undo', run: undo })
  }

  return { state, workouts, profile, heightIn: settings.heightIn, commit, undo, last: lastAiChange() }
}
