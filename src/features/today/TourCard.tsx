import { useEffect, useRef } from 'react'
import { useData } from '../../store/DataContext'
import {
  advanceTour,
  currentTourStep,
  skipTour,
  tourBody,
  tourPosition,
  tourSteps,
  type TourAnchor,
} from '../../lib/tour'

/**
 * The first-run tour's current step, as a card in the flow of Today directly
 * above the control it is about. One of these sits at each anchor and only the
 * one the current step belongs to draws anything, so it never floats over the
 * page: nothing here covers a session or catches a tap meant for one.
 */
export function TourCard({ anchor }: { anchor: TourAnchor }) {
  const { settings, updateSettings } = useData()
  const ref = useRef<HTMLDivElement>(null)

  const steps = tourSteps(settings.profile)
  const state = { seen: settings.tourSeen ?? [], done: settings.tourDone ?? false }
  const step = settings.guideMode ? currentTourStep(steps, state) : null
  const here = step?.anchor === anchor ? step : null
  const hereId = here?.id

  // Bring the card into view when its step arrives, so a step about a control
  // further down the page isn't one the reader has to go looking for.
  useEffect(() => {
    if (hereId) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [hereId])

  if (!here) return null

  const save = (next: { seen: readonly string[]; done: boolean }) =>
    void updateSettings({ ...settings, tourSeen: [...next.seen], tourDone: next.done })
  const { index, total } = tourPosition(steps, here)
  const last = index === total

  return (
    <div ref={ref} className="rounded-2xl bg-accent/15 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-accent">{here.title}</h2>
        <span className="text-xs tabular-nums text-neutral-500">
          {index} of {total}
        </span>
      </div>
      <p className="mt-1 text-sm text-neutral-200">{tourBody(here, settings.coachEnabled === true)}</p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => save(advanceTour(steps, state, here.id))}
          className="min-h-[44px] flex-1 rounded-xl bg-accent text-sm font-semibold text-on-accent active:bg-accent-deep"
        >
          {last ? 'done' : 'next'}
        </button>
        <button
          onClick={() => save(skipTour(state))}
          className="min-h-[44px] rounded-xl bg-surface px-3 text-sm text-neutral-400 active:bg-surface-2"
        >
          skip tour
        </button>
      </div>
    </div>
  )
}
