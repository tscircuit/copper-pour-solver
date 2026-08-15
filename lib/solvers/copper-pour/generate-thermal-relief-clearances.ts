import type { Point } from "@tscircuit/math-utils"
import type {
  InputCircularPad,
  InputPad,
  InputPillPad,
  InputRectPad,
  InputRotatedRectPad,
} from "lib/types"
import {
  crossSectionFromPolygon,
  crossSectionFromPolygons,
  crossSectionToCopperPourIslands,
  subtractCrossSectionBlockers,
} from "./manifold-geometry-adapter"
import {
  boxToPolygon,
  circleToPolygon,
  pillToPolygon,
  rotatedBoxToPolygon,
  segmentToPolygon,
} from "./polygon-primitives"
import type { PolygonRing } from "./polygon-ring"

type SupportedThermalReliefPad =
  | InputCircularPad
  | InputPillPad
  | InputRectPad
  | InputRotatedRectPad

const getPadCenter = (pad: SupportedThermalReliefPad): Point => {
  if (pad.shape === "rect") {
    return {
      x: (pad.bounds.minX + pad.bounds.maxX) / 2,
      y: (pad.bounds.minY + pad.bounds.maxY) / 2,
    }
  }
  return { x: pad.x, y: pad.y }
}

const getPadRotation = (pad: SupportedThermalReliefPad): number => {
  if (pad.shape === "rotated_rect" || pad.shape === "pill") {
    return pad.ccwRotation
  }
  return 0
}

const padToPolygon = (
  pad: SupportedThermalReliefPad,
  margin: number,
): PolygonRing => {
  if (pad.shape === "circle") {
    return circleToPolygon({ x: pad.x, y: pad.y }, pad.radius + margin)
  }

  if (pad.shape === "pill") {
    return pillToPolygon(
      { x: pad.x, y: pad.y },
      pad.width + margin * 2,
      pad.height + margin * 2,
      pad.radius + margin,
      pad.ccwRotation,
    )
  }

  if (pad.shape === "rect") {
    return boxToPolygon(
      pad.bounds.minX - margin,
      pad.bounds.minY - margin,
      pad.bounds.maxX + margin,
      pad.bounds.maxY + margin,
    )
  }

  return rotatedBoxToPolygon(
    { x: pad.x, y: pad.y },
    pad.width + margin * 2,
    pad.height + margin * 2,
    pad.ccwRotation,
  )
}

const isSupportedThermalReliefPad = (
  pad: InputPad,
): pad is SupportedThermalReliefPad =>
  pad.shape === "circle" ||
  pad.shape === "pill" ||
  pad.shape === "rect" ||
  pad.shape === "rotated_rect"

export const generateThermalReliefClearances = (
  pad: InputPad,
  airGap: number,
  thermal_relief_spoke_width: number | undefined,
  thermal_relief_spoke_count = 4,
): PolygonRing[] => {
  if (!isSupportedThermalReliefPad(pad) || airGap <= 0) return []

  if (
    typeof thermal_relief_spoke_width !== "number" ||
    !Number.isFinite(thermal_relief_spoke_width) ||
    thermal_relief_spoke_width <= 0
  ) {
    throw new Error("thermal_relief_spoke_width must be greater than 0")
  }
  if (
    !Number.isInteger(thermal_relief_spoke_count) ||
    thermal_relief_spoke_count < 1
  ) {
    throw new Error("thermal_relief_spoke_count must be a positive integer")
  }

  const padPolygon = padToPolygon(pad, 0)
  const clearancePolygon = padToPolygon(pad, airGap)
  const center = getPadCenter(pad)
  const spokeLength =
    Math.max(
      ...clearancePolygon.map((point) =>
        Math.hypot(point.x - center.x, point.y - center.y),
      ),
    ) + thermal_relief_spoke_width
  const baseRotation = (getPadRotation(pad) * Math.PI) / 180
  const spokes: PolygonRing[] = []

  for (let i = 0; i < thermal_relief_spoke_count; i++) {
    const angle = baseRotation + (i / thermal_relief_spoke_count) * Math.PI * 2
    spokes.push(
      segmentToPolygon(
        center,
        {
          x: center.x + Math.cos(angle) * spokeLength,
          y: center.y + Math.sin(angle) * spokeLength,
        },
        thermal_relief_spoke_width,
      ),
    )
  }

  const clearanceSection = crossSectionFromPolygon(clearancePolygon)
  const connectedCopperSection = crossSectionFromPolygons([
    padPolygon,
    ...spokes,
  ])
  const clearanceWithSpokes = subtractCrossSectionBlockers(clearanceSection, [
    connectedCopperSection,
  ])

  return crossSectionToCopperPourIslands(clearanceWithSpokes).map(
    ({ outerRing }) => outerRing,
  )
}
