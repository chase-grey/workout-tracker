import { useState } from 'react'
import { MdPhotoCamera } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { PoseMeasure } from './PoseMeasure'

const num = (s: string): number | null => {
  const t = s.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Log flexibility measurements (side split + tailor's L/R) during a session. */
export function MeasureSheet({ onClose }: { onClose: () => void }) {
  const { logFlex } = useData()
  const [split, setSplit] = useState('')
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const [measuring, setMeasuring] = useState(false)

  const anyValue = num(split) != null || num(left) != null || num(right) != null

  const save = () => {
    if (!anyValue) return
    void logFlex({
      splitDeg: num(split),
      tailorsLeftDeg: num(left),
      tailorsRightDeg: num(right),
      note: 'measurement',
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
      >
        <h2 className="mb-3 text-lg font-bold">Log measurement</h2>

        <label className="mb-1 block text-sm text-neutral-300">Side split (°)</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            placeholder="e.g. 92"
            value={split}
            onChange={(e) => setSplit(e.target.value)}
            className="min-h-[48px] w-0 flex-1 rounded-xl bg-surface-2 px-3 text-center text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            onClick={() => setMeasuring(true)}
            className="flex min-h-[48px] items-center gap-1 rounded-xl bg-surface-2 px-3 text-sm text-neutral-300 active:opacity-80"
          >
            <MdPhotoCamera aria-hidden /> Photo
          </button>
        </div>

        <div className="mt-3 flex gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-sm text-neutral-300">Tailor's left (°)</label>
            <input
              type="number"
              inputMode="decimal"
              placeholder="e.g. 55"
              value={left}
              onChange={(e) => setLeft(e.target.value)}
              className="min-h-[48px] w-full rounded-xl bg-surface-2 px-3 text-center text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm text-neutral-300">Tailor's right (°)</label>
            <input
              type="number"
              inputMode="decimal"
              placeholder="e.g. 55"
              value={right}
              onChange={(e) => setRight(e.target.value)}
              className="min-h-[48px] w-full rounded-xl bg-surface-2 px-3 text-center text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        </div>

        <p className="mt-2 text-xs text-neutral-500">
          Photo auto-angle works for the side split. Tailor's pose is entered manually for now.
        </p>

        <button
          onClick={save}
          disabled={!anyValue}
          className="mt-4 min-h-[52px] w-full rounded-2xl bg-accent text-lg font-bold text-black disabled:opacity-30"
        >
          Save measurement
        </button>
      </div>

      {measuring && (
        <PoseMeasure onAngle={(deg) => setSplit(String(deg))} onClose={() => setMeasuring(false)} />
      )}
    </div>
  )
}
