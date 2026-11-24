import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import {
  HANDLES,
  SEGMENTS,
  ROLE_COLOR,
  MEASURE_LABEL,
  anglesFromHandles,
  resultReadings,
  hasSides,
  swapSides,
  verticalGuide,
  levelGuide,
  type Handles,
  type MeasureMode,
  type MeasureResult,
} from '../../lib/measure'
import { TAG_OVERHANG, labelAnchors, type LabelAnchor } from '../../lib/handleLabels'
import { PoseGuide } from './PoseGuide'

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** Distance from a dot to the tab you grab it by, so a finger never covers the dot. */
const GRIP_OFFSET_PX = 44

/** Where a name tag sits across its dot, per anchor. */
const TAG_SHIFT: Record<LabelAnchor, string> = {
  start: `-${TAG_OVERHANG}px`,
  center: '-50%',
  end: `calc(-100% + ${TAG_OVERHANG}px)`,
}

/**
 * Overlay the captured photo with draggable handles + lines so the user can
 * correct the auto-detected angle. Live-recomputes the angle(s) as they drag.
 *
 * Nothing here scrolls: the photo is sized to whatever the header, the reading
 * and the save button leave, so the number being logged is on screen the whole
 * time a dot is being dragged. Each dot is grabbed by a tag that carries its
 * name; the pelvic tilt, whose dots sit on bones a name doesn't find, also gets
 * a figure beside the reading showing where they go.
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
  saving,
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
  /** The photo is being drawn up for the save prompt — one tap is enough. */
  saving?: boolean
  onRedetect?: () => void
  onSave: (result: MeasureResult, handles: Handles) => void
  onCancel: () => void
}) {
  const [handles, setHandles] = useState<Handles>(initial)
  const containerRef = useRef<HTMLDivElement>(null)
  const activeKey = useRef<string | null>(null)
  /** Dot position minus pointer position at grab time, so the dot keeps its offset from the finger. */
  const grabOffset = useRef({ x: 0, y: 0 })
  /** The room left for the photo, measured, so it can be fitted without scrolling. */
  const stageRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  /** The tags' sides as they stood when a drag began, so one can't jump mid-drag. */
  const [heldAnchors, setHeldAnchors] = useState<Record<string, LabelAnchor> | null>(null)

  // A retry hands down fresh handles, which replace whatever is on screen.
  const shown = useRef(initial)
  if (shown.current !== initial) {
    shown.current = initial
    setHandles(initial)
  }

  const specs = HANDLES[mode]
  const segments = SEGMENTS[mode]
  const result = anglesFromHandles(mode, handles, aspect)
  const readings = resultReadings(mode, result)
  // Tailor's angles are read off straight up, so the vertical has to be on screen
  // too — otherwise the lines being dragged have nothing to be judged against.
  const guide = verticalGuide(mode, handles)
  const level = levelGuide(mode, handles)
  // The largest box of the photo's shape that fits the room there is.
  const boxW = stage ? Math.max(0, Math.min(stage.w, stage.h * aspect, 448)) : 0
  const box = { width: boxW, height: boxW / aspect }
  const anchors = heldAnchors ?? labelAnchors(handles, specs, boxW, stage ? (stage.w - boxW) / 2 : 0)

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
    setHeldAnchors(anchors)
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
    setHeldAnchors(null)
    containerRef.current?.releasePointerCapture?.(e.pointerId)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      <header className="flex items-center justify-between border-b border-border px-4 py-1.5">
        <h2 className="text-lg font-bold">adjust {MEASURE_LABEL[mode].toLowerCase()} lines</h2>
        <button onClick={onCancel} className="min-h-[44px] px-2 text-sm text-neutral-400">
          retake
        </button>
      </header>

      {note && (
        <div className="mx-3 mt-2 flex items-center gap-3 rounded-xl bg-surface px-3 py-1.5 text-sm text-neutral-300">
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

      <div className="min-h-0 flex-1 p-3">
      <div ref={stageRef} className="flex h-full w-full items-center justify-center">
        <div
          ref={containerRef}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          style={box}
          className="relative shrink-0 touch-none select-none"
        >
          <img src={imageUrl} alt="measurement" className="block h-full w-full rounded-2xl bg-black" draggable={false} />

          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {guide && (
              <line
                x1={guide.from.x * 100}
                y1={guide.from.y * 100}
                x2={guide.from.x * 100}
                y2={Math.max(0, guide.toY) * 100}
                stroke={ROLE_COLOR.ref}
                strokeWidth={1}
                strokeDasharray="2 1.5"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {level && (
              <line
                x1={level.from.x * 100}
                y1={level.from.y * 100}
                x2={Math.min(1, Math.max(0, level.toX)) * 100}
                y2={level.from.y * 100}
                stroke={ROLE_COLOR.ref}
                strokeWidth={1}
                strokeDasharray="2 1.5"
                vectorEffect="non-scaling-stroke"
              />
            )}
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
                  className="absolute flex h-11 items-center active:scale-105"
                  style={{
                    ...pos,
                    transform: `translate(${TAG_SHIFT[anchors[spec.key] ?? 'center']}, calc(-50% + ${dir * GRIP_OFFSET_PX}px))`,
                  }}
                >
                  <span className="flex h-7 items-center whitespace-nowrap rounded-full border-2 border-white bg-accent px-2.5 text-xs font-semibold text-on-accent shadow">
                    {spec.label}
                  </span>
                </button>
              </div>
            )
          })}
        </div>

      </div>
      </div>

      <div className="border-t border-border px-4 pt-2" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
        <div className="mb-2 flex items-center gap-3">
          <PoseGuide mode={mode} handles={handles} className="h-[72px] w-[72px] shrink-0" />
          {/* One reading gets the big type; a pose that produces a pair splits
              the row between them. */}
          <div className="flex min-w-0 flex-1 justify-around text-center">
            {readings.map((r) => (
              <div key={r.label}>
                <p className="text-xs tracking-wide text-neutral-500">{r.label}</p>
                <p className={`font-bold tabular-nums ${readings.length > 1 ? 'text-3xl' : 'text-4xl'}`}>
                  {r.deg}°
                </p>
              </div>
            ))}
          </div>
          {hasSides(mode) && (
            <button
              onClick={() => setHandles((prev) => swapSides(mode, prev))}
              className="min-h-[44px] shrink-0 rounded-xl bg-surface-2 px-3 text-sm font-semibold"
            >
              swap sides
            </button>
          )}
        </div>
        <button
          onClick={() => onSave(result, handles)}
          disabled={saving}
          className="min-h-[52px] w-full rounded-2xl bg-accent text-lg font-bold text-on-accent active:opacity-80 disabled:opacity-50"
        >
          save angle
        </button>
      </div>
    </div>
  )
}
