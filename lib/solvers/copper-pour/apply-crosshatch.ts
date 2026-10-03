import type { InputPad } from "lib/types"
import {
  composeCrossSections,
  crossSectionFromPolygons,
} from "./manifold-geometry-adapter"
import {
  getCrossSection,
  runManifoldOperation,
  type CrossSection,
} from "./manifold-runtime"
import {
  MANIFOLD_GEOMETRY_SCALE,
  type PolygonRing,
  type ScaledPolygons,
} from "./polygon-ring"
import { processObstaclesForPour } from "./process-obstacles"

const HATCH_PITCH = 1
const HATCH_WIDTH = 0.25
const HALF_OPENING = (HATCH_PITCH - HATCH_WIDTH) / 2
const MIN_OPENING_AREA = HATCH_WIDTH ** 2

// Input positions use Manifold's scaled board-world coordinates.
const getCellKey = (x: number, y: number) => {
  const u = ((x + y) * Math.SQRT1_2) / MANIFOLD_GEOMETRY_SCALE
  const v = ((y - x) * Math.SQRT1_2) / MANIFOLD_GEOMETRY_SCALE
  return `${Math.floor(u / HATCH_PITCH)},${Math.floor(v / HATCH_PITCH)}`
}

// Filter each connected fragment separately: a large fragment must not rescue a
// tiny sibling produced when a concave edge cuts the same grid cell in two.
const removeSmallOpenings = (openings: CrossSection): CrossSection => {
  // Decomposing thousands of disconnected openings at once can exhaust WASM
  // memory. Each contour stays in one grid cell, so decompose one cell at a time.
  const cells = new Map<string, ScaledPolygons>()
  for (const polygon of openings.toPolygons()) {
    const [x, y] = polygon[0]!
    const key = getCellKey(x, y)
    const contours = cells.get(key) ?? []
    contours.push(polygon)
    cells.set(key, contours)
  }
  const retained: ScaledPolygons = []
  for (const contours of cells.values()) {
    const cell = getCrossSection().ofPolygons(contours, "Positive")
    const fragments = cell.decompose()
    try {
      for (const fragment of fragments) {
        if (fragment.area() < MIN_OPENING_AREA * MANIFOLD_GEOMETRY_SCALE ** 2)
          continue
        const inset = fragment.offset(
          (-HATCH_WIDTH / 2) * MANIFOLD_GEOMETRY_SCALE,
          "Round",
        )
        try {
          if (!inset.isEmpty()) retained.push(...fragment.toPolygons())
        } finally {
          inset.delete()
        }
      }
    } finally {
      for (const fragment of fragments) fragment.delete()
      cell.delete()
    }
  }
  return retained.length > 0
    ? getCrossSection().ofPolygons(retained, "Positive")
    : getCrossSection().square([0, 0])
}

/**
 * Clip square openings at the edges of an already-cleared pour. Positions are
 * board-world mm (+X right, +Y up); the 45-degree grid is anchored at (0, 0).
 * Openings leave a HATCH_WIDTH solid rim. Cells touching protected pad/trace,
 * thermal, hole, keepout or higher-priority pour clearances are omitted entirely.
 * Partial openings are allowed only at pour edges; tiny fragments are discarded.
 */
export const applyCrosshatch = ({
  solidPour,
  padsForLayer,
  connectivityKey,
  obstaclePolygons,
  higherPriorityPourBlockers,
}: {
  solidPour: CrossSection
  padsForLayer: InputPad[]
  connectivityKey: string
  obstaclePolygons: PolygonRing[]
  higherPriorityPourBlockers: CrossSection[]
}): CrossSection => {
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
    const obstacleClearances = crossSectionFromPolygons(obstaclePolygons)
    const allClearances = composeCrossSections([
      obstacleClearances,
      ...higherPriorityPourBlockers,
    ])
    const expandedClearances = allClearances.offset(
      HATCH_WIDTH * MANIFOLD_GEOMETRY_SCALE,
      "Round",
    )
    const protectedAreas = protectedCopper.add(expandedClearances)
    obstacleClearances.delete()
    allClearances.delete()
    expandedClearances.delete()
    protectedCopper.delete()

    try {
      if (interior.isEmpty()) return solidPour

      let minU = Infinity
      let maxU = -Infinity
      let minV = Infinity
      let maxV = -Infinity
      for (const polygon of interior.toPolygons()) {
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

      // Reject whole cells at protected geometry, including tiny obstacles
      // entirely enclosed by a cell. Other cells may be clipped at pour edges.
      const allOpenings = crossSectionFromPolygons(
        openings.map(({ ring }) => ring),
      )
      const conflicts = allOpenings.intersect(protectedAreas)
      allOpenings.delete()
      const rejectedCells = new Set<string>()
      for (const polygon of conflicts.toPolygons()) {
        const [x, y] = polygon[0]!
        rejectedCells.add(getCellKey(x, y))
      }
      conflicts.delete()

      const acceptedOpenings = crossSectionFromPolygons(
        openings
          .filter(({ key }) => !rejectedCells.has(key))
          .map(({ ring }) => ring),
      )
      const clippedOpenings = acceptedOpenings.intersect(interior)
      acceptedOpenings.delete()
      const filteredOpenings = removeSmallOpenings(clippedOpenings)
      clippedOpenings.delete()
      try {
        return solidPour.subtract(filteredOpenings)
      } finally {
        filteredOpenings.delete()
      }
    } finally {
      interior.delete()
      protectedAreas.delete()
    }
  })
}
