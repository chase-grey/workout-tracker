export const IMPACT_AT = 0.64
export const clamp = (value: number) => Math.max(0, Math.min(1, value))

/** Triangles tile the planet; their actual trailing vertex determines screen exit. */
export function earthFragments(width: number, height: number) {
  const radius = Math.min(width, height) * 0.17
  return Array.from({ length: 16 }, (_, i) => {
    const a = i * Math.PI / 8
    const b = (i + 1) * Math.PI / 8
    const vertices = [[0, 0], [Math.cos(a) * radius, Math.sin(a) * radius],
      [Math.cos(b) * radius, Math.sin(b) * radius]]
    const side = Math.cos((a + b) / 2) > 0 ? 1 : -1
    const trailing = side > 0 ? Math.min(...vertices.map(v => v[0])) : Math.max(...vertices.map(v => v[0]))
    return {
      points: vertices.map(v => v.join(',')).join(' '),
      dx: (side > 0 ? width : 0) - width / 2 - trailing,
      dy: Math.sin((a + b) / 2) * height * 0.18,
      exitsAt: i === 0 ? 1 : 0.72 + ((i * 7) % 15) / 15 * 0.25,
      vertices,
    }
  })
}
