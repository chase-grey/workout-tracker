import type { ReactNode } from 'react'
import { isIosInAppBrowser, iosShareSpot, type ShareSpot } from '../lib/installPrompt'

/** iOS's share button: an open box with an arrow rising out of it. */
function ShareGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M8 9H6.5A1.5 1.5 0 0 0 5 10.5v8A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17.5 9H16" />
      <path d="M12 15V3.5" />
      <path d="M8.5 7 12 3.5 15.5 7" />
    </svg>
  )
}

/** The add-to-home-screen glyph: a plus in a rounded square. */
function PlusGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}

const SPOT_TEXT: Record<ShareSpot, string> = {
  bottom: 'in the bar at the bottom',
  top: 'top right corner',
  both: 'bottom bar in safari, top right in chrome',
}

function Step({ n, glyph, children }: { n: number; glyph: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-bold text-neutral-200">
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {glyph}
        {children}
      </div>
    </li>
  )
}

/**
 * How to install the app on an iPhone or iPad: share, then add to home screen.
 * An iOS in-app browser has no add to home screen at all, so it's told to open
 * the page in Safari instead. `compact` is the one-line form for a banner.
 */
export function InstallSteps({ compact = false }: { compact?: boolean }) {
  const ua = navigator.userAgent
  const touch = navigator.maxTouchPoints
  if (isIosInAppBrowser(ua, touch)) {
    return compact ? (
      <p className="flex flex-1 items-center justify-center text-sm text-neutral-300">
        open this page in safari first
      </p>
    ) : (
      <p className="text-base text-neutral-300">open this page in safari first</p>
    )
  }

  if (compact) {
    return (
      <p className="flex flex-1 items-center justify-center gap-1.5 text-sm text-neutral-300">
        <ShareGlyph className="h-5 w-5 shrink-0" />
        <span>tap share, then add to home screen</span>
      </p>
    )
  }

  const spot = iosShareSpot(ua, touch)
  return (
    <ol className="flex flex-1 flex-col gap-6 text-base text-neutral-300">
      <Step
        n={1}
        glyph={<ShareGlyph className="h-7 w-7 text-accent-2" />}
      >
        <p>tap the share button</p>
        <p className="text-sm text-neutral-400">{SPOT_TEXT[spot]}</p>
      </Step>
      <Step n={2} glyph={<PlusGlyph className="h-7 w-7 text-accent-2" />}>
        <p>scroll down the list, tap add to home screen</p>
        <p className="text-sm text-neutral-400">
          not there? tap edit actions at the bottom of the list (or more, on newer iOS)
        </p>
      </Step>
      <Step n={3} glyph={null}>
        <p>tap add, then open workout tracker from your home screen</p>
      </Step>
    </ol>
  )
}
