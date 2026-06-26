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

  const generatedNetIdToSubcircuitConnectivityKeys: Record<
    string,
    Set<string>
  > = {}
  const subcircuitConnectivityKeyToAliases: Record<string, Set<string>> = {}

  for (const [generatedNetId, connectedIds] of Object.entries(
    connectivityMap.netMap,
  )) {
    const connectedSubcircuitKeys = new Set(
      connectedIds
        .map((id) => idToSubcircuitConnectivityKey[id])
        .filter((key): key is string => Boolean(key)),
    )
    if (connectedSubcircuitKeys.size > 0) {
      generatedNetIdToSubcircuitConnectivityKeys[generatedNetId] =
        connectedSubcircuitKeys

      for (const subcircuitKey of connectedSubcircuitKeys) {
        const aliases =
          subcircuitConnectivityKeyToAliases[subcircuitKey] ?? new Set()
        for (const alias of connectedSubcircuitKeys) {
          aliases.add(alias)
        }
        subcircuitConnectivityKeyToAliases[subcircuitKey] = aliases
      }
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

      return generatedNetIdToSubcircuitConnectivityKeys[generatedNetId]
        ?.values()
        .next().value
    },
    getEquivalentSubcircuitConnectivityKeys(key: string): Set<string> {
      return subcircuitConnectivityKeyToAliases[key] ?? new Set([key])
    },
  }
}
