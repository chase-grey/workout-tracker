import { useCallback, useEffect, useRef, useState } from 'react'
import { MdCameraAlt, MdCameraswitch, MdDownload, MdPhotoLibrary } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { detectPose } from '../../lib/pose'
import {
  HANDLES,
  SEGMENTS,
  ROLE_COLOR,
  MEASURE_LABEL,
  MEASURE_MODES,
  angleMarks,
  defaultHandles,
  handlesFromLandmarks,
  summarizeResult,
  verticalGuide,
  type Handles,
  type MeasureMode,
  type MeasureResult,
  type MeasureTemp,
} from '../../lib/measure'
import { toISODate } from '../../lib/dates'
import { AngleEditor } from './AngleEditor'

type Phase = 'setup' | 'countdown' | 'detecting' | 'editing'
type Facing = 'user' | 'environment'

/** Pill fill per reading, matching the cold blue / warm green of the charts. */
const TEMP_COLOR: Record<MeasureTemp, string> = { cold: '#38bdf8', warm: '#22c55e' }

const TIMER_CHOICES = [10, 20, 30, 45] as const

/** A detection that produced nothing usable, and what left the handles guessed. */
const DETECT_NOTE = {
  model: "couldn't load the pose model — these dots are a rough guess.",
  'no-pose': "couldn't find a body in this photo — these dots are a rough guess.",
  partial: "couldn't make out your body clearly — these dots are a rough guess.",
} as const

/**
 * Download the measured JPEG. Deliberately not the OS share sheet: sharing puts
 * the photo in front of a list of apps to send it to, when the only thing wanted
 * is a copy of it on the phone.
 */
function downloadPhoto(blob: Blob, name: string): void {
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
 * Burn the measurement onto the photo: draw the same lines and dots the editor
 * showed, arc each reading across the angle it measures, and stamp a caption
 * (pose + angles + date) so the saved image is self-explanatory. A cold/warm
 * reading also gets a pill in the top-right corner. Returns a fresh JPEG blob,
 * or null if the image can't be drawn (caller falls back to the raw photo).
 */
async function renderMeasuredPhoto(
  imageUrl: string,
  mode: MeasureMode,
  handles: Handles,
  result: MeasureResult,
  temp?: MeasureTemp,
): Promise<Blob | null> {
  const img = new Image()
  img.src = imageUrl
  try {
    await img.decode()
  } catch {
    return null
  }

  const W = img.naturalWidth
  const H = img.naturalHeight
  if (!W || !H) return null

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.drawImage(img, 0, 0, W, H)

  const unit = Math.min(W, H)
  const lineW = Math.max(3, Math.round(unit * 0.007))
  const dotR = lineW * 1.6
  const px = (p: { x: number; y: number }) => ({ x: p.x * W, y: p.y * H })

  // Plumb line, for a pose measured off vertical: the ray the numbers are read
  // against. Drawn under the body lines, and always long enough to clear the arc.
  const guide = verticalGuide(mode, handles)
  const marks = angleMarks(
    mode,
    Object.fromEntries(Object.entries(handles).map(([k, p]) => [k, px(p)])),
    result,
  )
  const maxRad = marks.length
    ? Math.max(...marks.map((m) => Math.min(m.reach * 0.42, unit * 0.12)))
    : 0
  if (guide) {
    const from = px(guide.from)
    ctx.save()
    ctx.setLineDash([lineW * 3, lineW * 2])
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(from.x, Math.min(guide.toY * H, from.y - maxRad * 1.35))
    ctx.strokeStyle = ROLE_COLOR.ref
    ctx.lineWidth = Math.max(2, lineW * 0.7)
    ctx.stroke()
    ctx.restore()
  }

  // Angle lines.
  ctx.lineCap = 'round'
  for (const s of SEGMENTS[mode]) {
    const a = handles[s.from]
    const b = handles[s.to]
    if (!a || !b) continue
    const pa = px(a)
    const pb = px(b)
    ctx.beginPath()
    ctx.moveTo(pa.x, pa.y)
    ctx.lineTo(pb.x, pb.y)
    ctx.strokeStyle = ROLE_COLOR[s.role]
    ctx.lineWidth = lineW
    ctx.stroke()
  }

  // Handle dots.
  for (const spec of HANDLES[mode]) {
    const p = handles[spec.key]
    if (!p) continue
    const c = px(p)
    ctx.beginPath()
    ctx.arc(c.x, c.y, dotR, 0, Math.PI * 2)
    ctx.fillStyle = '#22c55e'
    ctx.fill()
    ctx.lineWidth = Math.max(1, lineW * 0.5)
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()
  }

  const font = Math.round(unit * 0.05)
  ctx.font = `bold ${font}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  const stamp = (text: string, x: number, y: number, fill = '#ffffff') => {
    ctx.lineWidth = Math.max(2, font * 0.18)
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'
    ctx.strokeText(text, x, y)
    ctx.fillStyle = fill
    ctx.fillText(text, x, y)
  }

  const capH = Math.round(unit * 0.11)

  // Each reading gets an arc across the angle it actually measures, at the vertex
  // that angle opens from, with the number in the middle of the wedge — so what's
  // written is what the picture shows. Colored to match its line, which is what
  // tells the two tailor's readings apart.
  for (const m of marks) {
    const rad = Math.min(m.reach * 0.42, unit * 0.12)
    const a0 = Math.atan2(m.rays[0].y, m.rays[0].x)
    const a1 = Math.atan2(m.rays[1].y, m.rays[1].x)
    // Sweep the short way round, which is the angle that was logged (0..180).
    let delta = (a1 - a0) % (Math.PI * 2)
    if (delta > Math.PI) delta -= Math.PI * 2
    if (delta < -Math.PI) delta += Math.PI * 2
    ctx.beginPath()
    ctx.arc(m.vertex.x, m.vertex.y, rad, a0, a1, delta < 0)
    ctx.strokeStyle = ROLE_COLOR[m.role]
    ctx.lineWidth = Math.max(2, lineW * 0.8)
    ctx.stroke()

    const reachOut = rad + font * 0.85
    stamp(
      `${m.deg}°`,
      // Kept clear of the edges and the caption, so a wide angle whose wedge
      // points off-frame still reads.
      Math.min(W - font, Math.max(font, m.vertex.x + m.bisector.x * reachOut)),
      Math.min(H - capH - font * 0.6, Math.max(font, m.vertex.y + m.bisector.y * reachOut)),
      ROLE_COLOR[m.role],
    )
  }

  // Bottom caption: pose, angles, date.
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(0, H - capH, W, capH)
  const capFont = Math.round(unit * 0.045)
  ctx.font = `bold ${capFont}px system-ui, sans-serif`
  ctx.fillStyle = '#ffffff'
  ctx.fillText(
    `${MEASURE_LABEL[mode]} · ${summarizeResult(mode, result)}`,
    W / 2,
    H - capH * 0.62,
  )
  ctx.font = `${Math.round(unit * 0.03)}px system-ui, sans-serif`
  ctx.fillStyle = '#d4d4d4'
  ctx.fillText(toISODate(new Date()), W / 2, H - capH * 0.24)

  // Cold/warm pill, top-right.
  if (temp) {
    const pillFont = Math.round(unit * 0.04)
    ctx.font = `bold ${pillFont}px system-ui, sans-serif`
    const padX = pillFont * 0.7
    const pillH = Math.round(pillFont * 1.8)
    const pillW = Math.round(ctx.measureText(temp).width + padX * 2)
    const margin = Math.round(unit * 0.035)
    const x = W - margin - pillW
    const y = margin
    ctx.beginPath()
    // roundRect is missing on older Safari; a square pill beats losing the photo.
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, pillW, pillH, pillH / 2)
    else ctx.rect(x, y, pillW, pillH)
    ctx.fillStyle = TEMP_COLOR[temp]
    ctx.fill()
    ctx.lineWidth = Math.max(2, pillFont * 0.1)
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'
    ctx.stroke()
    ctx.fillStyle = '#000000'
    ctx.fillText(temp, x + pillW / 2, y + pillH / 2)
  }

  return canvasToBlob(canvas)
}

/**
 * Full-screen camera flow: live preview, a self-timer (default 30s) so you can
 * get into position, then an auto-capture that runs pose detection and opens the
 * draggable AngleEditor. On save it shows the measured photo and asks whether to
 * download it — the reading is logged either way, and nothing is kept here.
 */
export function CameraMeasure({
  mode: initialMode,
  temp,
  onDone,
  onClose,
}: {
  mode: MeasureMode
  /** Tags the saved photo — a corner pill and a filename token — when the shot
   *  is a cold or warm reading. */
  temp?: MeasureTemp
  onDone: (result: MeasureResult) => void
  onClose: () => void
}) {
  const { settings, updateSettings } = useData()
  const [mode, setMode] = useState<MeasureMode>(initialMode)
  const [phase, setPhase] = useState<Phase>('setup')
  const [facing, setFacing] = useState<Facing>('user')
  const [timerSec, setTimerSec] = useState<number>(settings.measureTimerSec ?? 30)
  const [remaining, setRemaining] = useState(timerSec)
  const [error, setError] = useState<string | null>(null)

  // Result of a capture, handed to the editor. `aspect` is the photo's
  // width / height, which the angle math needs; `note` is set when detection
  // failed and the handles are defaults rather than landmarks.
  const [shot, setShot] = useState<{
    url: string
    aspect: number
    handles: Handles
    note: string | null
  } | null>(null)
  /** Whether the frame we're working on is a mirror image (front-camera shot). */
  const mirroredRef = useRef(false)
  const [redetecting, setRedetecting] = useState(false)
  /** True while the measured photo is being drawn, between save and the prompt. */
  const [composing, setComposing] = useState(false)
  /** The measured photo, waiting on an answer to "save this photo?". */
  const [pending, setPending] = useState<{
    blob: Blob
    name: string
    url: string
    result: MeasureResult
  } | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const blobRef = useRef<Blob | null>(null)
  const capturedRef = useRef(false)
  /** The captured frame, kept so a failed detection can be retried on it. */
  const sourceRef = useRef<HTMLCanvasElement | null>(null)

  /**
   * Bumped on every stop, so a `getUserMedia` that resolves after we've moved on
   * knows its stream is stale and switches it off itself. Without this, closing
   * the screen while the permission prompt or camera warm-up is still pending
   * leaves the camera live with nothing left holding a reference to stop it —
   * and Android keeps a notification up under the app's name (`short_name`, so
   * "Lift") for exactly as long as a page holds the camera.
   */
  const streamGenRef = useRef(0)

  // The preview URL outlives the render that made it, so it's released when the
  // prompt is answered or the screen closes with it still up.
  useEffect(() => {
    if (!pending) return
    const { url } = pending
    return () => URL.revokeObjectURL(url)
  }, [pending])

  const stopStream = useCallback(() => {
    streamGenRef.current++
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const startStream = useCallback(async () => {
    stopStream()
    const gen = streamGenRef.current
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: false,
      })
      if (gen !== streamGenRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
    } catch {
      setError("couldn't open the camera. grant camera access, or choose a photo instead.")
    }
  }, [facing, stopStream])

  // Keep the live stream running while framing/counting down.
  useEffect(() => {
    if (phase === 'setup' || phase === 'countdown') void startStream()
    return stopStream
  }, [phase, startStream, stopStream])

  /**
   * Drop the camera while the app is backgrounded, and pick it up again on
   * return. A preview nobody can see is worth nothing, and leaving it running is
   * what turns "I got distracted and swiped home while framing a shot" into a
   * notification that sits there until the tab is closed. Only while framing:
   * the countdown stops the stream itself within seconds, at capture.
   */
  useEffect(() => {
    if (phase !== 'setup') return
    const onVisibilityChange = () => {
      if (document.hidden) stopStream()
      else void startStream()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase, startStream, stopStream])

  /**
   * Place the handles from detected landmarks. When detection fails, or the
   * landmarks it wants aren't confidently visible, fall back to defaults and
   * say so — a silent fallback reads as a bad measurement.
   */
  const runDetection = useCallback(
    async (canvas: HTMLCanvasElement): Promise<{ handles: Handles; note: string | null }> => {
      const res = await detectPose(canvas)
      if (!res.ok) return { handles: defaultHandles(mode), note: DETECT_NOTE[res.reason] }
      const handles = handlesFromLandmarks(mode, res.landmarks, mirroredRef.current)
      return handles
        ? { handles, note: null }
        : { handles: defaultHandles(mode), note: DETECT_NOTE.partial }
    },
    [mode],
  )

  /** Retry detection on the frame already captured, without retaking the photo. */
  const redetect = useCallback(async () => {
    const canvas = sourceRef.current
    if (!canvas || redetecting) return
    setRedetecting(true)
    const { handles, note } = await runDetection(canvas)
    setShot((prev) => (prev ? { ...prev, handles, note } : prev))
    setRedetecting(false)
  }, [redetecting, runDetection])

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
    sourceRef.current = canvas
    // The front camera hands back a mirror image, so the detector's sides are
    // reversed; the editor can flip this back if a device disagrees.
    mirroredRef.current = facing === 'user'
    stopStream()
    // Detection downloads its model on first use, which is slow enough to need
    // a state of its own rather than a frozen preview.
    setPhase('detecting')
    const { handles, note } = await runDetection(canvas)
    setShot({ url, aspect: canvas.width / canvas.height, handles, note })
    setPhase('editing')
  }, [facing, runDetection, stopStream])

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
      sourceRef.current = canvas
      mirroredRef.current = false
      setPhase('detecting')
      const { handles, note } = await runDetection(canvas)
      setShot({
        url: canvas.toDataURL('image/jpeg', 0.9),
        aspect: canvas.width / canvas.height,
        handles,
        note,
      })
      setPhase('editing')
    } catch {
      setError("couldn't read that image.")
      setPhase('setup')
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  const handleSave = (result: MeasureResult, handles: Handles) => {
    const name = `stretch-${toISODate(new Date())}-${mode}${temp ? `-${temp}` : ''}.jpg`
    const raw = blobRef.current
    const src = shot?.url
    setComposing(true)
    void (async () => {
      // The photo carries the angle lines + measurements burned in; fall back to
      // the plain capture if compositing fails for any reason.
      const composed = src
        ? await renderMeasuredPhoto(src, mode, handles, result, temp).catch(() => null)
        : null
      const out = composed ?? raw
      blobRef.current = null
      setComposing(false)
      // Ask before writing anything to the phone. With no photo to offer — a
      // capture that produced no blob at all — the reading still stands.
      if (out) setPending({ blob: out, name, url: URL.createObjectURL(out), result })
      else onDone(result)
    })()
  }

  /** Answer the save prompt, then hand the reading on. */
  const finishSave = (download: boolean) => {
    if (!pending) return
    if (download) downloadPhoto(pending.blob, pending.name)
    const { result } = pending
    setPending(null)
    onDone(result)
  }

  const retake = () => {
    blobRef.current = null
    sourceRef.current = null
    capturedRef.current = false
    setShot(null)
    setPhase('setup')
  }

  if (pending) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-bg px-4 pt-8">
        <h2 className="text-xl font-bold">save this photo?</h2>
        <div className="flex flex-1 items-center justify-center overflow-hidden py-4">
          <img
            src={pending.url}
            alt="measured stretch"
            className="max-h-full w-auto rounded-2xl object-contain"
          />
        </div>
        <div
          className="flex gap-2"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => finishSave(false)}
            className="min-h-[56px] flex-1 rounded-2xl bg-surface-2 font-semibold active:opacity-80"
          >
            don't save
          </button>
          <button
            onClick={() => finishSave(true)}
            className="flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-2xl bg-accent text-lg font-bold text-black active:opacity-80"
          >
            <MdDownload aria-hidden /> save
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'editing' && shot) {
    return (
      <AngleEditor
        mode={mode}
        imageUrl={shot.url}
        aspect={shot.aspect}
        initial={shot.handles}
        note={shot.note}
        detecting={redetecting}
        saving={composing}
        onRedetect={() => void redetect()}
        onSave={handleSave}
        onCancel={retake}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <header className="flex items-center justify-between px-4 py-3 text-white">
        <h2 className="text-lg font-bold">measure {MEASURE_LABEL[mode].toLowerCase()}</h2>
        <button onClick={onClose} className="min-h-[44px] px-2 text-sm text-neutral-300">
          close
        </button>
      </header>

      <div className="relative flex-1 overflow-hidden bg-black">
        <video ref={videoRef} playsInline muted className="h-full w-full object-contain" />

        {phase === 'countdown' && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
            <span className="font-mono text-9xl font-bold tabular-nums text-white drop-shadow-lg">
              {remaining}
            </span>
            <span className="text-sm tracking-widest text-white/80">get into position</span>
          </div>
        )}

        {phase === 'detecting' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/70">
            <span className="text-lg font-semibold text-white">finding your body…</span>
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
            {/* What we're measuring. Wrapping rather than one row: there are
                five poses now, and five labels across a phone are unreadable. */}
            <div className="flex flex-wrap gap-2">
              {MEASURE_MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`min-h-[40px] flex-1 basis-[30%] rounded-xl px-2 text-sm font-semibold ${
                    mode === m ? 'bg-accent text-black' : 'bg-white/10 text-neutral-200'
                  }`}
                >
                  {MEASURE_LABEL[m]}
                </button>
              ))}
            </div>

            {/* Self-timer length */}
            <div className="flex items-center gap-2">
              <span className="text-xs tracking-wide text-neutral-400">timer</span>
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
                <MdCameraAlt aria-hidden /> start {timerSec}s timer
              </button>
              <button
                onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
                aria-label="flip camera"
                className="flex min-h-[52px] w-14 items-center justify-center rounded-2xl bg-white/10"
              >
                <MdCameraswitch className="text-2xl" aria-hidden />
              </button>
            </div>

            <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl bg-white/5 text-sm text-neutral-300">
              <MdPhotoLibrary aria-hidden /> choose an existing photo
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
              capture now
            </button>
            <button onClick={retake} className="min-h-[52px] flex-1 rounded-2xl bg-white/10 font-semibold">
              cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
