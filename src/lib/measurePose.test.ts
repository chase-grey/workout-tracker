import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectPose, type Landmark } from './pose'
import { detectMeasurementPose } from './measurePose'
import { anglesFromHandles } from './measure'
import { POSE } from './splitAngle'

vi.mock('./pose', () => ({ detectPose: vi.fn() }))
const detect = vi.mocked(detectPose)
const source = { width: 1200, height: 800 } as HTMLCanvasElement
const body = (): Landmark[] => {
  const points = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0.1 }))
  points[POSE.LEFT_SHOULDER] = { x: 0.2, y: 0.6, visibility: 0.9 }
  points[POSE.LEFT_HIP] = { x: 0.5, y: 0.4, visibility: 0.9 }
  points[POSE.LEFT_ANKLE] = { x: 0.5, y: 0.9, visibility: 0.9 }
  return points
}
const mockCanvas = () => {
  const ctx = { translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn() }
  const createElement = vi.fn(() => ({ width: 0, height: 0, getContext: () => ctx }))
  vi.stubGlobal('document', { createElement })
  return { ctx, createElement }
}
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals() })

describe('measurement pose recovery', () => {
  it('uses a usable original result without creating retry images', async () => {
    detect.mockResolvedValue({ ok: true, landmarks: body() })
    const result = await detectMeasurementPose(source, 'toe_touch')
    expect(result.ok).toBe(true)
    expect(detect).toHaveBeenCalledTimes(1)
  })

  it.each([1, 3, 2])('maps a %s-quarter-turn retry back to the original landscape photo', async (turns) => {
    const { ctx } = mockCanvas()
    const order = [1, 3, 2]
    for (let i = 0; i <= order.indexOf(turns); i++) {
      detect.mockResolvedValueOnce({ ok: false, reason: 'no-pose' })
    }
    const rotated = body().map((p) => ({ ...p,
      ...(turns === 1 ? { x: 1 - p.y, y: p.x }
        : turns === 3 ? { x: p.y, y: 1 - p.x }
          : { x: 1 - p.x, y: 1 - p.y }),
    }))
    detect.mockResolvedValueOnce({ ok: true, landmarks: rotated })
    const result = await detectMeasurementPose(source, 'toe_touch')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected recovered pose')
    expect(result.handles.shoulder.x).toBeCloseTo(0.2)
    expect(result.handles.shoulder.y).toBeCloseTo(0.6)
    expect(result.handles.hip.x).toBeCloseTo(0.5)
    expect(result.handles.hip.y).toBeCloseTo(0.4)
    expect(anglesFromHandles('toe_touch', result.handles, 1.5).toeTouchDeg).toBeCloseTo(66, 0)
    expect(ctx.rotate).toHaveBeenLastCalledWith(turns * Math.PI / 2)
    const lastFrame = detect.mock.calls.at(-1)![0] as HTMLCanvasElement
    expect([lastFrame.width, lastFrame.height]).toEqual(turns % 2 ? [800, 1200] : [1200, 800])
  })

  it('retries a detected body whose measurement joints are hidden', async () => {
    mockCanvas()
    detect.mockResolvedValueOnce({ ok: true, landmarks: [] })
    detect.mockResolvedValue({ ok: false, reason: 'no-pose' })
    expect(await detectMeasurementPose(source, 'toe_touch')).toEqual({ ok: false, reason: 'partial' })
    expect(detect).toHaveBeenCalledTimes(4)
  })

  it('stops after four misses without inventing landmarks', async () => {
    mockCanvas()
    detect.mockResolvedValue({ ok: false, reason: 'no-pose' })
    expect(await detectMeasurementPose(source, 'toe_touch')).toEqual({ ok: false, reason: 'no-pose' })
    expect(detect).toHaveBeenCalledTimes(4)
  })

  it('does not retry model load failures', async () => {
    detect.mockResolvedValue({ ok: false, reason: 'model' })
    expect(await detectMeasurementPose(source, 'toe_touch')).toEqual({ ok: false, reason: 'model' })
    expect(detect).toHaveBeenCalledTimes(1)
  })

  it('leaves other measurement modes on their original image', async () => {
    detect.mockResolvedValue({ ok: false, reason: 'no-pose' })
    await detectMeasurementPose(source, 'split')
    expect(detect).toHaveBeenCalledTimes(1)
  })
})
