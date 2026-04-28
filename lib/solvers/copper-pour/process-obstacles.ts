import type { Point } from "@tscircuit/math-utils"
import type {
  InputCircularPad,
  InputPad,
  InputPolygonPad,
  InputRectPad,
  InputTracePad,
} from "lib/types"
import {
  normalizeRing,
  offsetPolygon,
  type PolygonRing,
} from "./manifold-geometry-adapter"

interface ProcessedObstacles {
  polygonsToSubtract: PolygonRing[]
}

const isRectPad = (pad: InputPad): pad is InputRectPad => pad.shape === "rect"
const isTracePad = (pad: InputPad): pad is InputTracePad =>
  pad.shape === "trace"
const isCircularPad = (pad: InputPad): pad is InputCircularPad =>
  pad.shape === "circle"
const isPolygonPad = (pad: InputPad): pad is InputPolygonPad =>
  pad.shape === "polygon"

const circleToPolygon = (
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

const boxToPolygon = (
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

export const processObstaclesForPour = (
  pads: InputPad[],
  pourConnectivityKey: string,
  margins: {
    padMargin: number
    traceMargin: number
    board_edge_margin?: number
    cutoutMargin?: number
  },
  boardOutline?: Point[],
): ProcessedObstacles => {
  const polygonsToSubtract: PolygonRing[] = []

  const { padMargin, traceMargin, board_edge_margin, cutoutMargin } = margins

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

      const segmentLength = Math.hypot(p1.x - p2.x, p1.y - p2.y)
      if (segmentLength === 0) continue

      const enlargedWidth = board_edge_margin * 2

      const centerX = (p1.x + p2.x) / 2
      const centerY = (p1.y + p2.y) / 2
      const rotationDeg = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI

      const w2 = segmentLength / 2
      const h2 = enlargedWidth / 2

      const angleRad = (rotationDeg * Math.PI) / 180
      const cosAngle = Math.cos(angleRad)
      const sinAngle = Math.sin(angleRad)

      const corners = [
        { x: -w2, y: -h2 },
        { x: w2, y: -h2 },
        { x: w2, y: h2 },
        { x: -w2, y: h2 },
      ]

      const rotatedCorners = corners.map((p) => ({
        x: centerX + p.x * cosAngle - p.y * sinAngle,
        y: centerY + p.x * sinAngle + p.y * cosAngle,
      }))

      polygonsToSubtract.push(rotatedCorners)
    }
  }

  for (const pad of pads) {
    const isOnNet = pad.connectivityKey === pourConnectivityKey

    if (isOnNet) {
      continue
    }

    const isHoleOrCutout =
      pad.connectivityKey.startsWith("hole:") ||
      pad.connectivityKey.startsWith("cutout:")

    if (isCircularPad(pad)) {
      const margin = isHoleOrCutout ? (cutoutMargin ?? 0) : padMargin
      polygonsToSubtract.push(
        circleToPolygon({ x: pad.x, y: pad.y }, pad.radius + margin),
      )
      continue
    }

    if (isRectPad(pad)) {
      const margin = isHoleOrCutout ? (cutoutMargin ?? 0) : padMargin
      const { bounds } = pad
      polygonsToSubtract.push(
        boxToPolygon(
          bounds.minX - margin,
          bounds.minY - margin,
          bounds.maxX + margin,
          bounds.maxY + margin,
        ),
      )
      continue
    }

    if (isPolygonPad(pad)) {
      const margin = isHoleOrCutout ? (cutoutMargin ?? 0) : 0

      const seen = new Set<string>()
      const uniquePoints = pad.points.filter((p) => {
        const key = `${p.x},${p.y}`
        if (seen.has(key)) {
          return false
        }
        seen.add(key)
        return true
      })

      if (uniquePoints.length < 3) continue

      const polygon = normalizeRing(uniquePoints, "processObstacles.polygonPad")
      if (polygon.length < 3) continue

      if (margin <= 0) {
        polygonsToSubtract.push(polygon)
        continue
      }

      polygonsToSubtract.push(...offsetPolygon(polygon, margin))
      continue
    }

    if (isTracePad(pad)) {
      // Add circles for each vertex
      for (const segment of pad.segments) {
        polygonsToSubtract.push(
          circleToPolygon(segment, pad.width / 2 + traceMargin),
        )
      }

      // Add rectangles for each segment
      for (let i = 0; i < pad.segments.length - 1; i++) {
        const p1 = pad.segments[i]
        const p2 = pad.segments[i + 1]

        if (!p1 || !p2) continue

        const segmentLength = Math.hypot(p1.x - p2.x, p1.y - p2.y)
        if (segmentLength === 0) continue

        const enlargedWidth = pad.width + traceMargin * 2

        const centerX = (p1.x + p2.x) / 2
        const centerY = (p1.y + p2.y) / 2
        const rotationDeg =
          (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI

        const w2 = segmentLength / 2
        const h2 = enlargedWidth / 2

        const angleRad = (rotationDeg * Math.PI) / 180
        const cosAngle = Math.cos(angleRad)
        const sinAngle = Math.sin(angleRad)

        const corners = [
          { x: -w2, y: -h2 },
          { x: w2, y: -h2 },
          { x: w2, y: h2 },
          { x: -w2, y: h2 },
        ]

        const rotatedCorners = corners.map((p) => ({
          x: centerX + p.x * cosAngle - p.y * sinAngle,
          y: centerY + p.x * sinAngle + p.y * cosAngle,
        }))

        polygonsToSubtract.push(rotatedCorners)
      }
    }
  }

  return { polygonsToSubtract }
}
