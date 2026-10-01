import { useState } from 'react'
import { MdAutoAwesome, MdCalendarMonth, MdEmojiEvents, MdExpandMore } from 'react-icons/md'
import type { Review } from '../lib/review'
import { Confetti } from './Confetti'

const GREENS = ['#16a34a', '#22c55e', '#4ade80', '#86efac']
const GOLDS = ['#fbbf24', '#f59e0b', '#fde68a']

/**
 * Full-screen month/year in review. Unlike the transient celebration overlay,
 * this stays until dismissed — it's a recap to read, not a flash to enjoy. It
 * leads with the numbers and lets PR tiles expand into dated records.
 */
export function ReviewOverlay({ review, onClose }: { review: Review; onClose: () => void }) {
  const Icon = review.kind === 'year' ? MdAutoAwesome : MdCalendarMonth
  const [expanded, setExpanded] = useState<string | null>(null)
  const selected = review.stats.find((s) => s.label === expanded)

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-black/95 px-6 py-8">
      {review.isBest && <Confetti count={56} colors={[...GOLDS, ...GREENS, '#ffffff']} />}

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="flex flex-col items-center text-center">
          <Icon className="text-5xl text-accent-2" aria-hidden />
          <h1 className="mt-3 text-3xl font-black leading-tight">{review.title}</h1>
          {review.kind === 'year' && <p className="mt-1 text-sm text-neutral-400">{review.subtitle}</p>}
        </div>

        <div className="mt-7 grid grid-cols-3 gap-2">
          {review.stats.map((s) => {
            const content = <>
              <span className="text-xl font-black text-accent-2">{s.value}</span>
              <span className="mt-0.5 text-[11px] leading-tight text-neutral-400">{s.label}</span>
            </>
            const tileClass = 'flex flex-col items-center justify-center rounded-2xl bg-surface px-2 py-3 text-center'
            return s.records ? (
              <button key={s.label} type="button" aria-expanded={expanded === s.label}
                aria-controls="review-pr-details"
                onClick={() => setExpanded(expanded === s.label ? null : s.label)}
                className={`${tileClass} active:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent ${expanded === s.label ? 'ring-1 ring-accent' : ''}`}>
                {content}
                <MdExpandMore aria-hidden className={expanded === s.label ? 'rotate-180' : ''} />
              </button>
            ) : <div key={s.label} className={tileClass}>{content}</div>
          })}
        </div>

        <div id="review-pr-details" aria-live="polite">
          {selected?.records && (
            <section className="mt-4 rounded-2xl bg-surface p-4" aria-label={selected.label}>
              <h2 className="text-sm font-bold text-accent-2">{selected.label}</h2>
              {selected.records.length === 0 ? (
                <p className="mt-2 text-sm text-neutral-400">no {selected.label} this {review.kind}</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {selected.records.map((record, i) => (
                    <li key={`${record.name}-${record.date}-${i}`}>
                      <div className="text-sm font-semibold">{record.name}</div>
                      <div className="text-sm text-neutral-300">{record.value}</div>
                      <time dateTime={record.date} className="text-xs text-neutral-500">
                        {new Date(`${record.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        {review.kind === 'year' && review.highlights.length > 0 && (
          <div className="mt-5 rounded-2xl border border-amber-400/40 bg-surface p-4">
            <div className="flex items-center gap-2 text-amber-400">
              <MdEmojiEvents className="text-xl" aria-hidden />
              <span className="text-sm font-bold tracking-wider">records set</span>
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

        {review.kind === 'year' && <p className="mt-6 text-base leading-relaxed text-neutral-200">{review.story}</p>}

        <div className="flex-1" />

        <button
          onClick={onClose}
          className="mt-8 min-h-[52px] w-full rounded-2xl bg-accent text-lg font-bold text-black active:bg-accent-2"
        >
          keep it going
        </button>
      </div>
    </div>
  )
}
