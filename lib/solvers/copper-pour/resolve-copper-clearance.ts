import type { CopperPourClearanceObjectType } from "circuit-json"
import type { InputCopperPourClearanceRule, InputPad } from "lib/types"

export function resolveCopperClearance({
  rules,
  connectivityKey,
  objectType,
  fallback,
}: {
  rules: InputCopperPourClearanceRule[] | undefined
  connectivityKey: string
  objectType: CopperPourClearanceObjectType
  fallback: number
}): number {
  return (
    rules?.find(
      (rule) =>
        (!rule.connectivityKeys ||
          rule.connectivityKeys.includes(connectivityKey)) &&
        (!rule.objectTypes || rule.objectTypes.includes(objectType)),
    )?.clearance ?? fallback
  )
}

export function getCopperObstacleType(
  pad: InputPad,
): CopperPourClearanceObjectType {
  if (pad.connectivityKey.startsWith("hole:")) return "hole"
  if (pad.shape === "trace" || pad.shape === "tapered_trace") return "trace"
  if (pad.isVia) return "via"
  if (pad.isPlatedHole) return "plated_hole"
  return "smtpad"
}
