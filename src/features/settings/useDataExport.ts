import { useCallback } from 'react'
import { useData } from '../../store/DataContext'
import { calorieGoalOn } from '../../lib/calories'
import { buildAnalysisPaste, exportFileName, exportJson, type ExportInput } from '../../lib/dataExport'
import { toISODate } from '../../lib/dates'
import { hasPillar } from '../../lib/profile'
import { shareOrDownload, type SaveOutcome } from '../../lib/saveFile'
import { APP_COMMIT } from '../../lib/version'

/**
 * Everything the signed-in person has logged, the two ways it leaves the app
 * (see lib/dataExport): the complete JSON file, and the text for a chat AI
 * with the analysis prompt in front of it.
 *
 * It is built from what this device already holds — the same lists every
 * screen reads, which a refresh fills with the account's whole history and
 * which include anything still waiting in the outbox — so it works offline and
 * on a device that keeps its data to itself, and can only ever be this
 * account's rows.
 */
export function useDataExport(): { analysisText: () => string; saveFile: () => Promise<SaveOutcome> } {
  const d = useData()
  const snapshot = useCallback((): ExportInput => {
    const now = new Date()
    const today = toISODate(now)
    return {
      exportedAt: now.toISOString(),
      today,
      build: APP_COMMIT,
      workouts: d.workouts,
      bodyWeights: d.bodyWeights,
      flexEntries: d.flexEntries,
      calorieEntries: d.calorieEntries,
      measurements: d.measurements,
      durations: d.durations,
      cardioEntries: d.cardioEntries,
      exerciseAverages: d.exerciseAverages,
      plan: d.plan,
      flexPlans: d.flexPlans,
      settings: d.settings,
      weeklyGoals: d.goals,
      calorieGoal: hasPillar(d.settings.profile, 'diet') ? calorieGoalOn(today) : null,
      dietDirection: d.settings.profile?.dietDirection,
    }
  }, [d])

  const analysisText = useCallback(() => buildAnalysisPaste(snapshot()), [snapshot])
  const saveFile = useCallback(() => {
    const input = snapshot()
    const name = exportFileName(input.today)
    return shareOrDownload(exportJson(input), [
      { name, type: 'application/json' },
      { name: `${name}.txt`, type: 'text/plain' },
    ])
  }, [snapshot])
  return { analysisText, saveFile }
}
