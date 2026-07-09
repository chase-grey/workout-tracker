import { useState } from 'react'
import { computePlates } from '../../lib/plates'

const BAR_OPTIONS = [45, 35, 0]

export function PlateCalculator() {
  const [target, setTarget] = useState('')
  const [barLbs, setBarLbs] = useState(45)

  const n = Number(target)
  const valid = target.trim() !== '' && Number.isFinite(n) && n > 0
  const result = valid ? computePlates(n, { barLbs }) : null
  const hasPlates = result !== null && result.perSide.length > 0

  const breakdown = result
    ? result.perSide.map((p) => `${p.count}×${p.plate}`).join(', ')
    : ''

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface p-4">
      <label className="text-sm font-medium text-neutral-300">Plate calculator</label>

      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          placeholder="Target weight"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="min-h-[44px] w-0 flex-1 rounded-xl bg-surface-2 px-4 text-center text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <span className="text-neutral-500">lbs</span>
      </div>

      <div className="flex gap-2">
        {BAR_OPTIONS.map((b) => (
          <button
            key={b}
            onClick={() => setBarLbs(b)}
            className={
              'min-h-[44px] flex-1 rounded-xl text-sm font-semibold ' +
              (barLbs === b
                ? 'bg-accent text-black'
                : 'bg-surface-2 text-neutral-300 active:bg-surface')
            }
          >
            {b === 0 ? 'No bar' : `${b} bar`}
          </button>
        ))}
      </div>

      {!valid && (
        <p className="text-xs text-neutral-500">Enter a target weight to see the plate loadout.</p>
      )}

      {result && (
        <div className="flex flex-col gap-1 rounded-xl bg-surface-2 p-3">
          <p className="text-sm">
            {hasPlates ? (
              <>
                <span className="text-neutral-500">Per side: </span>
                <span className="font-semibold tabular-nums">{breakdown}</span>
              </>
            ) : (
              <span className="text-neutral-500">
                Bar only — no plates fit under this target.
              </span>
            )}
          </p>
          <p className="text-sm">
            <span className="text-neutral-500">Total: </span>
            <span className="font-semibold tabular-nums text-accent-2">
              {result.achievable} lbs
            </span>
          </p>
          {result.leftover > 0 && (
            <p className="text-xs text-neutral-500">
              closest loadable: {result.achievable} lbs (−{result.leftover})
            </p>
          )}
        </div>
      )}
    </div>
  )
}
