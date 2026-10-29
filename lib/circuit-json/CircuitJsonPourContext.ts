import type { AnyCircuitElement, LayerRef, PcbBoard } from "circuit-json"
import type { InputPad } from "lib/types"
import type { buildSubcircuitConnectivityLookup } from "./buildSubcircuitConnectivityLookup"

export interface CircuitJsonPourContext {
  circuitJson: AnyCircuitElement[]
  padsByLayer: Map<LayerRef, InputPad[]>
  pcb_board: PcbBoard
  subcircuitConnectivityMap: ReturnType<
    typeof buildSubcircuitConnectivityLookup
  >
}
