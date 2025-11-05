import Flatten from "@flatten-js/core"
import type {
  InputCircularPad,
  InputPad,
  InputRectPad,
  InputTracePad,
} from "lib/types"
import { circleToPolygon } from "./circle-to-polygon"

interface ProcessedObstacles {
  polygonsToSubtract: Flatten.Polygon[]
}

const isRectPad = (pad: InputPad): pad is InputRectPad => pad.shape === "rect"
const isTracePad = (pad: InputPad): pad is InputTracePad =>
  pad.shape === "trace"
const isCircularPad = (pad: InputPad): pad is InputCircularPad =>
  pad.shape === "circle"

export const processObstaclesForPour = (
  pads: InputPad[],
  pourConnectivityKey: string,
  margins: { padMargin: number; traceMargin: number },
): ProcessedObstacles => {
  const polygonsToSubtract: Flatten.Polygon[] = []

  const { padMargin, traceMargin } = margins

  for (const pad of pads) {
    const isOnNet = pad.connectivityKey === pourConnectivityKey

    if (isOnNet) {
      continue
    }

    if (isCircularPad(pad)) {
      const isHole = pad.connectivityKey.startsWith("hole:")
      const margin = isHole ? 0 : padMargin
      const circle = new Flatten.Circle(
        new Flatten.Point(pad.x, pad.y),
        pad.radius + margin,
      )
      polygonsToSubtract.push(circleToPolygon(circle))
      continue
    }

    if (isRectPad(pad)) {
      const { bounds } = pad
      const b = new Flatten.Box(
        bounds.minX - padMargin,
        bounds.minY - padMargin,
        bounds.maxX + padMargin,
        bounds.maxY + padMargin,
      )
      polygonsToSubtract.push(new Flatten.Polygon(b.toPoints()))
      continue
    }

    if (isTracePad(pad)) {
      // Add circles for each vertex
      for (const segment of pad.segments) {
        const circle = new Flatten.Circle(
          new Flatten.Point(segment.x, segment.y),
          pad.width / 2 + traceMargin,
        )
        polygonsToSubtract.push(circleToPolygon(circle))
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

        polygonsToSubtract.push(
          new Flatten.Polygon(
            rotatedCorners.map((p) => Flatten.point(p.x, p.y)),
          ),
        )
      }
      continue
    }
  }

  return { polygonsToSubtract }
}
