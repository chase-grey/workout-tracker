import { useState } from 'react'
import { useBackGuard } from '../../lib/useBackGuard'
import type { DayType } from '../../types'
import { PlanEditor } from './PlanEditor'

/**
 * The plan editor over whatever screen asked for it, opened on one day. Closing
 * it — the button, or the back press — leaves you exactly where you were, which
 * is the point of a sheet over a trip to Settings. The editor itself is the one
 * Settings mounts; this only gives it a frame.
 */
export function PlanEditorSheet({ day, onClose }: { day?: DayType; onClose: () => void }) {
  const [dirty, setDirty] = useState(false)
  useBackGuard(true, onClose)
  return (
    <div className="overlay-rise fixed inset-0 z-40 flex flex-col bg-bg" role="dialog" aria-label="workout plan">
      <div className="flex min-h-[52px] items-center justify-between px-4 pt-[env(safe-area-inset-top)]">
        <h2 className="text-lg font-bold">workout plan</h2>
        <button
          onClick={onClose}
          className="min-h-[44px] rounded-xl px-3 text-sm font-semibold text-neutral-300 active:bg-surface"
        >
          {dirty ? 'discard & close' : 'close'}
        </button>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto px-4"
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
      >
        <PlanEditor focusDay={day} onDirty={setDirty} onSaved={onClose} />
      </div>
    </div>
  )
}
