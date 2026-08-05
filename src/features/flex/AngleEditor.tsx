import { useRef, useState, type PointerEvent } from 'react'
import {
  HANDLES,
  SEGMENTS,
  ROLE_COLOR,
  MEASURE_LABEL,
  anglesFromHandles,
  type Handles,
  type MeasureMode,
  type MeasureResult,
} from '../../lib/measure'

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** Distance from a dot to the tab you grab it by, so a finger never covers the dot. */
const GRIP_OFFSET_PX = 44

/**
 * Overlay the captured photo with draggable handles + lines so the user can
 * correct the auto-detected angle. Live-recomputes the angle(s) as they drag.
 *
 * `aspect` is the photo's width / height — handles are normalized per-axis, so
 * the angle can't be computed without it. `note` reports a detection that
 * failed or came back unusable, leaving the handles at their defaults;
 * `onRedetect` retries on the same photo.
 */
export function AngleEditor({
  mode,
  imageUrl,
  aspect,
  initial,
  note,
  detecting,
  onRedetect,
  onSave,
  onCancel,
}: {
  mode: MeasureMode
  imageUrl: string
  aspect: number
  initial: Handles
  note?: string | null
  detecting?: boolean
  onRedetect?: () => void
  onSave: (result: MeasureResult, handles: Handles) => void
  onCancel: () => void
}) {
  const [handles, setHandles] = useState<Handles>(initial)
  const containerRef = useRef<HTMLDivElement>(null)
  const activeKey = useRef<string | null>(null)
  /** Dot position minus pointer position at grab time, so the dot keeps its offset from the finger. */
  const grabOffset = useRef({ x: 0, y: 0 })

  // A retry hands down fresh handles, which replace whatever is on screen.
  const shown = useRef(initial)
  if (shown.current !== initial) {
    shown.current = initial
    setHandles(initial)
  }

  const specs = HANDLES[mode]
  const segments = SEGMENTS[mode]
  const result = anglesFromHandles(mode, handles, aspect)

  /** Pointer position in 0..1 image space, unclamped so grab offsets stay accurate at the edges. */
  const coordFromEvent = (e: PointerEvent): { x: number; y: number } | null => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return null
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    }
  }

  const onHandleDown = (key: string) => (e: PointerEvent) => {
    e.preventDefault()
    activeKey.current = key
    const pt = coordFromEvent(e)
    const p = handles[key]
    grabOffset.current = pt && p ? { x: p.x - pt.x, y: p.y - pt.y } : { x: 0, y: 0 }
    containerRef.current?.setPointerCapture(e.pointerId)
  }

  const onMove = (e: PointerEvent) => {
    if (!activeKey.current) return
    const pt = coordFromEvent(e)
    if (!pt) return
    const key = activeKey.current
    const { x: dx, y: dy } = grabOffset.current
    setHandles((prev) => ({ ...prev, [key]: { x: clamp01(pt.x + dx), y: clamp01(pt.y + dy) } }))
  }

  const onUp = (e: PointerEvent) => {
    activeKey.current = null
    containerRef.current?.releasePointerCapture?.(e.pointerId)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-lg font-bold">adjust {MEASURE_LABEL[mode].toLowerCase()} lines</h2>
        <button onClick={onCancel} className="min-h-[44px] px-2 text-sm text-neutral-400">
          cancel
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <p className="mb-3 text-sm text-neutral-400">
          drag the tabs so the lines trace your body. the angle updates live.
        </p>

        {note && (
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-surface p-3 text-sm text-neutral-300">
            <span className="flex-1">{note}</span>
            {onRedetect && (
              <button
                onClick={onRedetect}
                disabled={detecting}
                className="min-h-[40px] shrink-0 rounded-xl bg-surface-2 px-3 font-semibold disabled:opacity-40"
              >
                {detecting ? 'detecting…' : 'try again'}
              </button>
            )}
          </div>
        )}

        <div
          ref={containerRef}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="relative mx-auto w-full max-w-md touch-none select-none overflow-hidden rounded-2xl bg-black"
        >
          <img src={imageUrl} alt="measurement" className="block h-auto w-full" draggable={false} />

          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {segments.map((s, i) => {
              const a = handles[s.from]
              const b = handles[s.to]
              if (!a || !b) return null
              return (
                <line
                  key={i}
                  x1={a.x * 100}
                  y1={a.y * 100}
                  x2={b.x * 100}
                  y2={b.y * 100}
                  stroke={ROLE_COLOR[s.role]}
                  strokeWidth={2}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
          </svg>

          {specs.map((spec) => {
            const p = handles[spec.key]
            if (!p) return null
            // Grab tab sits above the dot, or below it when the dot is too near the top edge.
            const below = p.y < 0.15
            const dir = below ? 1 : -1
            const pos = { left: `${p.x * 100}%`, top: `${p.y * 100}%` }
            return (
              <div key={spec.key}>
                <span
                  className="pointer-events-none absolute w-0.5 bg-white/60"
                  style={{
                    ...pos,
                    height: GRIP_OFFSET_PX,
                    transform: `translateX(-50%) translateY(${below ? '0' : '-100%'})`,
                  }}
                />
                <span
                  className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent/80 shadow"
                  style={pos}
                />
                <button
                  onPointerDown={onHandleDown(spec.key)}
                  aria-label={`move ${spec.label}`}
                  className="absolute flex h-11 w-11 items-center justify-center active:scale-110"
                  style={{ ...pos, transform: `translate(-50%, calc(-50% + ${dir * GRIP_OFFSET_PX}px))` }}
                >
                  <span className="flex h-6 w-9 items-center justify-center gap-1 rounded-full border-2 border-white bg-accent/80 shadow">
                    <span className="h-3 w-0.5 rounded-full bg-black/50" />
                    <span className="h-3 w-0.5 rounded-full bg-black/50" />
                  </span>
                </button>
              </div>
            )
          })}
        </div>

        <div className="mt-4 rounded-2xl bg-surface p-4 text-center">
          {mode === 'split' ? (
            <>
              <p className="text-xs tracking-wide text-neutral-500">side split</p>
              <p className="text-5xl font-bold tabular-nums">{result.splitDeg ?? 0}°</p>
            </>
          ) : (
            <div className="flex justify-around">
              <div>
                <p className="text-xs tracking-wide text-neutral-500">left</p>
                <p className="text-4xl font-bold tabular-nums">{result.tailorsLeftDeg ?? 0}°</p>
              </div>
              <div>
                <p className="text-xs tracking-wide text-neutral-500">right</p>
                <p className="text-4xl font-bold tabular-nums">{result.tailorsRightDeg ?? 0}°</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border p-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
        <button
          onClick={() => onSave(result, handles)}
          className="min-h-[52px] w-full rounded-2xl bg-accent text-lg font-bold text-black active:opacity-80"
        >
          save angle
        </button>
      </div>
    </div>
  )
}
