import type { Pt } from './splitAngle'

/**
 * Lazy MediaPipe Pose landmark detector, loaded on first use so it stays out of
 * the main bundle and only downloads when a measurement is taken. Accepts any
 * canvas image source (image, canvas, or video frame).
 *
 * The runtime and model are served from our own origin (see mediapipeAssets in
 * vite.config.ts) rather than public CDNs: a phone that can't reach a CDN can
 * still measure, and the service worker caches both after the first download,
 * so measuring keeps working offline.
 */

const WASM_URL = `${import.meta.env.BASE_URL}mediapipe`
// "full" rather than "lite": we run this on one still photo, so landmark
// accuracy is worth far more than inference speed.
const MODEL_URL = `${import.meta.env.BASE_URL}mediapipe/pose_landmarker_full.task`

/** A landmark plus MediaPipe's confidence that the point is really in frame. */
export type Landmark = Pt & { visibility?: number }

/**
 * Why detection produced nothing: 'model' means the wasm/model download or
 * setup failed (offline, blocked CDN), 'no-pose' means it ran but found no
 * body in the frame. The distinction is what the editor tells the user.
 */
export type PoseFailure = 'model' | 'no-pose'

export type PoseResult =
  | { ok: true; landmarks: Landmark[] }
  | { ok: false; reason: PoseFailure; detail?: string }

// Minimal shapes we need from the lazily-imported module (avoids coupling the
// build to its full type surface).
type Landmarker = { detect: (img: CanvasImageSource) => { landmarks?: Landmark[][] } }
type VisionModule = {
  FilesetResolver: { forVisionTasks: (wasmUrl: string) => Promise<unknown> }
  PoseLandmarker: { createFromOptions: (fileset: unknown, opts: unknown) => Promise<Landmarker> }
}

let cached: Landmarker | null = null

async function getLandmarker(): Promise<Landmarker> {
  if (cached) return cached
  const vision = (await import('@mediapipe/tasks-vision')) as unknown as VisionModule
  const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL)
  cached = await vision.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL },
    runningMode: 'IMAGE',
    numPoses: 1,
  })
  return cached
}

/**
 * Detect the first person's pose landmarks. Never throws: a failed model load
 * and an empty frame come back as distinct failure reasons so the caller can
 * say which one happened instead of silently showing guessed handles.
 */
export async function detectPose(source: CanvasImageSource): Promise<PoseResult> {
  let landmarker: Landmarker
  try {
    landmarker = await getLandmarker()
  } catch (err) {
    return { ok: false, reason: 'model', detail: String(err) }
  }
  try {
    const landmarks = landmarker.detect(source).landmarks?.[0]
    if (!landmarks?.length) return { ok: false, reason: 'no-pose' }
    return { ok: true, landmarks }
  } catch (err) {
    return { ok: false, reason: 'no-pose', detail: String(err) }
  }
}
