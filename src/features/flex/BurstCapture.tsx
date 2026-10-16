import { useCallback, useEffect, useRef, useState } from 'react'
import { MdCameraAlt, MdCameraswitch } from 'react-icons/md'
import { preloadPose } from '../../lib/pose'
import { BURST_FIRST_SEC, PHOTO_SHOT, burstLeadSec, type PhotoKind } from '../../lib/photoSteps'
import { snapFrame, useCameraStream, type BurstFrame, type Facing } from './camera'

/**
 * Every shot of a gate off one tap: a self-timer to get into the first pose,
 * then a shorter one for each pose after, with the camera running throughout —
 * so the phone stays propped and you stay on the mat. Nothing is measured here;
 * the frames are handed back, one per shot (null where skipped), for
 * `CameraMeasure` to take through one at a time.
 *
 * Cancelling stops the run where it is and keeps what it has; starting again
 * picks up at the next shot, with the full first-shot timer.
 */
export function BurstCapture({
  shots,
  onDone,
}: {
  shots: PhotoKind[]
  onDone: (frames: (BurstFrame | null)[]) => void
}) {
  const [at, setAt] = useState(0)
  const [phase, setPhase] = useState<'setup' | 'countdown'>('setup')
  /** Which shot of the current uninterrupted run this is, for its timer. */
  const [run, setRun] = useState(0)
  const [remaining, setRemaining] = useState(BURST_FIRST_SEC)
  const [facing, setFacing] = useState<Facing>('user')
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const frames = useRef<(BurstFrame | null)[]>([])
  const snapping = useRef(false)
  const { startStream, stopStream } = useCameraStream(videoRef, facing, setError)

  // Load the detector now, before three captures are being held against it.
  useEffect(preloadPose, [])

  useEffect(() => {
    void startStream()
    return stopStream
  }, [startStream, stopStream])

  // A run can't go on without the camera, so leaving the app stops it there.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        stopStream()
        setPhase('setup')
      } else void startStream()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [startStream, stopStream])

  /** Settle the current shot and move to the next, or hand everything back. */
  const advance = useCallback(
    (frame: BurstFrame | null) => {
      frames.current[at] = frame
      if (at + 1 >= shots.length) {
        stopStream()
        onDone(shots.map((_, i) => frames.current[i] ?? null))
        return
      }
      setAt(at + 1)
      setRun((r) => r + 1)
    },
    [at, shots, onDone, stopStream],
  )

  const snap = useCallback(async () => {
    const video = videoRef.current
    if (snapping.current || !video) return
    snapping.current = true
    const frame = await snapFrame(video, facing)
    snapping.current = false
    if (!frame) {
      setPhase('setup')
      return
    }
    navigator.vibrate?.(200)
    setFlash(true)
    setTimeout(() => setFlash(false), 150)
    advance(frame)
  }, [facing, advance])
  // Read by the countdown at zero, so a re-render above — the session's clock
  // ticking — can't restart a timer that's already running.
  const snapRef = useRef(snap)
  snapRef.current = snap

  // Wall-clock countdown (survives background throttling) → snap at 0, per shot.
  useEffect(() => {
    if (phase !== 'countdown') return
    const end = Date.now() + burstLeadSec(run) * 1000
    let lastBeep = -1
    let fired = false
    const tick = () => {
      const r = Math.max(0, Math.ceil((end - Date.now()) / 1000))
      setRemaining(r)
      if (r <= 3 && r > 0 && r !== lastBeep) {
        lastBeep = r
        navigator.vibrate?.(80)
      }
      if (!fired && Date.now() >= end) {
        fired = true
        void snapRef.current()
      }
    }
    tick()
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [phase, at, run])

  const start = () => {
    setRun(0)
    setPhase('countdown')
  }

  const label = PHOTO_SHOT[shots[at]].label
  const left = shots.length - at

  return (
    <div className="keep-dark fixed inset-0 z-50 flex flex-col bg-black">
      <header className="flex items-center justify-between gap-2 px-4 py-3 text-white">
        <h2 className="text-lg font-bold">{label}</h2>
        <div className="flex shrink-0 gap-1">
          {left > 1 && (
            <button
              onClick={() => {
                stopStream()
                onDone(shots.map((_, i) => frames.current[i] ?? null))
              }}
              className="min-h-[44px] px-2 text-sm text-neutral-400"
            >
              skip all
            </button>
          )}
          <button onClick={() => advance(null)} className="min-h-[44px] px-2 text-sm font-semibold text-neutral-200">
            skip
          </button>
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden bg-black">
        <video ref={videoRef} playsInline muted className="h-full w-full object-contain" />

        {phase === 'countdown' && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
            <span className="font-mono text-9xl font-bold tabular-nums text-white drop-shadow-lg">
              {remaining}
            </span>
            <span className="text-3xl font-bold text-white drop-shadow-lg">{label}</span>
          </div>
        )}

        {flash && <div className="pointer-events-none absolute inset-0 bg-white/80" />}

        {error && (
          <div className="absolute inset-x-4 bottom-4 rounded-xl bg-black/80 p-3 text-center text-sm text-neutral-200">
            {error}
          </div>
        )}
      </div>

      <div
        className="bg-black px-4 pt-3 text-white"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        {phase === 'setup' ? (
          <div className="flex gap-2">
            <button
              onClick={start}
              className="flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-2xl bg-accent text-lg font-bold text-on-accent active:opacity-80"
            >
              <MdCameraAlt aria-hidden /> start {BURST_FIRST_SEC}s timer
            </button>
            <button
              onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
              aria-label="flip camera"
              className="flex min-h-[56px] w-14 items-center justify-center rounded-2xl bg-white/10"
            >
              <MdCameraswitch className="text-2xl" aria-hidden />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => void snap()}
              className="min-h-[52px] flex-1 rounded-2xl bg-accent text-lg font-bold text-on-accent"
            >
              capture now
            </button>
            <button
              onClick={() => setPhase('setup')}
              className="min-h-[52px] flex-1 rounded-2xl bg-white/10 font-semibold"
            >
              cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
