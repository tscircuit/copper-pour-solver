import type { InputPad } from "lib/types"
import {
  boxToPolygon,
  circleToPolygon,
  ovalToPolygon,
  pillToPolygon,
  rotatedBoxToPolygon,
  segmentToPolygon,
} from "./polygon-primitives"
import { normalizeRing, type PolygonRing } from "./polygon-ring"

/**
 * Returns the actual copper geometry of a pad (no clearance margin applied).
 * Used to decide whether a pour island touches copper of its own net,
 * matching how KiCad keeps or removes islands under island_removal_mode 0.
 */
export const padToCopperPolygons = (pad: InputPad): PolygonRing[] => {
  if (pad.shape === "circle") {
    return [circleToPolygon({ x: pad.x, y: pad.y }, pad.radius)]
  }

  if (pad.shape === "pill") {
    return [
      pillToPolygon(
        { x: pad.x, y: pad.y },
        pad.width,
        pad.height,
        pad.radius,
        pad.ccwRotation,
      ),
    ]
  }

  if (pad.shape === "oval") {
    return [
      ovalToPolygon(
        { x: pad.x, y: pad.y },
        pad.width,
        pad.height,
        pad.ccwRotation,
      ),
    ]
  }

  if (pad.shape === "rect") {
    const { bounds } = pad
    return [boxToPolygon(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY)]
  }

  if (pad.shape === "rotated_rect") {
    return [
      rotatedBoxToPolygon(
        { x: pad.x, y: pad.y },
        pad.width,
        pad.height,
        pad.ccwRotation,
      ),
    ]
  }

  if (pad.shape === "polygon") {
    const seen = new Set<string>()
    const uniquePoints = pad.points.filter((p) => {
      const key = `${p.x},${p.y}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    if (uniquePoints.length < 3) return []
    const polygon = normalizeRing(
      uniquePoints,
      "padToCopperPolygons.polygonPad",
    )
    return polygon.length >= 3 ? [polygon] : []
  }

  if (pad.shape === "trace") {
    const polygons: PolygonRing[] = []
    for (const segment of pad.segments) {
      polygons.push(circleToPolygon(segment, pad.width / 2))
    }
    for (let i = 0; i < pad.segments.length - 1; i++) {
      const p1 = pad.segments[i]
      const p2 = pad.segments[i + 1]
      if (!p1 || !p2) continue
      const segmentPolygon = segmentToPolygon(p1, p2, pad.width)
      if (segmentPolygon.length > 0) polygons.push(segmentPolygon)
    }
    return polygons
  }

  return []
}
