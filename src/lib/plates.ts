export type PlatePair = { plate: number; count: number } // count = plates PER SIDE
export type PlateResult = { perSide: PlatePair[]; achievable: number; leftover: number }

const DEFAULT_PLATES = [45, 35, 25, 10, 5, 2.5]

export function computePlates(
  targetLbs: number,
  opts?: { barLbs?: number; plates?: number[] }
): PlateResult {
  if (!Number.isFinite(targetLbs) || targetLbs <= 0) {
    return { perSide: [], achievable: 0, leftover: 0 }
  }

  const barLbs = opts?.barLbs ?? 45
  const plates = (opts?.plates ?? DEFAULT_PLATES).slice().sort((a, b) => b - a)

  if (targetLbs <= barLbs) {
    return { perSide: [], achievable: barLbs, leftover: 0 }
  }

  let remaining = (targetLbs - barLbs) / 2
  const perSide: PlatePair[] = []

  for (const plate of plates) {
    if (plate <= 0) continue
    const count = Math.floor(remaining / plate)
    if (count > 0) {
      perSide.push({ plate, count })
      remaining -= count * plate
    }
  }

  const perSideWeight = perSide.reduce((sum, p) => sum + p.plate * p.count, 0)
  const achievable = barLbs + 2 * perSideWeight
  const leftover = Math.max(0, targetLbs - achievable)

  return { perSide, achievable, leftover }
}
