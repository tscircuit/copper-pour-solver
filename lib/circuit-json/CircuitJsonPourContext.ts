import type { PcbBoard } from "circuit-json"
import type { buildSubcircuitConnectivityLookup } from "./buildSubcircuitConnectivityLookup"

export interface CircuitJsonPourContext {
  pcb_board: PcbBoard
  subcircuitConnectivityMap: ReturnType<
    typeof buildSubcircuitConnectivityLookup
  >
}
