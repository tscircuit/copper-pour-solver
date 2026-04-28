import type { BRepShape } from "circuit-json"
import type { CopperPourIsland, PolygonRing } from "./manifold-geometry-adapter"

const signedArea = (ring: PolygonRing) => {
  let area = 0
  for (let i = 0; i < ring.length; i++) {
    const current = ring[i]!
    const next = ring[(i + 1) % ring.length]!
    area += current.x * next.y - next.x * current.y
  }
  return area / 2
}

const ensureAreaSign = (
  ring: PolygonRing,
  desiredSign: "positive" | "negative",
) => {
  const area = signedArea(ring)
  const shouldReverse =
    (desiredSign === "positive" && area < 0) ||
    (desiredSign === "negative" && area > 0)
  return shouldReverse ? [...ring].reverse() : ring
}

const ringToVertices = (ring: PolygonRing) =>
  ring.map((point) => ({
    x: point.x,
    y: point.y,
  }))

export const generateBRep = (pourIslands: CopperPourIsland[]): BRepShape[] => {
  const brep_shapes: BRepShape[] = []

  for (const island of pourIslands) {
    if (island.outerRing.length < 3) continue

    // circuit-json BRep uses implicit closure. Keep the previous renderer-facing
    // winding: outer rings have negative signed area, holes have positive area.
    const outerRing = ensureAreaSign(island.outerRing, "negative")
    const innerRings = island.innerRings
      .filter((ring) => ring.length >= 3)
      .map((ring) => ensureAreaSign(ring, "positive"))

    brep_shapes.push({
      outer_ring: { vertices: ringToVertices(outerRing) },
      inner_rings: innerRings.map((ring) => ({
        vertices: ringToVertices(ring),
      })),
    })
  }

  return brep_shapes
}
