import { detectPose, type PoseFailure } from './pose'
import { handlesFromLandmarks, type Handles, type MeasureMode } from './measure'

type Result = { ok: true; handles: Handles } | { ok: false; reason: PoseFailure | 'partial' }

/** Retry difficult folds in other orientations, keeping dots in original photo coordinates. */
export async function detectMeasurementPose(
  source: HTMLCanvasElement,
  mode: MeasureMode,
  mirrored = false,
): Promise<Result> {
  let reason: PoseFailure | 'partial' = 'no-pose'
  // Keep ordinary measurements to one inference. Retry only unusable toe touches.
  for (const turns of mode === 'toe_touch' ? [0, 1, 3, 2] : [0]) {
    let frame = source
    if (turns) {
      frame = document.createElement('canvas')
      // Bound temporary image memory for large camera-roll photos.
      const scale = Math.min(1, 1600 / Math.max(source.width, source.height))
      const width = Math.max(1, Math.round(source.width * scale))
      const height = Math.max(1, Math.round(source.height * scale))
      frame.width = turns % 2 ? height : width
      frame.height = turns % 2 ? width : height
      const ctx = frame.getContext('2d')
      if (!ctx) break
      ctx.translate(frame.width / 2, frame.height / 2)
      ctx.rotate(turns * Math.PI / 2)
      ctx.drawImage(source, -width / 2, -height / 2, width, height)
    }
    const result = await detectPose(frame)
    if (!result.ok) {
      if (result.reason === 'model') return result
      continue
    }
    reason = 'partial'
    const landmarks = result.landmarks.map((p) => {
      if (turns === 1) return { ...p, x: p.y, y: 1 - p.x }
      if (turns === 3) return { ...p, x: 1 - p.y, y: p.x }
      if (turns === 2) return { ...p, x: 1 - p.x, y: 1 - p.y }
      return p
    })
    const handles = handlesFromLandmarks(mode, landmarks, mirrored)
    if (handles) return { ok: true, handles }
  }
  return { ok: false, reason }
}
