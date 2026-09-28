import { useState } from 'react'
import { useData } from '../store/DataContext'
import { storage } from '../services/storage'

export function SaveStatus() {
  const { pendingWrites, saveError, refresh } = useData()
  const [retrying, setRetrying] = useState(false)
  if (!pendingWrites && !saveError) return null
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
  return <aside role="status" className="relative z-[100] border-b border-amber-500 bg-slate-950 p-3 text-sm text-amber-100">
    <p>{pendingWrites > 0 ? `${pendingWrites} saved locally, awaiting backup to the server. We retry when you reopen the app or reconnect.` : 'Your data could not be saved.'}</p>
    {saveError && <p className="mt-1 break-words">{saveError}</p>}
    <div className="mt-2 flex gap-4">
      <button className="underline" disabled={retrying} onClick={async () => {
        setRetrying(true)
        try { await refresh() } finally { setRetrying(false) }
      }}>{retrying ? 'Retrying…' : 'Retry now'}</button>
      <button className="underline" onClick={exportBackup}>Download recovery copy</button>
    </div>
  </aside>
}
