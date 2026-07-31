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

/**
 * Overlay the captured photo with draggable handles + lines so the user can
 * correct the auto-detected angle. Live-recomputes the angle(s) as they drag.
 */
export function AngleEditor({
  mode,
  imageUrl,
  initial,
  onSave,
  onCancel,
}: {
  mode: MeasureMode
  imageUrl: string
  initial: Handles
  onSave: (result: MeasureResult, handles: Handles) => void
  onCancel: () => void
}) {
  const [handles, setHandles] = useState<Handles>(initial)
  const containerRef = useRef<HTMLDivElement>(null)
  const activeKey = useRef<string | null>(null)

  const specs = HANDLES[mode]
  const segments = SEGMENTS[mode]
  const result = anglesFromHandles(mode, handles)

  const coordFromEvent = (e: PointerEvent): { x: number; y: number } | null => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return null
    return {
      x: clamp01((e.clientX - rect.left) / rect.width),
      y: clamp01((e.clientY - rect.top) / rect.height),
    }
  }

  const onHandleDown = (key: string) => (e: PointerEvent) => {
    e.preventDefault()
    activeKey.current = key
    containerRef.current?.setPointerCapture(e.pointerId)
  }

  const onMove = (e: PointerEvent) => {
    if (!activeKey.current) return
    const pt = coordFromEvent(e)
    if (!pt) return
    const key = activeKey.current
    setHandles((prev) => ({ ...prev, [key]: pt }))
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
          drag the dots so the lines trace your body. the angle updates live.
        </p>

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
            return (
              <button
                key={spec.key}
                onPointerDown={onHandleDown(spec.key)}
                aria-label={`move ${spec.label}`}
                className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full active:scale-110"
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              >
                <span className="h-5 w-5 rounded-full border-2 border-white bg-accent/80 shadow" />
              </button>
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
