import type { InputPourRegion } from "lib/types"
import { resolveCopperClearance } from "./resolve-copper-clearance"

export function getForeignPourClearance(
  region: InputPourRegion,
  foreignRegion: InputPourRegion,
): number {
  const forward = resolveCopperClearance({
    rules: region.clearanceRules,
    connectivityKey: foreignRegion.connectivityKey,
    objectType: foreignRegion.isStatic ? "copper_region" : "copper_pour",
    fallback:
      region.pourMargin ?? Math.max(region.padMargin, region.traceMargin),
  })
  const reverse = resolveCopperClearance({
    rules: foreignRegion.clearanceRules,
    connectivityKey: region.connectivityKey,
    objectType: region.isStatic ? "copper_region" : "copper_pour",
    fallback:
      foreignRegion.pourMargin ??
      Math.max(foreignRegion.padMargin, foreignRegion.traceMargin),
  })
  return Math.max(forward, reverse)
}
