import { FlexRoutine } from './FlexRoutine'

/** The "doing" view for a stretch session — launched from the Today tab. */
export function StretchSession({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col gap-4 pb-28">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Stretch session</h2>
          <p className="text-sm text-neutral-500">Side splits · goal 180°</p>
        </div>
        <button onClick={onClose} className="min-h-[44px] rounded-xl px-3 text-sm text-neutral-500">
          Back
        </button>
      </header>

      <FlexRoutine />

      <p className="px-1 text-xs text-neutral-500">
        Track your split angle over time on the Progress tab.
      </p>
    </div>
  )
}
