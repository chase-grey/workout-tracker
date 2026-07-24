import { MdAutoAwesome, MdCalendarMonth, MdEmojiEvents } from 'react-icons/md'
import type { Review } from '../lib/review'
import { Confetti } from './Confetti'

const GREENS = ['#16a34a', '#22c55e', '#4ade80', '#86efac']
const GOLDS = ['#fbbf24', '#f59e0b', '#fde68a']

/**
 * Full-screen month/year in review. Unlike the transient celebration overlay,
 * this stays until dismissed — it's a recap to read, not a flash to enjoy. It
 * leads with the numbers, calls out any all-time bests, and closes with a short
 * encouraging story pulled from `buildReview`.
 */
export function ReviewOverlay({ review, onClose }: { review: Review; onClose: () => void }) {
  const Icon = review.kind === 'year' ? MdAutoAwesome : MdCalendarMonth

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-black/95 px-6 py-8">
      {review.isBest && <Confetti count={56} colors={[...GOLDS, ...GREENS, '#ffffff']} />}

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="flex flex-col items-center text-center">
          <Icon className="text-5xl text-accent-2" aria-hidden />
          <h1 className="mt-3 text-3xl font-black leading-tight">{review.title}</h1>
          <p className="mt-1 text-sm text-neutral-400">{review.subtitle}</p>
        </div>

        <div className="mt-7 grid grid-cols-3 gap-2">
          {review.stats.map((s) => (
            <div key={s.label} className="flex flex-col items-center rounded-2xl bg-surface px-2 py-3 text-center">
              <span className="text-xl font-black text-accent-2">{s.value}</span>
              <span className="mt-0.5 text-[11px] leading-tight text-neutral-400">{s.label}</span>
            </div>
          ))}
        </div>

        {review.highlights.length > 0 && (
          <div className="mt-5 rounded-2xl border border-amber-400/40 bg-surface p-4">
            <div className="flex items-center gap-2 text-amber-400">
              <MdEmojiEvents className="text-xl" aria-hidden />
              <span className="text-sm font-bold uppercase tracking-wider">Records set</span>
            </div>
            <ul className="mt-2 flex flex-col gap-1.5">
              {review.highlights.map((h) => (
                <li key={h} className="text-sm text-neutral-200">
                  {h}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-6 text-base leading-relaxed text-neutral-200">{review.story}</p>

        <div className="flex-1" />

        <button
          onClick={onClose}
          className="mt-8 min-h-[52px] w-full rounded-2xl bg-accent text-lg font-bold text-black active:bg-accent-2"
        >
          Keep it going
        </button>
      </div>
    </div>
  )
}
