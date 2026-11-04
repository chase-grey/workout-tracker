import type { RhythmVariant } from './rhythmVariant'

/**
 * How the finishing white takes a rhythm shape. The guide draws the shape twice
 * once the set is done, in the set's own colour and in white, and masks the two
 * against each other so the white is seen to arrive rather than to have arrived.
 * Each shape gets the arrival that fits its own geometry:
 * - 'bloom': out from the centre, for shapes that breathe radially.
 * - 'rise' / 'fall': up from the floor or down from the top, for shapes whose
 *   whole story is vertical.
 * - 'sweep': left to right, for the few that read that way.
 * - 'clock': round the dial, for shapes that turn or sit in a ring.
 * - 'split': out from the centre line both ways, for the push/pull shapes whose
 *   two ends are the two directions you drive.
 * - 'dissolve': a plain crossfade, for the soft shapes a wipe would cut through.
 * - 'own': the shape paints its own transition (the wave's white runs along it).
 */
export type SpreadMode = 'bloom' | 'rise' | 'fall' | 'sweep' | 'clock' | 'split' | 'dissolve' | 'own'

/** How long the white takes to cover the shape. Slow enough to watch happen. */
export const SPREAD_MS = 900

/** Width of the soft edge, in percent of the frame (degrees, for the clock). */
export const FEATHER = 14

const MODES: Record<RhythmVariant, SpreadMode> = {
  // breathe
  orb: 'bloom',
  square: 'clock',
  rings: 'bloom',
  tide: 'rise',
  petals: 'clock',
  bars: 'sweep',
  halo: 'dissolve',
  // descent
  reach: 'fall',
  fold: 'fall',
  dive: 'fall',
  drip: 'rise',
  stairs: 'sweep',
  press: 'fall',
  // push/pull
  anvil: 'dissolve',
  chevrons: 'split',
  gauge: 'split',
  wave: 'own',
  // floss: the white spreads along the strand from its middle, whichever way it runs
  beads: 'bloom',
  thread: 'bloom',
  wake: 'bloom',
  grass: 'bloom',
  slats: 'bloom',
  tiles: 'bloom',
  capsule: 'bloom',
  kite: 'bloom',
  helix: 'bloom',
  fill: 'bloom',
  scan: 'bloom',
}

export const spreadMode = (variant: RhythmVariant): SpreadMode => MODES[variant]

/** Which of the two drawings a style is for. */
export type SpreadLayer = 'accent' | 'white'

export type SpreadStyle = {
  maskImage?: string
  WebkitMaskImage?: string
  opacity?: number
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const r = (n: number) => Math.round(n * 100) / 100

/**
 * A gradient from a list of stops, each a position and whether the white is
 * there. The accent drawing gets the same stops the other way round, so between
 * them the two always add up to one whole shape.
 */
function gradient(kind: string, head: string, stops: [number, boolean][], layer: SpreadLayer, unit = '%') {
  const colour = (white: boolean) => ((layer === 'white') === white ? '#000' : 'transparent')
  const list = stops.map(([pos, white]) => `${colour(white)} ${r(pos)}${unit}`).join(', ')
  return `${kind}(${head}, ${list})`
}

/**
 * Inline style for one of the two drawings when the white is `amount` (0–1) of
 * the way in. At 0 the white drawing is wholly hidden and the accent one wholly
 * shown; at 1 the reverse. 'own' has nothing to add. Both mask spellings are set,
 * since older WebKit only knows the prefixed one.
 */
export function spreadStyle(mode: SpreadMode, amount: number, layer: SpreadLayer): SpreadStyle {
  const s = clamp(amount, 0, 1)
  if (mode === 'own') return {}
  if (mode === 'dissolve') return { opacity: layer === 'white' ? s : 1 - s }
  let mask: string
  switch (mode) {
    case 'bloom': {
      const edge = -FEATHER + s * (100 + FEATHER)
      mask = gradient('radial-gradient', 'circle farthest-corner at 50% 50%', [[edge, true], [edge + FEATHER, false]], layer)
      break
    }
    case 'rise':
    case 'fall':
    case 'sweep': {
      const to = mode === 'rise' ? 'to top' : mode === 'fall' ? 'to bottom' : 'to right'
      const edge = -FEATHER + s * (100 + FEATHER)
      mask = gradient('linear-gradient', to, [[edge, true], [edge + FEATHER, false]], layer)
      break
    }
    case 'clock': {
      const edge = -FEATHER + s * (360 + FEATHER)
      mask = gradient('conic-gradient', 'from 0deg at 50% 50%', [[edge, true], [edge + FEATHER, false]], layer, 'deg')
      break
    }
    case 'split': {
      // A band about the centre line, grown until it covers the frame. Its half
      // height starts a feather short of nothing, so at 0 there is no line at all.
      const half = -FEATHER + s * (50 + 2 * FEATHER)
      const inner = clamp(50 - half, 0, 50)
      const outer = clamp(50 - half - FEATHER, 0, 50)
      mask = gradient(
        'linear-gradient',
        'to bottom',
        [[outer, false], [inner, true], [100 - inner, true], [100 - outer, false]],
        layer,
      )
      break
    }
  }
  return { maskImage: mask, WebkitMaskImage: mask }
}
