import type { Point } from "@tscircuit/math-utils"
import type { InputPad } from "../../types"
import { generateThermalReliefClearances } from "./generate-thermal-relief-clearances"
import { inputPadToPolygons } from "./input-pad-to-polygons"
import {
  boxToPolygon,
  circleToPolygon,
  segmentToPolygon,
} from "./polygon-primitives"
import { normalizeRing, type PolygonRing } from "./polygon-ring"

interface ProcessedObstacles {
  polygonsToSubtract: PolygonRing[]
}

export const processObstaclesForPour = (
  pads: InputPad[],
  pourConnectivityKey: string,
  margins: {
    padMargin: number
    traceMargin: number
    board_edge_margin?: number
    cutoutMargin?: number
    use_thermal_reliefs?: boolean
    thermal_relief_spoke_width?: number
    thermal_relief_spoke_count?: number
  },
  boardOutline?: Point[],
): ProcessedObstacles => {
  const polygonsToSubtract: PolygonRing[] = []

  const {
    padMargin,
    traceMargin,
    board_edge_margin,
    cutoutMargin,
    use_thermal_reliefs,
    thermal_relief_spoke_width,
    thermal_relief_spoke_count,
  } = margins

  if (
    boardOutline &&
    boardOutline.length > 0 &&
    board_edge_margin &&
    board_edge_margin > 0
  ) {
    const vertices = normalizeRing(
      boardOutline,
      "processObstacles.boardOutline",
    )

    // Add clearance shapes at vertices
    for (let i = 0; i < vertices.length; i++) {
      const p1 = vertices[i === 0 ? vertices.length - 1 : i - 1]
      const p2 = vertices[i]
      const p3 = vertices[(i + 1) % vertices.length]

      if (!p1 || !p2 || !p3) continue

      const v1 = { x: p2.x - p1.x, y: p2.y - p1.y }
      const v2 = { x: p3.x - p2.x, y: p3.y - p2.y }
      const crossProduct = v1.x * v2.y - v1.y * v2.x

      polygonsToSubtract.push(circleToPolygon(p2, board_edge_margin))

      if (crossProduct < 0) {
        polygonsToSubtract.push(
          boxToPolygon(
            p2.x - board_edge_margin,
            p2.y - board_edge_margin,
            p2.x + board_edge_margin,
            p2.y + board_edge_margin,
          ),
        )
      }
    }

    // Add rectangles for each segment to create clearance along edges
    for (let i = 0; i < vertices.length; i++) {
      const p1 = vertices[i]
      const p2 = vertices[(i + 1) % vertices.length]

      if (!p1 || !p2) continue

      const segmentPolygon = segmentToPolygon(p1, p2, board_edge_margin * 2)
      if (segmentPolygon.length > 0) {
        polygonsToSubtract.push(segmentPolygon)
      }
    }
  }

  for (const pad of pads) {
    const isOnNet = pad.connectivityKey === pourConnectivityKey

    if (isOnNet) {
      if ((pad.isPlatedHole || pad.isSmtPad) && use_thermal_reliefs) {
        polygonsToSubtract.push(
          ...generateThermalReliefClearances(
            pad,
            padMargin,
            thermal_relief_spoke_width,
            thermal_relief_spoke_count,
          ),
        )
      }
      continue
    }

    const isHoleOrCutout =
      pad.connectivityKey.startsWith("hole:") ||
      pad.connectivityKey.startsWith("cutout:")
    const isKeepout = pad.connectivityKey.startsWith("keepout:")
    const getMargin = (defaultMargin: number) =>
      isKeepout ? 0 : isHoleOrCutout ? (cutoutMargin ?? 0) : defaultMargin

    const defaultMargin =
      pad.shape === "trace"
        ? traceMargin
        : pad.shape === "polygon"
          ? 0
          : padMargin
    polygonsToSubtract.push(
      ...inputPadToPolygons(pad, getMargin(defaultMargin)),
    )
  }

  return { polygonsToSubtract }
}
