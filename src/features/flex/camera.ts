import { useCallback, useRef, type RefObject } from 'react'

export type Facing = 'user' | 'environment'

/** A captured photo in hand, ready for detection and the editor. */
export type LiveFrame = {
  /** Kept so a failed detection can be retried on it. */
  canvas: HTMLCanvasElement
  /** The raw capture, the fallback if the measured photo can't be drawn. */
  blob: Blob | null
  url: string
  /** Whether it's a mirror image (front-camera shot). */
  mirrored: boolean
}

/**
 * A capture put by to measure later — just the JPEG. A burst holds several at
 * once, and full-resolution canvases and data URLs for each would be competing
 * with the pose model for the phone's memory.
 */
export type BurstFrame = { blob: Blob; mirrored: boolean }

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9))
}

function frameCanvas(video: HTMLVideoElement): HTMLCanvasElement | null {
  if (!video.videoWidth) return null
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas
}

// The front camera hands back a mirror image, so the detector's sides are
// reversed; the editor can flip this back if a device disagrees.
const isMirrored = (facing: Facing) => facing === 'user'

/** Take the preview's current frame, or null if the camera has nothing up yet. */
export async function grabFrame(video: HTMLVideoElement, facing: Facing): Promise<LiveFrame | null> {
  const canvas = frameCanvas(video)
  if (!canvas) return null
  return {
    canvas,
    blob: await canvasToBlob(canvas),
    url: canvas.toDataURL('image/jpeg', 0.9),
    mirrored: isMirrored(facing),
  }
}

/** Take the preview's current frame as a JPEG alone, to measure later. */
export async function snapFrame(video: HTMLVideoElement, facing: Facing): Promise<BurstFrame | null> {
  const canvas = frameCanvas(video)
  const blob = canvas && (await canvasToBlob(canvas))
  return blob ? { blob, mirrored: isMirrored(facing) } : null
}

/** Decode a JPEG back into a frame to measure. Throws if it can't be read. */
export async function openFrame(blob: Blob, mirrored: boolean): Promise<LiveFrame> {
  const img = new Image()
  const src = URL.createObjectURL(blob)
  img.src = src
  try {
    await img.decode()
  } finally {
    URL.revokeObjectURL(src)
  }
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  canvas.getContext('2d')?.drawImage(img, 0, 0)
  return { canvas, blob, url: canvas.toDataURL('image/jpeg', 0.9), mirrored }
}

/**
 * Start and stop the camera into `videoRef`.
 *
 * Every stop bumps a generation, so a `getUserMedia` that resolves after we've
 * moved on knows its stream is stale and switches it off itself. Without this,
 * closing the screen while the permission prompt or camera warm-up is still
 * pending leaves the camera live with nothing left holding a reference to stop
 * it — and Android keeps a notification up under the app's name (`short_name`,
 * so "Lift") for exactly as long as a page holds the camera.
 */
export function useCameraStream(
  videoRef: RefObject<HTMLVideoElement | null>,
  facing: Facing,
  onError: (message: string | null) => void,
) {
  const streamRef = useRef<MediaStream | null>(null)
  const genRef = useRef(0)

  const stopStream = useCallback(() => {
    genRef.current++
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const startStream = useCallback(async () => {
    stopStream()
    const gen = genRef.current
    onError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: false,
      })
      if (gen !== genRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
    } catch {
      onError('camera unavailable')
    }
  }, [facing, onError, stopStream, videoRef])

  return { startStream, stopStream }
}
