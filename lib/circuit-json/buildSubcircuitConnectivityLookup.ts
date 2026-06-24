import type { AnyCircuitElement } from "circuit-json"
import type { getFullConnectivityMapFromCircuitJson } from "circuit-json-to-connectivity-map"
import { getElementId } from "@tscircuit/circuit-json-util"
import { getElementSubcircuitConnectivityKey } from "./getElementSubcircuitConnectivityKey"

export const buildSubcircuitConnectivityLookup = (
  circuitJson: AnyCircuitElement[],
  connectivityMap: ReturnType<typeof getFullConnectivityMapFromCircuitJson>,
) => {
  const idToSubcircuitConnectivityKey: Record<string, string> = {}

  for (const element of circuitJson) {
    const id = getElementId(element)
    const key = getElementSubcircuitConnectivityKey(element)
    if (id && key) {
      idToSubcircuitConnectivityKey[id] = key
    }
  }

  const generatedNetIdToSubcircuitConnectivityKey: Record<string, string> = {}
  for (const [generatedNetId, connectedIds] of Object.entries(
    connectivityMap.netMap,
  )) {
    const connectedSubcircuitKeys = new Set(
      connectedIds
        .map((id) => idToSubcircuitConnectivityKey[id])
        .filter((key): key is string => Boolean(key)),
    )
    if (connectedSubcircuitKeys.size > 1) {
      throw new Error(
        `Multiple subcircuit connectivity keys found for generated connectivity map net "${generatedNetId}": ${Array.from(connectedSubcircuitKeys).join(", ")}`,
      )
    }
    const subcircuitKey = connectedSubcircuitKeys.values().next().value
    if (subcircuitKey) {
      generatedNetIdToSubcircuitConnectivityKey[generatedNetId] = subcircuitKey
    }
  }

  return {
    knownSubcircuitConnectivityKeys: new Set(
      Object.values(idToSubcircuitConnectivityKey),
    ),
    getSubcircuitConnectivityKeyForId(id: string): string | undefined {
      const directKey = idToSubcircuitConnectivityKey[id]
      if (directKey) return directKey

      const generatedNetId = connectivityMap.getNetConnectedToId(id)
      if (!generatedNetId) return undefined

      return generatedNetIdToSubcircuitConnectivityKey[generatedNetId]
    },
  }
}
