import type { MeasurementEntry } from '../lib/bodyComp'

/**
 * Known historical body-measurement / visibility anchors, merged (read-only)
 * with logged measurements so the personal six-pack curve has real reference
 * points from before the app tracked them. Not written back to the Sheet.
 *
 * 2025-10-31: ~11% body fat (measured, not tape-estimated) with no visible
 * six-pack — the data point that shows the visibility threshold is lower than
 * the generic 12% and that ab-muscle thickness, not just leanness, is the limiter.
 */
export const MEASUREMENT_HISTORY: MeasurementEntry[] = [
  {
    date: '2025-10-31',
    bodyFatPct: 11,
    absVisibility: 'none',
    note: 'Baseline: 11% BF, abs not yet visible',
  },
]
