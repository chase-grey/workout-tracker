import { useEffect, useMemo } from 'react'
import { BRAIN_SHARE_KEY, buildBrainShare, goalStandings } from '../lib/brainShare'
import { goalsFor } from '../lib/profileGoals'
import { useData } from './DataContext'

/** Keeps the summary my-brain reads in step with what this app shows (see lib/brainShare). */
export function useBrainShare(): void {
  const { streakHistory, workouts, bodyWeights, measurements, flexEntries, settings } = useData()
  const heightIn = settings.heightIn ?? 0

  const standings = useMemo(
    () =>
      goalStandings(
        goalsFor(settings.profile, { workouts, bodyWeights, measurements, heightIn, flexEntries }),
        settings.lockedGoals ?? {},
      ),
    [workouts, bodyWeights, measurements, heightIn, flexEntries, settings.profile, settings.lockedGoals],
  )

  useEffect(() => {
    try {
      const share = buildBrainShare(streakHistory, standings)
      if (share) localStorage.setItem(BRAIN_SHARE_KEY, JSON.stringify(share))
      else localStorage.removeItem(BRAIN_SHARE_KEY)
    } catch {
      // Storage full or blocked: my-brain keeps the last summary it read.
    }
  }, [streakHistory, standings])
}
