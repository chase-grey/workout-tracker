import { useState } from 'react'
import { useData } from '../../store/DataContext'
import { WeightLogSheet } from './WeightLogSheet'

export function WeightCard() {
  const { bodyWeights } = useData()
  const [show, setShow] = useState(false)
  const latest = bodyWeights.filter((b) => b.weightLbs >= 50).slice(-1)[0]

  return (
    <div className="flex items-center justify-between rounded-2xl bg-surface p-3">
      <div>
        <p className="text-xs tracking-wider text-neutral-500">body weight</p>
        <p className="text-xl font-bold tabular-nums">{latest ? `${latest.weightLbs} lbs` : '—'}</p>
      </div>
      <button
        onClick={() => setShow(true)}
        className="min-h-[44px] rounded-xl bg-surface-2 px-5 font-medium active:opacity-80"
      >
        log weight
      </button>
      {show && <WeightLogSheet onClose={() => setShow(false)} />}
    </div>
  )
}
