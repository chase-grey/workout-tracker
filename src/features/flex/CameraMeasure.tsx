import { useCallback, useEffect, useRef, useState } from 'react'
import { MdCameraAlt, MdCameraswitch, MdPhotoLibrary } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { detectPose } from '../../lib/pose'
import {
  MEASURE_LABEL,
  defaultHandles,
  handlesFromLandmarks,
  type Handles,
  type MeasureMode,
  type MeasureResult,
} from '../../lib/measure'
import { toISODate } from '../../lib/dates'
import { AngleEditor } from './AngleEditor'

type Phase = 'setup' | 'countdown' | 'editing'
type Facing = 'user' | 'environment'

const TIMER_CHOICES = [10, 20, 30, 45] as const

/** Hand the captured JPEG to the OS share/save sheet; fall back to a download. */
async function savePhoto(blob: Blob, name: string): Promise<void> {
  const file = new File([blob], name, { type: 'image/jpeg' })
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
  if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
    await nav.share({ files: [file], title: 'Stretch photo' })
    return
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9))
}

/**
 * Full-screen camera flow: live preview, a self-timer (default 30s) so you can
 * get into position, then an auto-capture that runs pose detection and opens the
 * draggable AngleEditor. On save it hands the photo to the OS share sheet (so it
 * lands in your gallery) and keeps nothing itself.
 */
export function CameraMeasure({
  mode: initialMode,
  onDone,
  onClose,
}: {
  mode: MeasureMode
  onDone: (result: MeasureResult) => void
  onClose: () => void
}) {
  const { settings, updateSettings } = useData()
  const [mode, setMode] = useState<MeasureMode>(initialMode)
  const [phase, setPhase] = useState<Phase>('setup')
  const [facing, setFacing] = useState<Facing>('environment')
  const [timerSec, setTimerSec] = useState<number>(settings.measureTimerSec ?? 30)
  const [remaining, setRemaining] = useState(timerSec)
  const [error, setError] = useState<string | null>(null)

  // Result of a capture, handed to the editor.
  const [shot, setShot] = useState<{ url: string; handles: Handles } | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const blobRef = useRef<Blob | null>(null)
  const capturedRef = useRef(false)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const startStream = useCallback(async () => {
    stopStream()
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
    } catch {
      setError("Couldn't open the camera. Grant camera access, or choose a photo instead.")
    }
  }, [facing, stopStream])

  // Keep the live stream running while framing/counting down.
  useEffect(() => {
    if (phase === 'setup' || phase === 'countdown') void startStream()
    return stopStream
  }, [phase, startStream, stopStream])

  const runDetection = useCallback(
    async (canvas: HTMLCanvasElement): Promise<Handles> => {
      try {
        const lms = await detectPose(canvas)
        if (lms) return handlesFromLandmarks(mode, lms) ?? defaultHandles(mode)
      } catch {
        /* offline / model failed — fall back to manual placement */
      }
      return defaultHandles(mode)
    },
    [mode],
  )

  const capture = useCallback(async () => {
    if (capturedRef.current) return
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    capturedRef.current = true
    navigator.vibrate?.(200)

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    blobRef.current = await canvasToBlob(canvas)
    const url = canvas.toDataURL('image/jpeg', 0.9)
    const handles = await runDetection(canvas)
    stopStream()
    setShot({ url, handles })
    setPhase('editing')
  }, [runDetection, stopStream])

  // Wall-clock countdown (survives background throttling) → auto-capture at 0.
  useEffect(() => {
    if (phase !== 'countdown') return
    const end = Date.now() + timerSec * 1000
    let lastBeep = -1
    const tick = () => {
      const r = Math.max(0, Math.ceil((end - Date.now()) / 1000))
      setRemaining(r)
      if (r <= 3 && r > 0 && r !== lastBeep) {
        lastBeep = r
        navigator.vibrate?.(80)
      }
      if (Date.now() >= end) void capture()
    }
    tick()
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [phase, timerSec, capture])

  const startTimer = () => {
    updateSettings({ ...settings, measureTimerSec: timerSec })
    capturedRef.current = false
    setRemaining(timerSec)
    setPhase('countdown')
  }

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    stopStream()
    blobRef.current = file
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.src = url
    try {
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d')?.drawImage(img, 0, 0)
      const handles = await runDetection(canvas)
      setShot({ url: canvas.toDataURL('image/jpeg', 0.9), handles })
      setPhase('editing')
    } catch {
      setError("Couldn't read that image.")
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  const handleSave = (result: MeasureResult) => {
    if (blobRef.current) {
      const name = `stretch-${toISODate(new Date())}-${mode}.jpg`
      void savePhoto(blobRef.current, name).catch(() => {})
    }
    blobRef.current = null
    onDone(result)
  }

  const retake = () => {
    blobRef.current = null
    capturedRef.current = false
    setShot(null)
    setPhase('setup')
  }

  if (phase === 'editing' && shot) {
    return (
      <AngleEditor mode={mode} imageUrl={shot.url} initial={shot.handles} onSave={handleSave} onCancel={retake} />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <header className="flex items-center justify-between px-4 py-3 text-white">
        <h2 className="text-lg font-bold">Measure {MEASURE_LABEL[mode].toLowerCase()}</h2>
        <button onClick={onClose} className="min-h-[44px] px-2 text-sm text-neutral-300">
          Close
        </button>
      </header>

      <div className="relative flex-1 overflow-hidden bg-black">
        <video ref={videoRef} playsInline muted className="h-full w-full object-contain" />

        {phase === 'countdown' && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
            <span className="font-mono text-9xl font-bold tabular-nums text-white drop-shadow-lg">
              {remaining}
            </span>
            <span className="text-sm uppercase tracking-widest text-white/80">Get into position</span>
          </div>
        )}

        {error && (
          <div className="absolute inset-x-4 bottom-4 rounded-xl bg-black/80 p-3 text-center text-sm text-neutral-200">
            {error}
          </div>
        )}
      </div>

      <div
        className="space-y-3 bg-black px-4 pt-3 text-white"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        {phase === 'setup' && (
          <>
            {/* What we're measuring */}
            <div className="flex gap-2">
              {(['split', 'tailors'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`min-h-[40px] flex-1 rounded-xl text-sm font-semibold ${
                    mode === m ? 'bg-accent text-black' : 'bg-white/10 text-neutral-200'
                  }`}
                >
                  {MEASURE_LABEL[m]}
                </button>
              ))}
            </div>

            {/* Self-timer length */}
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-neutral-400">Timer</span>
              {TIMER_CHOICES.map((s) => (
                <button
                  key={s}
                  onClick={() => setTimerSec(s)}
                  className={`min-h-[40px] flex-1 rounded-xl text-sm font-semibold ${
                    timerSec === s ? 'bg-white/90 text-black' : 'bg-white/10 text-neutral-200'
                  }`}
                >
                  {s}s
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={startTimer}
                className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-accent text-lg font-bold text-black active:opacity-80"
              >
                <MdCameraAlt aria-hidden /> Start {timerSec}s timer
              </button>
              <button
                onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
                aria-label="Flip camera"
                className="flex min-h-[52px] w-14 items-center justify-center rounded-2xl bg-white/10"
              >
                <MdCameraswitch className="text-2xl" aria-hidden />
              </button>
            </div>

            <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl bg-white/5 text-sm text-neutral-300">
              <MdPhotoLibrary aria-hidden /> Choose an existing photo
              <input type="file" accept="image/*" onChange={onPickFile} className="hidden" />
            </label>
          </>
        )}

        {phase === 'countdown' && (
          <div className="flex gap-2">
            <button
              onClick={() => void capture()}
              className="min-h-[52px] flex-1 rounded-2xl bg-accent text-lg font-bold text-black"
            >
              Capture now
            </button>
            <button onClick={retake} className="min-h-[52px] flex-1 rounded-2xl bg-white/10 font-semibold">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
