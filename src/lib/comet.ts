export const IMPACT_AT = 0.64
export const clamp = (value: number) => Math.max(0, Math.min(1, value))

/** Uneven Voronoi cells tile the globe, with fractures travelling from the impact. */
export function earthFragments(width: number, height: number) {
  const radius = Math.min(width, height) * 0.17
  const seeds = Array.from({ length: 32 }, (_, i) => {
    const angle = i * 2.399963 + Math.sin(i * 7.1) * .19
    const distance = radius * Math.sqrt((i + .5) / 32) * .96
    return [Math.cos(angle) * distance, Math.sin(angle) * distance]
  })
  const outline = Array.from({ length: 96 }, (_, i) => {
    const angle = i * Math.PI * 2 / 96
    return [Math.cos(angle) * radius, Math.sin(angle) * radius]
  })
  return seeds.map(([cx, cy], i) => {
    let vertices = outline
    for (const [j, [sx, sy]] of seeds.entries()) {
      if (i === j) continue
      const nx = sx - cx, ny = sy - cy
      const boundary = (sx * sx + sy * sy - cx * cx - cy * cy) / 2
      const clipped: number[][] = []
      for (let k = 0; k < vertices.length; k++) {
        const a = vertices[k], b = vertices[(k + 1) % vertices.length]
        const da = a[0] * nx + a[1] * ny - boundary
        const db = b[0] * nx + b[1] * ny - boundary
        if (da <= 0) clipped.push(a)
        if ((da <= 0) !== (db <= 0)) {
          const t = da / (da - db)
          clipped.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
        }
      }
      vertices = clipped
    }
    const side = cx > 0 ? 1 : -1
    const trailing = side > 0 ? Math.min(...vertices.map(v => v[0])) : Math.max(...vertices.map(v => v[0]))
    return {
      points: vertices.map(v => v.join(',')).join(' '),
      dx: (side > 0 ? width : 0) - width / 2 - trailing,
      dy: (cy / radius * .8 + .2) * height * .18,
      delay: Math.hypot(cx + radius * .92, cy + radius * .39) / (2 * radius) * .24,
      exitsAt: i === 0 ? 1 : 0.72 + ((i * 7) % 15) / 15 * 0.25,
      vertices,
    }
  })
}
