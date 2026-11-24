import { createPortal } from 'react-dom'
import { MdOpenInNew, MdPlayCircleOutline, MdSearch } from 'react-icons/md'
import { howTo, videoUrl } from '../config/howTo'
import { TAP_SHIELD } from '../lib/useScreenTap'

/**
 * How one movement is done: the cues to read between sets, and where to watch
 * it (see config/howTo). A movement nothing there knows gets the search alone.
 *
 * Drawn through a portal, over everything, because the `?` that opens it sits
 * in places a fixed sheet can't be drawn from: a checklist row that is dragged
 * by transform, a card on a stack that folds. Events still bubble to wherever
 * the `?` was, so the sheet keeps its own: a tap on it is not a set finished
 * (`TAP_SHIELD`), not a rest ended, and not a hold on the card underneath.
 */
export function HowToSheet({
  exerciseKey,
  name,
  dumbbells = false,
  onClose,
}: {
  exerciseKey: string
  name: string
  /** The movement is loaded with a pair of dumbbells (see PlannedExercise.dumbbellPair). */
  dumbbells?: boolean
  onClose: () => void
}) {
  const content = howTo(exerciseKey, name, { dumbbells })
  const linkClass = 'flex min-h-[52px] items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2'

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end bg-black/60"
      role="dialog"
      aria-label={`how to do ${content.name}`}
      data-no-hold=""
      {...TAP_SHIELD}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
    >
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <h3 className="mb-3 text-lg font-bold">{content.name}</h3>

        {content.cues.length > 0 && (
          <ol className="mb-4 flex flex-col gap-2">
            {content.cues.map((cue, i) => (
              <li key={cue} className="flex gap-3 text-[15px] leading-snug text-neutral-200">
                <span className="w-4 shrink-0 text-right font-bold tabular-nums text-accent">{i + 1}</span>
                <span>{cue}</span>
              </li>
            ))}
          </ol>
        )}

        <div className="flex flex-col gap-2">
          {content.videos.map((v) => (
            <a key={v.id} href={videoUrl(v)} target="_blank" rel="noopener noreferrer" className={linkClass}>
              <MdPlayCircleOutline className="shrink-0 text-2xl text-accent" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{v.title ?? 'watch on youtube'}</span>
                <span className="block truncate text-xs text-neutral-500">{v.by}</span>
              </span>
              <MdOpenInNew className="shrink-0 text-neutral-500" aria-hidden />
            </a>
          ))}
          <a href={content.searchUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
            <MdSearch className="shrink-0 text-2xl text-neutral-400" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {content.videos.length > 0 ? 'more on youtube' : 'find it on youtube'}
            </span>
            <MdOpenInNew className="shrink-0 text-neutral-500" aria-hidden />
          </a>
        </div>
      </div>
    </div>,
    document.body,
  )
}
