import type { InputPad } from "lib/types"
import { crossSectionFromPolygons } from "./manifold-geometry-adapter"
import { runManifoldOperation, type CrossSection } from "./manifold-runtime"
import { MANIFOLD_GEOMETRY_SCALE, type PolygonRing } from "./polygon-ring"
import { processObstaclesForPour } from "./process-obstacles"

const HATCH_PITCH = 1
const HATCH_WIDTH = 0.25
const HALF_OPENING = (HATCH_PITCH - HATCH_WIDTH) / 2

/**
 * Subtract enclosed square openings from an already-cleared pour. Positions are
 * board-world mm (+X right, +Y up); the 45-degree grid is anchored at (0, 0).
 * Only whole openings separated from every boundary and same-net pad/trace by
 * HATCH_WIDTH are removed. This preserves the solid pour's connected components,
 * narrow necks, thermal spokes and pad contacts, including off-grid contacts.
 */
export const applyCrosshatch = (
  solidPour: CrossSection,
  padsForLayer: InputPad[],
  connectivityKey: string,
): CrossSection => {
  if (solidPour.isEmpty()) return solidPour

  const polygons = solidPour.toPolygons()
  return runManifoldOperation("applyCrosshatch", polygons, () => {
    const interior = solidPour.offset(-HATCH_WIDTH * MANIFOLD_GEOMETRY_SCALE)
    const { polygonsToSubtract } = processObstaclesForPour(
      padsForLayer.filter((pad) => pad.connectivityKey === connectivityKey),
      undefined,
      { padMargin: HATCH_WIDTH, traceMargin: HATCH_WIDTH },
    )
    const protectedCopper = crossSectionFromPolygons(polygonsToSubtract)
    const hatchableArea = interior.subtract(protectedCopper)
    interior.delete()
    protectedCopper.delete()

    try {
      if (hatchableArea.isEmpty()) return solidPour

      let minU = Infinity
      let maxU = -Infinity
      let minV = Infinity
      let maxV = -Infinity
      for (const polygon of hatchableArea.toPolygons()) {
        for (const [x, y] of polygon) {
          const u = ((x + y) * Math.SQRT1_2) / MANIFOLD_GEOMETRY_SCALE
          const v = ((y - x) * Math.SQRT1_2) / MANIFOLD_GEOMETRY_SCALE
          minU = Math.min(minU, u)
          maxU = Math.max(maxU, u)
          minV = Math.min(minV, v)
          maxV = Math.max(maxV, v)
        }
      }

      const openings: Array<{ key: string; ring: PolygonRing }> = []
      for (
        let i = Math.floor(minU / HATCH_PITCH);
        i <= Math.floor(maxU / HATCH_PITCH);
        i++
      ) {
        for (
          let j = Math.floor(minV / HATCH_PITCH);
          j <= Math.floor(maxV / HATCH_PITCH);
          j++
        ) {
          const u = (i + 0.5) * HATCH_PITCH
          const v = (j + 0.5) * HATCH_PITCH
          openings.push({
            key: `${i},${j}`,
            ring: [
              [u - HALF_OPENING, v - HALF_OPENING],
              [u + HALF_OPENING, v - HALF_OPENING],
              [u + HALF_OPENING, v + HALF_OPENING],
              [u - HALF_OPENING, v + HALF_OPENING],
            ].map(([u, v]) => ({
              x: (u! - v!) * Math.SQRT1_2,
              y: (u! + v!) * Math.SQRT1_2,
            })),
          })
        }
      }

      // Batch containment: any remainder outside the hatchable area rejects the
      // entire opening. Every remainder stays inside one grid cell, even when a
      // tiny obstacle splits it; its first vertex identifies that cell exactly.
      const allOpenings = crossSectionFromPolygons(
        openings.map(({ ring }) => ring),
      )
      const outside = allOpenings.subtract(hatchableArea)
      allOpenings.delete()
      const rejectedCells = new Set<string>()
      for (const polygon of outside.toPolygons()) {
        const [x, y] = polygon[0]!
        const u = ((x + y) * Math.SQRT1_2) / MANIFOLD_GEOMETRY_SCALE
        const v = ((y - x) * Math.SQRT1_2) / MANIFOLD_GEOMETRY_SCALE
        rejectedCells.add(
          `${Math.floor(u / HATCH_PITCH)},${Math.floor(v / HATCH_PITCH)}`,
        )
      }
      outside.delete()

      const acceptedOpenings = crossSectionFromPolygons(
        openings
          .filter(({ key }) => !rejectedCells.has(key))
          .map(({ ring }) => ring),
      )
      try {
        return solidPour.subtract(acceptedOpenings)
      } finally {
        acceptedOpenings.delete()
      }
    } finally {
      hatchableArea.delete()
    }
  })
}
