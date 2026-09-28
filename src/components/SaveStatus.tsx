import { useState } from 'react'
import { useData } from '../store/DataContext'
import { storage } from '../services/storage'

export function SaveStatus() {
  const { saveError, refresh } = useData()
  const [retrying, setRetrying] = useState(false)
  if (!saveError) return null
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
  return <aside role="status" className="rounded-xl bg-surface p-3 text-sm text-neutral-300">
    <p>Couldn't save. Try again.</p>
    <details className="mt-2 text-xs text-neutral-500">
      <summary>Details</summary>
      <p className="mt-1 break-words">{saveError}</p>
    </details>
    <div className="mt-2 flex gap-4">
      <button className="underline" disabled={retrying} onClick={async () => {
        setRetrying(true)
        try { await refresh() } finally { setRetrying(false) }
      }}>{retrying ? 'Retrying…' : 'Retry now'}</button>
      <button className="underline" onClick={exportBackup}>Download recovery copy</button>
    </div>
  </aside>
}
