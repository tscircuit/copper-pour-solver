import type { Bounds } from "@tscircuit/math-utils"
import type { InputPad, InputPourRegion } from "lib/types"

export type BoundedInputPad = { pad: InputPad; bounds: Bounds }

export function getPadsOverlappingRegion({
  boundedPads,
  region,
}: {
  boundedPads: BoundedInputPad[]
  region: InputPourRegion
}): InputPad[] {
  // Expanding both dimensions of a rotated rectangle by margin can extend
  // its axis-aligned bounds by sqrt(2) * margin at 45 degrees. Keep that
  // conservative allowance for all shapes; exact geometry remains unchanged.
  const margin =
    Math.SQRT2 *
    Math.max(0, region.padMargin, region.traceMargin, region.cutout_margin ?? 0)
  return boundedPads
    .filter(({ pad, bounds }) => {
      if (pad.layer !== region.layer) return false
      // Leave malformed geometry for the existing validation to reject.
      if (!Object.values(bounds).every(Number.isFinite)) return true
      return (
        bounds.minX - margin <= region.bounds.maxX &&
        bounds.maxX + margin >= region.bounds.minX &&
        bounds.minY - margin <= region.bounds.maxY &&
        bounds.maxY + margin >= region.bounds.minY
      )
    })
    .map(({ pad }) => pad)
}
