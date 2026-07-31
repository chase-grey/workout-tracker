import { useState } from 'react'
import { useData } from '../../store/DataContext'

/**
 * One-time first-run setup: asks for the user's height so the Navy body-fat
 * estimate has a fixed input. Height barely changes, so it's captured once here
 * rather than living in Settings. Skipping is fine — it can still be estimated
 * without it — and either way we mark setup complete so this never shows again.
 */
export function HeightSetup() {
  const { settings, updateSettings } = useData()
  const [heightFt, setHeightFt] = useState('')
  const [heightIn, setHeightIn] = useState('')

  const complete = (heightIn?: number) =>
    updateSettings({ ...settings, heightIn, setupComplete: true })

  const save = () => {
    const total = (Number(heightFt) || 0) * 12 + (Number(heightIn) || 0)
    complete(total > 0 ? total : undefined)
  }

  return (
    <div className="mx-auto flex h-[100dvh] max-w-md flex-col justify-center px-6">
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">what&apos;s your height?</h1>

        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            autoFocus
            value={heightFt}
            onChange={(e) => setHeightFt(e.target.value)}
            placeholder="5"
            className="min-h-[52px] w-0 flex-1 rounded-xl bg-surface px-3 text-center text-2xl tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <span className="text-sm text-neutral-500">ft</span>
          <input
            type="number"
            inputMode="decimal"
            value={heightIn}
            onChange={(e) => setHeightIn(e.target.value)}
            placeholder="10"
            className="min-h-[52px] w-0 flex-1 rounded-xl bg-surface px-3 text-center text-2xl tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <span className="text-sm text-neutral-500">in</span>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={save}
            className="min-h-[52px] rounded-2xl bg-accent text-lg font-bold text-black active:opacity-80"
          >
            get started
          </button>
          <button
            onClick={() => complete(undefined)}
            className="min-h-[44px] rounded-xl text-sm font-medium text-neutral-500 active:text-neutral-300"
          >
            skip for now
          </button>
        </div>
      </div>
    </div>
  )
}
