import { useRef, useState, type ChangeEvent } from 'react'
import { straddleAngleFromLandmarks, type Pt } from '../../lib/splitAngle'

/**
 * Experimental: estimate side-split angle from a photo using MediaPipe Pose,
 * loaded lazily from a CDN (so it doesn't bloat the main bundle and only runs
 * when the user opts in). Accuracy depends on a clear, front-on full-body shot.
 */

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

type Status = 'idle' | 'working' | 'done' | 'error'

// Minimal shapes we need from the lazily-imported MediaPipe module (avoids
// coupling the build to its full type surface).
type Landmarker = { detect: (img: HTMLImageElement) => { landmarks?: Pt[][] } }
type VisionModule = {
  FilesetResolver: { forVisionTasks: (wasmUrl: string) => Promise<unknown> }
  PoseLandmarker: { createFromOptions: (fileset: unknown, opts: unknown) => Promise<Landmarker> }
}

export function PoseMeasure({
  onAngle,
  onClose,
}: {
  onAngle: (deg: number) => void
  onClose: () => void
}) {
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const [angle, setAngle] = useState<number | null>(null)
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const landmarkerRef = useRef<Landmarker | null>(null)

  async function getLandmarker(): Promise<Landmarker> {
    if (landmarkerRef.current) return landmarkerRef.current
    setMessage('Loading pose model…')
    const vision = (await import('@mediapipe/tasks-vision')) as unknown as VisionModule
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL)
    const lm = await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL },
      runningMode: 'IMAGE',
      numPoses: 1,
    })
    landmarkerRef.current = lm
    return landmarkerRef.current
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setStatus('working')
    setAngle(null)
    const url = URL.createObjectURL(file)
    setImgUrl(url)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      const lm = await getLandmarker()
      setMessage('Detecting pose…')
      const result = lm.detect(img)
      const pts = result.landmarks?.[0]
      const deg = pts ? straddleAngleFromLandmarks(pts) : null
      if (deg == null) {
        setStatus('error')
        setMessage("Couldn't find your legs clearly. Use a full-body, front-on shot in good light.")
        return
      }
      setAngle(deg)
      setStatus('done')
      setMessage('')
    } catch {
      setStatus('error')
      setMessage('Pose detection failed to load (needs a connection). Enter the angle manually instead.')
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-lg font-bold">Measure from photo (beta)</h2>
        <button onClick={onClose} className="min-h-[44px] px-2 text-sm text-neutral-400">
          Close
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <p className="mb-3 text-sm text-neutral-400">
          Take a full-body, front-on photo in your widest split (whole body in frame, good light).
        </p>

        <label className="mb-4 block min-h-[52px] cursor-pointer rounded-2xl bg-accent text-center text-lg font-bold leading-[52px] text-black">
          {status === 'working' ? 'Working…' : '📷 Take / choose photo'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onFile}
            disabled={status === 'working'}
            className="hidden"
          />
        </label>

        {imgUrl && (
          <img src={imgUrl} alt="split" className="mb-3 max-h-72 w-full rounded-xl object-contain" />
        )}

        {message && <p className="text-sm text-neutral-400">{message}</p>}

        {status === 'done' && angle != null && (
          <div className="rounded-2xl bg-surface p-4 text-center">
            <p className="text-xs uppercase tracking-wide text-neutral-500">Estimated angle</p>
            <p className="text-5xl font-bold tabular-nums">{angle}°</p>
            <button
              onClick={() => {
                onAngle(angle)
                onClose()
              }}
              className="mt-4 min-h-[48px] w-full rounded-2xl bg-accent-2 font-bold text-black"
            >
              Use this angle
            </button>
            <p className="mt-2 text-xs text-neutral-500">You can adjust it before saving.</p>
          </div>
        )}
      </div>
    </div>
  )
}
