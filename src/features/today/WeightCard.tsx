import { useState } from 'react'
import { useData } from '../../store/DataContext'
import { bodyFatSeries } from '../../lib/bodyComp'
import { readsBodyFat, weighsIn } from '../../lib/profile'
import { WeightLogSheet } from './WeightLogSheet'

export function WeightCard() {
  const { bodyWeights, measurements, settings } = useData()
  const scale = weighsIn(settings.profile)
  const bodyFat = readsBodyFat(settings.profile)
  const latestBodyFat = bodyFatSeries(measurements).at(-1)
  const [show, setShow] = useState(false)
  const latest = bodyWeights.filter((b) => b.weightLbs >= 50).slice(-1)[0]

  return (
    <div className="flex items-center justify-between rounded-2xl bg-surface p-3">
      <div>
        <p className="text-xs tracking-wider text-neutral-500">body measurement</p>
        {scale && <p className="text-sm text-neutral-400">{latest ? `${latest.weightLbs} lbs` : '—'}</p>}
        {bodyFat && !scale && !latestBodyFat && <p className="text-sm text-neutral-400">—</p>}
        {bodyFat && latestBodyFat && <p className="text-sm text-neutral-400">{latestBodyFat.value}% body fat</p>}
      </div>
      <button
        onClick={() => setShow(true)}
        className="min-h-[44px] rounded-xl bg-surface-2 px-5 font-medium active:opacity-80"
      >
        log measurement
      </button>
      {show && <WeightLogSheet scale={scale} bodyFat={bodyFat} onClose={() => setShow(false)} />}
    </div>
  )
}
