import { useState } from 'react'
import { useData } from '../../store/DataContext'
import { bodyFatSeries } from '../../lib/bodyComp'
import { bodyWeightPoints } from '../../lib/goals'
import { readsBodyFat, weighsIn } from '../../lib/profile'
import { WeightLogSheet } from './WeightLogSheet'
import { Tick } from '../../components/Tick'

export function WeightCard() {
  const { bodyWeights, measurements, settings } = useData()
  const scale = weighsIn(settings.profile)
  const bodyFat = readsBodyFat(settings.profile)
  const latestBodyFat = bodyFatSeries(measurements).at(-1)
  const [show, setShow] = useState(false)
  // By date, not by where the row sits: a backdated or re-synced entry can be last in the list.
  const latest = bodyWeightPoints(bodyWeights).at(-1)

  return (
    <div className="flex items-center justify-between rounded-2xl bg-surface p-3">
      <div>
        <p className="text-xs tracking-wider text-neutral-500">body measurement</p>
        {scale && <p className="text-sm text-neutral-400">{latest ? <><Tick value={latest.value} /> lbs</> : '—'}</p>}
        {bodyFat && !scale && !latestBodyFat && <p className="text-sm text-neutral-400">—</p>}
        {bodyFat && latestBodyFat && <p className="text-sm text-neutral-400"><Tick value={latestBodyFat.value} />% body fat</p>}
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
