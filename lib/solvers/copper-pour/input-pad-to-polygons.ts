import type { InputPad } from "lib/types"
import {
  boxToPolygon,
  circleToPolygon,
  ovalToPolygon,
  pillToPolygon,
  rotatedBoxToPolygon,
  segmentToPolygon,
} from "./polygon-primitives"
import { offsetPolygon } from "./manifold-geometry-adapter"
import { normalizeRing, type PolygonRing } from "./polygon-ring"

export const inputPadToPolygons = (
  pad: InputPad,
  margin: number,
): PolygonRing[] => {
  if (pad.shape === "circle") {
    return [circleToPolygon({ x: pad.x, y: pad.y }, pad.radius + margin)]
  }

  if (pad.shape === "pill") {
    return [
      pillToPolygon(
        { x: pad.x, y: pad.y },
        pad.width + margin * 2,
        pad.height + margin * 2,
        pad.radius + margin,
        pad.ccwRotation,
      ),
    ]
  }

  if (pad.shape === "oval") {
    const polygon = ovalToPolygon(
      { x: pad.x, y: pad.y },
      pad.width,
      pad.height,
      pad.ccwRotation,
    )
    return margin > 0 ? offsetPolygon(polygon, margin, "Round") : [polygon]
  }

  if (pad.shape === "rect") {
    return [
      boxToPolygon(
        pad.bounds.minX - margin,
        pad.bounds.minY - margin,
        pad.bounds.maxX + margin,
        pad.bounds.maxY + margin,
      ),
    ]
  }

  if (pad.shape === "rotated_rect") {
    return [
      rotatedBoxToPolygon(
        { x: pad.x, y: pad.y },
        pad.width + margin * 2,
        pad.height + margin * 2,
        pad.ccwRotation,
      ),
    ]
  }

  if (pad.shape === "polygon") {
    const seen = new Set<string>()
    const uniquePoints = pad.points.filter((point) => {
      const key = `${point.x},${point.y}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    if (uniquePoints.length < 3) return []

    const polygon = normalizeRing(uniquePoints, "inputPadToPolygons.polygon")
    if (polygon.length < 3) return []
    return margin > 0 ? offsetPolygon(polygon, margin) : [polygon]
  }

  const polygons: PolygonRing[] = pad.segments.map((point) =>
    circleToPolygon(point, pad.width / 2 + margin),
  )
  for (
    let segmentIndex = 0;
    segmentIndex < pad.segments.length - 1;
    segmentIndex++
  ) {
    const start = pad.segments[segmentIndex]
    const end = pad.segments[segmentIndex + 1]
    if (!start || !end) continue

    const polygon = segmentToPolygon(start, end, pad.width + margin * 2)
    if (polygon.length > 0) polygons.push(polygon)
  }
  return polygons
}
