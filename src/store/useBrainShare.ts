import { useEffect, useMemo } from 'react'
import { BRAIN_SHARE_KEY, buildBrainShare, goalStandings } from '../lib/brainShare'
import { goalsFor } from '../lib/profileGoals'
import { api, isConfigured } from '../services/api'
import { useData } from './DataContext'

/** The summary the backend last confirmed, so an unchanged one isn't sent again. */
const POSTED_KEY = 'wt.share.posted'

/**
 * Keeps the summary my-brain reads in step with what this app shows (see
 * lib/brainShare): in this device's storage for a my-brain beside it, and on
 * the backend for one anywhere else.
 */
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
    let share: string | null = null
    try {
      const built = buildBrainShare(streakHistory, standings)
      share = built ? JSON.stringify(built) : null
      if (share) localStorage.setItem(BRAIN_SHARE_KEY, share)
      else localStorage.removeItem(BRAIN_SHARE_KEY)
      if (!share || !isConfigured() || localStorage.getItem(POSTED_KEY) === share) return
    } catch {
      // Storage full or blocked: my-brain keeps the last summary it read.
      return
    }
    const sent = share
    // Not queued: the next open sends a fresher one, so a lost post costs nothing.
    api.postShare(JSON.parse(sent)).then(
      () => {
        try {
          localStorage.setItem(POSTED_KEY, sent)
        } catch {
          // It is sent again next time.
        }
      },
      () => {},
    )
  }, [streakHistory, standings])
}
