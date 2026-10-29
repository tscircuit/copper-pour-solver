import type { AnyCircuitElement } from "circuit-json"
import { getFullConnectivityMapFromCircuitJson } from "circuit-json-to-connectivity-map"
import { buildSubcircuitConnectivityLookup } from "./buildSubcircuitConnectivityLookup"
import type { CircuitJsonPourContext } from "./CircuitJsonPourContext"

export function createCircuitJsonPourContext(params: {
  circuitJson: AnyCircuitElement[]
  subcircuit_id?: string
}): CircuitJsonPourContext {
  const { circuitJson, subcircuit_id } = params
  const pcb_board = circuitJson.find((element) => element.type === "pcb_board")
  if (!pcb_board) throw new Error("No pcb_board found in circuit json")
  const globalConnectivityMap =
    getFullConnectivityMapFromCircuitJson(circuitJson)
  return {
    pcb_board,
    subcircuitConnectivityMap: buildSubcircuitConnectivityLookup(
      circuitJson,
      globalConnectivityMap,
      subcircuit_id,
    ),
  }
}
