import { useMemo } from 'react'
import { FAT_TILE, fatCells, fiberPath, MUSCLE_TILE, muscleFibers, type TissueColors } from '../../lib/tissue'

/** The frame's hatch: a square tile of one diagonal, small enough to read as grain rather than lines. */
const FRAME_TILE = 8

/**
 * The SVG pattern tiles the tissues are drawn in, under the ids given, for a
 * chart's `<defs>`. Pass only the ids a chart fills with; the frame's is for
 * the whole-body chart alone.
 */
export function TissuePatterns({
  ids,
  colors,
}: {
  ids: { muscle: string; fat: string; frame?: string }
  colors: TissueColors
}) {
  const fibers = useMemo(() => muscleFibers(MUSCLE_TILE.h), [])
  const cells = useMemo(() => fatCells(FAT_TILE.w, FAT_TILE.h), [])
  const toneColor = { light: colors.muscle.light, dark: colors.muscle.dark, seam: colors.muscle.seam }
  return (
    <defs>
      <pattern id={ids.muscle} patternUnits="userSpaceOnUse" width={MUSCLE_TILE.w} height={MUSCLE_TILE.h}>
        <rect width={MUSCLE_TILE.w} height={MUSCLE_TILE.h} fill={colors.muscle.base} />
        {fibers.map((f, i) => (
          <path
            key={i}
            d={fiberPath(f, MUSCLE_TILE.w)}
            fill="none"
            stroke={toneColor[f.tone]}
            strokeWidth={f.width}
            strokeOpacity={f.opacity}
            strokeLinecap="round"
          />
        ))}
      </pattern>
      <pattern id={ids.fat} patternUnits="userSpaceOnUse" width={FAT_TILE.w} height={FAT_TILE.h}>
        <rect width={FAT_TILE.w} height={FAT_TILE.h} fill={colors.fat.base} />
        {cells.map((c, i) => (
          <g key={i} transform={`rotate(${c.tilt.toFixed(1)} ${c.cx.toFixed(2)} ${c.cy.toFixed(2)})`}>
            {/* A shadow under the cell's lower edge, so each one rounds up off its neighbours. */}
            <ellipse cx={c.cx + 0.6} cy={c.cy + 1} rx={c.rx} ry={c.ry} fill={colors.fat.wall} fillOpacity={0.5} />
            <ellipse cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry} fill={colors.fat.cell} stroke={colors.fat.wall} strokeWidth={0.6} />
          </g>
        ))}
      </pattern>
      {ids.frame && (
        <pattern id={ids.frame} patternUnits="userSpaceOnUse" width={FRAME_TILE} height={FRAME_TILE}>
          <rect width={FRAME_TILE} height={FRAME_TILE} fill={colors.frame.base} />
          {/* One diagonal per tile, run past both corners so the hatch joins across the repeat. */}
          <path
            d={`M -1 ${FRAME_TILE + 1} L ${FRAME_TILE + 1} -1 M -1 1 L 1 -1 M ${FRAME_TILE - 1} ${FRAME_TILE + 1} L ${FRAME_TILE + 1} ${FRAME_TILE - 1}`}
            fill="none"
            stroke={colors.frame.hatch}
            strokeWidth={0.8}
            strokeOpacity={0.6}
          />
        </pattern>
      )}
    </defs>
  )
}
