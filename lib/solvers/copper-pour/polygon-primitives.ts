import type { Point } from "@tscircuit/math-utils"
import type { PolygonRing } from "./polygon-ring"

export const circleToPolygon = (
  center: Point,
  radius: number,
  numSegments = 32,
): PolygonRing => {
  const points: PolygonRing = []
  for (let i = 0; i < numSegments; i++) {
    const angle = (i / numSegments) * 2 * Math.PI
    points.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    })
  }
  return points
}

export const boxToPolygon = (
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): PolygonRing => [
  { x: minX, y: minY },
  { x: maxX, y: minY },
  { x: maxX, y: maxY },
  { x: minX, y: maxY },
]

export const segmentToPolygon = (
  start: Point,
  end: Point,
  width: number,
): PolygonRing => {
  const segmentLength = Math.hypot(start.x - end.x, start.y - end.y)
  if (segmentLength === 0) return []

  const centerX = (start.x + end.x) / 2
  const centerY = (start.y + end.y) / 2
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const cosAngle = Math.cos(angle)
  const sinAngle = Math.sin(angle)
  const halfLength = segmentLength / 2
  const halfWidth = width / 2

  return [
    { x: -halfLength, y: -halfWidth },
    { x: halfLength, y: -halfWidth },
    { x: halfLength, y: halfWidth },
    { x: -halfLength, y: halfWidth },
  ].map((point) => ({
    x: centerX + point.x * cosAngle - point.y * sinAngle,
    y: centerY + point.x * sinAngle + point.y * cosAngle,
  }))
}
