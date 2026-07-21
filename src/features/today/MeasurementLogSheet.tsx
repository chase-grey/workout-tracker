import { useState } from 'react'
import { useData } from '../../store/DataContext'
import { navyBodyFat, latestMeasurement } from '../../lib/bodyComp'

/**
 * Log a body measurement (waist + neck, in inches). Neck prefills from the last
 * measurement since it barely changes. Shows the live Navy body-fat estimate
 * when a height is set in Settings.
 */
export function MeasurementLogSheet({ onClose }: { onClose: () => void }) {
  const { measurements, settings, logMeasurement } = useData()
  const last = latestMeasurement(measurements)

  const [waist, setWaist] = useState('')
  const [neck, setNeck] = useState(last ? String(last.neckIn) : '')

  const waistN = Number(waist)
  const neckN = Number(neck)
  const heightIn = settings.heightIn ?? 0

  const waistValid = waist.trim() !== '' && Number.isFinite(waistN) && waistN > 0
  const neckValid = neck.trim() !== '' && Number.isFinite(neckN) && neckN > 0
  const valid = waistValid && neckValid

  const bf = valid ? navyBodyFat(waistN, neckN, heightIn) : null

  const save = () => {
    if (!valid) return
    void logMeasurement(waistN, neckN)
    onClose()
  }

  const field = (
    label: string,
    value: string,
    setValue: (v: string) => void,
    placeholder: string,
    autoFocus = false,
  ) => (
    <div className="flex-1">
      <label className="mb-1 block text-xs uppercase tracking-wider text-neutral-500">{label}</label>
      <div className="flex items-center gap-1">
        <input
          autoFocus={autoFocus}
          type="number"
          inputMode="decimal"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-h-[52px] w-0 flex-1 rounded-xl bg-surface-2 px-3 text-center text-2xl tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <span className="text-sm text-neutral-500">in</span>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl bg-surface p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
      >
        <h2 className="mb-4 text-lg font-bold">Log measurement</h2>
        <div className="flex gap-3">
          {field('Waist', waist, setWaist, '32', true)}
          {field('Neck', neck, setNeck, '15')}
        </div>

        {heightIn > 0 ? (
          <p className="mt-4 text-center text-sm text-neutral-400">
            Est. body fat:{' '}
            <span className="font-bold tabular-nums text-accent-2">
              {bf != null ? `${bf}%` : '—'}
            </span>
          </p>
        ) : (
          <p className="mt-4 text-center text-sm text-neutral-500">
            Set your height in Settings to estimate body fat %.
          </p>
        )}

        <button
          onClick={save}
          disabled={!valid}
          className="mt-4 min-h-[52px] w-full rounded-2xl bg-accent text-lg font-bold text-black disabled:opacity-30"
        >
          Save
        </button>
      </div>
    </div>
  )
}
