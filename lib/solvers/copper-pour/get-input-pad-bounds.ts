import {
  type Bounds,
  type Point,
  getBoundsFromPoints,
} from "@tscircuit/math-utils"
import type { InputPad } from "lib/types"

/** Conservative obstacle bounds in board-world millimetres, before clearance. */
export function getInputPadBounds(pad: InputPad): Bounds {
  if (pad.shape === "rect") return pad.bounds
  if (pad.shape === "polygon") return getObstaclePointBounds(pad.points)
  if (pad.shape === "trace") {
    return expandBounds(getObstaclePointBounds(pad.segments), pad.width / 2)
  }
  if (pad.shape === "tapered_trace") {
    return expandBounds(
      getObstaclePointBounds([pad.start, pad.end]),
      Math.max(pad.start_width, pad.end_width) / 2,
    )
  }
  // The circumscribed circle covers rotated rectangles, pills, and ovals at
  // every angle, without depending on the renderer's rotation convention.
  const radius =
    pad.shape === "circle" ? pad.radius : Math.hypot(pad.width, pad.height) / 2
  return {
    minX: pad.x - radius,
    minY: pad.y - radius,
    maxX: pad.x + radius,
    maxY: pad.y + radius,
  }
}

function getObstaclePointBounds(points: Point[]): Bounds {
  return (
    getBoundsFromPoints(points) ?? {
      minX: Number.NEGATIVE_INFINITY,
      minY: Number.NEGATIVE_INFINITY,
      maxX: Number.POSITIVE_INFINITY,
      maxY: Number.POSITIVE_INFINITY,
    }
  )
}

function expandBounds(bounds: Bounds, margin: number): Bounds {
  return {
    minX: bounds.minX - margin,
    minY: bounds.minY - margin,
    maxX: bounds.maxX + margin,
    maxY: bounds.maxY + margin,
  }
}
