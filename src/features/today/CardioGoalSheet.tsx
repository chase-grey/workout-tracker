import { useBackGuard } from '../../lib/useBackGuard'
import { CardioGoalForm } from './CardioGoalForm'

/**
 * The cardio goal form (CardioGoalForm) as a sheet over Today or Progress.
 * Closing it after a save says so, so a sheet it was opened over can close too.
 */
export function CardioGoalSheet({ onClose }: { onClose: (saved?: boolean) => void }) {
  useBackGuard(true, () => onClose())
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={() => onClose()}>
      <div
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
      >
        <h2 className="mb-4 text-lg font-bold">cardio goal</h2>
        <CardioGoalForm onSaved={() => onClose(true)} />
      </div>
    </div>
  )
}
