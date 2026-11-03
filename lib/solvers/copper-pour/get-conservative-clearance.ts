import { MANIFOLD_GEOMETRY_SCALE } from "./polygon-ring"

const ENCLOSING_ARC_SCALE = 1 / Math.cos(Math.PI / 32)

/** Minimum spacing in mm, rounded outward at the geometry grid. An arc radius
 * also encloses the existing 32-segment circular/elliptical approximation. */
export function getConservativeClearance({
  clearance,
  arcRadius,
}: {
  clearance: number
  arcRadius?: number
}): number {
  const enclosing =
    arcRadius === undefined
      ? clearance
      : (arcRadius + clearance) * ENCLOSING_ARC_SCALE - arcRadius
  return (
    Math.ceil(enclosing * MANIFOLD_GEOMETRY_SCALE + 2) / MANIFOLD_GEOMETRY_SCALE
  )
}
