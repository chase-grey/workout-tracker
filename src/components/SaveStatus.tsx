import { useState } from 'react'
import { useData } from '../store/DataContext'
import { storage } from '../services/storage'

/**
 * The outbox's standing failure, shown in Settings. Leads with how many writes
 * are waiting and the error itself: when the backend is behind the app, the
 * error is the one line that says what to update, and a Retry that silently
 * gets the same answer looks like a button that does nothing. So a retry that
 * still fails says so, with the time, and a retry that drains the outbox
 * clears the whole panel.
 */
export function SaveStatus() {
  const { saveError, pendingWrites, refresh } = useData()
  const [retrying, setRetrying] = useState(false)
  const [retriedAt, setRetriedAt] = useState<string | null>(null)
  if (!saveError) return null
  const retry = async () => {
    setRetrying(true)
    try {
      await refresh()
    } finally {
      setRetrying(false)
      setRetriedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))
    }
  }
  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(),
      pending: storage.loadQueue(), workouts: storage.loadWorkouts(),
      activeSession: storage.loadActiveSession(), stretch: storage.loadStretch(),
      bodyWeights: storage.loadBodyWeights(), flex: storage.loadFlex(),
      calories: storage.loadCalories(), measurements: storage.loadMeasurements(),
      durations: storage.loadDurations(),
    }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'workout-recovery.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const waiting = pendingWrites === 1 ? '1 entry is' : `${pendingWrites} entries are`
  return <aside role="status" className="rounded-xl bg-surface p-3 text-sm text-neutral-300">
    <p>Couldn't save. {waiting} kept on this device.</p>
    <p className="mt-1 break-words text-xs text-neutral-400">{saveError}</p>
    {retriedAt && <p className="mt-1 text-xs text-neutral-500">Retried at {retriedAt}. Still failing.</p>}
    <div className="mt-2 flex gap-4">
      <button className="underline" disabled={retrying} onClick={retry}>
        {retrying ? 'Retrying…' : 'Retry now'}
      </button>
      <button className="underline" onClick={exportBackup}>Download recovery copy</button>
    </div>
  </aside>
}
