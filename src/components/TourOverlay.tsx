import { useEffect, useRef, useState } from 'react'
import { useData } from '../store/DataContext'
import {
  advanceTour,
  currentTourStep,
  skipTour,
  tourCardTop,
  tourPosition,
  tourSpot,
  tourSteps,
  type TourBox,
  type TourState,
  type TourTab,
} from '../lib/tour'

/** The clear space between the tour's card and what it points at, or the screen's edge. */
const GAP = 12

/** What a step lights up: a card in the open tab's stack, or the tab's icon in the bar. */
function targetOf(tab: TourTab, card: string | undefined): Element | null {
  return card
    ? document.querySelector(`main [data-card="${card}"]`)
    : document.querySelector(`nav [data-tab="${tab}"] .nav-icon`)
}

const sameBox = (a: TourBox | null, b: TourBox | null) =>
  a === b ||
  (a != null && b != null && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height)

/**
 * The first-run tour, as a card floating over the app (see lib/tour).
 *
 * It owns the screen while it is up: the page behind is dimmed and takes no
 * taps, the tab each step is about is opened under it, and the one thing the
 * step is about is left lit. Nothing in the page is moved to make room for it;
 * the card goes wherever the lit thing isn't.
 *
 * The lit box is measured every frame rather than once, because what it
 * follows is still arriving when the step changes: the tab slides in, the page
 * scrolls, a chart finishes laying out.
 */
export function TourOverlay({ tab, onTab }: { tab: TourTab; onTab: (tab: TourTab) => void }) {
  const { settings, updateSettings } = useData()
  const cardRef = useRef<HTMLDivElement>(null)
  const [spot, setSpot] = useState<TourBox | null>(null)
  const [top, setTop] = useState<number | null>(null)

  const steps = tourSteps(settings.profile, settings.coachEnabled === true)
  const state: TourState = { seen: settings.tourSeen ?? [], done: settings.tourDone ?? false }
  const step = settings.guideMode ? currentTourStep(steps, state) : null
  const stepId = step?.id
  const stepTab = step?.tab
  const stepCard = step?.card
  const onTheTab = stepTab === tab

  // The step's tab is the one open behind it, and stays so while the step is up.
  useEffect(() => {
    if (stepTab && !onTheTab) onTab(stepTab)
  }, [stepTab, onTheTab, onTab])

  // Bring the card a step is about to the top of the page, which leaves the
  // most room under it. A frame late: the shell scrolls a newly opened tab to
  // its top in an effect of its own, and that one runs after this.
  useEffect(() => {
    if (!stepId || !stepTab || !stepCard || !onTheTab) return
    const frame = requestAnimationFrame(() => {
      const main = document.querySelector('main')
      const target = targetOf(stepTab, stepCard)
      if (!main || !target) return
      const offset = target.getBoundingClientRect().top - main.getBoundingClientRect().top
      main.scrollTo({ top: main.scrollTop + offset - GAP })
    })
    return () => cancelAnimationFrame(frame)
  }, [stepId, stepTab, stepCard, onTheTab])

  useEffect(() => {
    if (!stepId || !stepTab) return
    let frame = 0
    const measure = () => {
      const viewHeight = window.innerHeight
      const target = onTheTab ? targetOf(stepTab, stepCard) : null
      let next: TourBox | null = null
      if (target) {
        const r = target.getBoundingClientRect()
        // A card is lit only as far down as the bar: the bar is drawn over the
        // page, and a light that ran under it would light the bar too.
        const bar = stepCard ? document.querySelector('nav')?.getBoundingClientRect().top : undefined
        const lit = tourSpot(
          { top: r.top, left: r.left, width: r.width, height: r.height },
          { top: 0, bottom: bar ?? viewHeight, width: window.innerWidth },
          stepCard ? 6 : 8,
        )
        next = lit && {
          top: Math.round(lit.top),
          left: Math.round(lit.left),
          width: Math.round(lit.width),
          height: Math.round(lit.height),
        }
      }
      setSpot((prev) => (sameBox(prev, next) ? prev : next))
      const height = cardRef.current?.offsetHeight ?? 0
      if (height > 0) setTop(Math.round(tourCardTop(next, height, viewHeight, GAP)))
      frame = requestAnimationFrame(measure)
    }
    frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  }, [stepId, stepTab, stepCard, onTheTab])

  if (!step) return null

  const save = (next: TourState) => {
    void updateSettings({ ...settings, tourSeen: [...next.seen], tourDone: next.done })
    // Over, either way: back to where the day starts.
    if (next.done) onTab('today')
  }
  const { index, total } = tourPosition(steps, step)

  return (
    <div className="fixed inset-0 z-40" onClick={(e) => e.stopPropagation()}>
      {spot ? (
        // The dimming is this box's own shadow, thrown over everything but itself.
        <div
          aria-hidden
          className="pointer-events-none fixed outline-2 outline-accent"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            borderRadius: stepCard ? 18 : 9999,
            // A tab's step is about the whole page behind it, so that page is
            // only taken down a little; a card's step is about the card.
            boxShadow: `0 0 0 200vmax rgb(0 0 0 / ${stepCard ? 0.55 : 0.35})`,
          }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-black/60" />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="fixed inset-x-0 mx-auto w-[calc(100%-2rem)] max-w-sm"
        style={{ top: top ?? 0, visibility: top == null ? 'hidden' : undefined }}
      >
        {/* Keyed by step, so each one arrives rather than having its words swapped. */}
        <div key={step.id} className="menu-pop rounded-2xl border border-border bg-surface p-4 shadow-lg">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="tour-title" className="text-base font-semibold text-accent">
              {step.title}
            </h2>
            <span className="text-xs tabular-nums text-neutral-500">
              {index} of {total}
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-neutral-200">{step.body}</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => save(advanceTour(steps, state, step.id))}
              className="min-h-[44px] flex-1 rounded-xl bg-accent text-sm font-semibold text-on-accent active:bg-accent-deep"
            >
              {index === total ? 'done' : 'next'}
            </button>
            {index < total && (
              <button
                onClick={() => save(skipTour(state))}
                className="min-h-[44px] rounded-xl bg-surface-2 px-3 text-sm text-neutral-400 active:opacity-80"
              >
                skip tour
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
