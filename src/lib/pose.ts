import type { Pt } from './splitAngle'

/**
 * Lazy MediaPipe Pose landmark detector, loaded from a CDN on first use so it
 * stays out of the main bundle and only downloads when a measurement is taken.
 * Accepts any canvas image source (image, canvas, or video frame).
 */

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

// Minimal shapes we need from the lazily-imported module (avoids coupling the
// build to its full type surface).
type Landmarker = { detect: (img: CanvasImageSource) => { landmarks?: Pt[][] } }
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

/** Detect the first person's pose landmarks, or null if none were found. */
export async function detectPose(source: CanvasImageSource): Promise<Pt[] | null> {
  const lm = await getLandmarker()
  const result = lm.detect(source)
  return result.landmarks?.[0] ?? null
}
