/**
 * The tissues the body-composition charts are drawn in: muscle, as a slab of
 * fibres running the way the chart runs, and fat, as a pack of round cells. Both
 * are SVG pattern tiles described here as plain geometry so the component only
 * has to print them, and so the tiles can be checked to repeat without a seam.
 *
 * Everything is drawn from a fixed seed: the fibres and cells are jittered so
 * they don't read as a grid, but the same jitter every render, or the texture
 * would crawl each time the chart redrew.
 */

import type { Palette } from './theme'

/** A muscle tile: wide enough to hide the repeat, taller than any plot so it never repeats downward. */
export const MUSCLE_TILE = { w: 96, h: 320 }
export const FAT_TILE = { w: 72, h: 54 }

/**
 * The tissues in the accent. Muscle is the deep, saturated end of the ladder
 * with lit strands running through it; fat the pale end, cells nearly white
 * with the membrane between them a shade darker; and the frame — bone, organs,
 * everything that is neither — is no tissue at all, so it takes the ground's
 * own neutral, hatched like a plan. Each has an `edge`, the line along its top
 * — the sheen on a muscle, the skin over fat — which is also the colour its
 * name is printed in.
 */
export function tissueColors({ scale, ground, theme }: Palette) {
  const light = theme.mode === 'light'
  return {
    muscle: {
      base: scale[light ? 600 : 700],
      light: scale[light ? 400 : 500],
      dark: scale[light ? 800 : 900],
      seam: light ? scale[900] : '#000000',
      edge: scale[light ? 800 : 300],
    },
    fat: {
      base: scale[300],
      cell: scale[100],
      wall: scale[400],
      edge: light ? scale[500] : scale[50],
    },
    frame: {
      base: ground.bodyBase,
      hatch: ground.zero,
      edge: ground.tick,
    },
  }
}
export type TissueColors = ReturnType<typeof tissueColors>

/** A deterministic 0–1 stream from a seed (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** One fibre across a muscle tile: a shallow wave at height `y`. */
export type Fiber = {
  y: number
  /** Half the wave's height. */
  amplitude: number
  /** How far along the wave the tile's left edge falls, 0–1 of a period. */
  phase: number
  width: number
  /** Which colour the fibre takes: a lit strand, a shaded one, or a seam between bundles. */
  tone: 'light' | 'dark' | 'seam'
  opacity: number
}

/** A muscle tile `height` tall, fibres from top to bottom; see {@link fiberPath} for their run. */
export function muscleFibers(height: number, seed = 7): Fiber[] {
  const rnd = seeded(seed)
  const fibers: Fiber[] = []
  let y = rnd() * 2
  let sinceSeam = 0
  while (y < height) {
    sinceSeam += 1
    // Every so often a heavier dark line: the gap between two bundles.
    const seam = sinceSeam > 5 && rnd() < 0.18
    if (seam) sinceSeam = 0
    fibers.push({
      y,
      amplitude: 0.6 + rnd() * 1.4,
      phase: rnd(),
      width: seam ? 1.4 + rnd() * 1.2 : 0.7 + rnd() * 1.3,
      tone: seam ? 'seam' : rnd() < 0.55 ? 'light' : 'dark',
      opacity: seam ? 0.55 + rnd() * 0.25 : 0.25 + rnd() * 0.6,
    })
    y += 2.2 + rnd() * 2.6
  }
  return fibers
}

/**
 * The path of one fibre across a tile, as two wavelengths that meet the next
 * tile mid-stroke: the curve runs from a wavelength before the left edge to one
 * past the right, so wherever `phase` puts the edge, the two sides join.
 */
export function fiberPath(f: Fiber, width: number): string {
  const quarter = width / 4
  const start = -width - f.phase * (width / 2)
  let d = `M ${start.toFixed(2)} ${f.y.toFixed(2)}`
  d += ` q ${(quarter / 2).toFixed(2)} ${(-f.amplitude).toFixed(2)} ${quarter.toFixed(2)} 0`
  // Enough reflected quarters to run clear past the right edge from any phase.
  for (let i = 0; i < 11; i++) d += ` t ${quarter.toFixed(2)} 0`
  return d
}

/** One cell in a fat tile. */
export type Cell = {
  cx: number
  cy: number
  rx: number
  ry: number
  /** Degrees. */
  tilt: number
}

/**
 * A fat tile: cells on a staggered grid, each nudged off it, and every cell that
 * crosses an edge drawn again on the far side so the tile repeats without a
 * seam. The cells overlap a little; packed tissue has no gaps to speak of.
 */
export function fatCells(width: number, height: number, seed = 11): Cell[] {
  const rnd = seeded(seed)
  const cols = Math.max(1, Math.round(width / 14))
  const rows = Math.max(1, Math.round(height / 12))
  const dx = width / cols
  const dy = height / rows
  const cells: Cell[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = (c + 0.5 + (r % 2 ? 0.5 : 0)) * dx + (rnd() - 0.5) * dx * 0.5
      const cy = (r + 0.5) * dy + (rnd() - 0.5) * dy * 0.4
      const rx = dx * (0.42 + rnd() * 0.2)
      const ry = dy * (0.42 + rnd() * 0.2)
      const tilt = (rnd() - 0.5) * 50
      // The cell itself and, for one that crosses an edge, its copies a tile over.
      for (const ox of [-width, 0, width]) {
        for (const oy of [-height, 0, height]) {
          const x = cx + ox
          const y = cy + oy
          const reach = Math.max(rx, ry)
          if (x + reach < 0 || x - reach > width || y + reach < 0 || y - reach > height) continue
          cells.push({ cx: x, cy: y, rx, ry, tilt })
        }
      }
    }
  }
  return cells
}
