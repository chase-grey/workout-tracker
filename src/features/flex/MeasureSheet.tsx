import { useState } from 'react'
import { MdPhotoCamera } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { CameraMeasure } from './CameraMeasure'

const num = (s: string): number | null => {
  const t = s.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : null
}

const deg = (n: number | null | undefined): string => (n != null ? String(n) : '')

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
    // Above the rest overlay (z-50) — it can be opened from the rest screen's menu.
    <div className="fixed inset-0 z-60 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
      >
        <h2 className="mb-3 text-lg font-bold">log measurement</h2>

        <button
          onClick={() => setMeasuring(true)}
          className="mb-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-surface-2 font-semibold text-neutral-200 active:opacity-80"
        >
          <MdPhotoCamera aria-hidden /> measure
        </button>

        <label className="mb-1 block text-sm text-neutral-300">side split (°)</label>
        <input
          type="number"
          inputMode="decimal"
          placeholder="e.g. 92"
          value={split}
          onChange={(e) => setSplit(e.target.value)}
          className="min-h-[48px] w-full rounded-xl bg-surface-2 px-3 text-center text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
        />

        <div className="mt-3 flex gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-sm text-neutral-300">tailor's left (°)</label>
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
            <label className="mb-1 block text-sm text-neutral-300">tailor's right (°)</label>
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

        <button
          onClick={save}
          disabled={!anyValue}
          className="mt-4 min-h-[52px] w-full rounded-2xl bg-accent text-lg font-bold text-black disabled:opacity-30"
        >
          save measurement
        </button>
      </div>

      {measuring && (
        <CameraMeasure
          mode="split"
          onClose={() => setMeasuring(false)}
          onDone={(result) => {
            if (result.splitDeg != null) setSplit(deg(result.splitDeg))
            if (result.tailorsLeftDeg != null) setLeft(deg(result.tailorsLeftDeg))
            if (result.tailorsRightDeg != null) setRight(deg(result.tailorsRightDeg))
            setMeasuring(false)
          }}
        />
      )}
    </div>
  )
}
