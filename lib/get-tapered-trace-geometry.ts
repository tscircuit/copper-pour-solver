import type { Point } from "@tscircuit/math-utils"

export interface TaperedTraceGeometryParams {
  start: Point
  end: Point
  start_width: number
  end_width: number
  width_interpolation_mode: "linear" | "quadratic"
}

const TAPER_TOLERANCE = 0.0001

/** Board-world or footprint-local points in mm, +X right, +Y up, right-handed.
 * Flat caps and direction-independent quadratic sides follow circuit-json #830.
 * Tessellated side error is at most 0.0001 mm; bounds include exact extrema.
 */
export const getTaperedTraceGeometry = ({
  start,
  end,
  start_width,
  end_width,
  width_interpolation_mode,
}: TaperedTraceGeometryParams) => {
  const startWidth = start_width
  const endWidth = end_width
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  const dx = (end.x - start.x) / length
  const dy = (end.y - start.y) / length
  const widthAt = (t: number) => {
    const f =
      width_interpolation_mode !== "quadratic"
        ? t
        : startWidth <= endWidth
          ? t * t
          : 2 * t - t * t
    return startWidth + (endWidth - startWidth) * f
  }
  const sideAt = (t: number, side: number) => ({
    x: start.x + (end.x - start.x) * t - (dy * side * widthAt(t)) / 2,
    y: start.y + (end.y - start.y) * t + (dx * side * widthAt(t)) / 2,
  })
  // For a quadratic side the chord error is |endWidth-startWidth|/(8*n*n).
  const steps = Math.max(
    1,
    width_interpolation_mode === "quadratic"
      ? Math.ceil(
          Math.sqrt(Math.abs(endWidth - startWidth) / (8 * TAPER_TOLERANCE)),
        )
      : 1,
  )
  const upper = Array.from({ length: steps + 1 }, (_, i) =>
    sideAt(i / steps, 1),
  )
  const lower = Array.from({ length: steps + 1 }, (_, i) =>
    sideAt(i / steps, -1),
  )
  const outline = [...lower, ...upper.reverse()]
  // Include analytical side extrema: sampling alone could understate clearance.
  const extrema = [sideAt(0, 1), sideAt(1, 1), sideAt(0, -1), sideAt(1, -1)]
  for (const side of [-1, 1]) {
    const a = sideAt(0, side),
      m = sideAt(0.5, side),
      b = sideAt(1, side)
    for (const axis of ["x", "y"] as const) {
      const quadratic = 2 * (a[axis] + b[axis] - 2 * m[axis])
      const linear = b[axis] - a[axis] - quadratic
      const t = -linear / (2 * quadratic)
      if (t > 0 && t < 1) extrema.push(sideAt(t, side))
    }
  }
  const bounds = {
    left: Math.min(...extrema.map((p) => p.x)),
    right: Math.max(...extrema.map((p) => p.x)),
    bottom: Math.min(...extrema.map((p) => p.y)),
    top: Math.max(...extrema.map((p) => p.y)),
  }
  return { outline, bounds, widthAt }
}
