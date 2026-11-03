import type { BRepShape, Point } from "circuit-json"

/** Test emitted B-Rep copper at a board-world position in mm, +X right/+Y up. */
export function hasCopperAt(shapes: BRepShape[], point: Point): boolean {
  return shapes.some((shape) => {
    let inside = false
    for (const ring of [shape.outer_ring, ...shape.inner_rings]) {
      const vertices = ring.vertices
      for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const a = vertices[i]!
        const b = vertices[j]!
        if (
          a.y > point.y !== b.y > point.y &&
          point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
        )
          inside = !inside
      }
    }
    return inside
  })
}
