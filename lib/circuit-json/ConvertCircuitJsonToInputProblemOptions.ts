import type { LayerRef, Point } from "circuit-json"

export interface ConvertCircuitJsonToInputProblemOptions {
  layer: LayerRef
  subcircuit_id?: string
  source_net_id?: string
  source_net_name?: string
  subcircuit_connectivity_map_key?: string
  /**
   * @deprecated Use subcircuit_connectivity_map_key, source_net_id, or
   * source_net_name. Generated connectivity-map ids are intentionally rejected.
   */
  pour_connectivity_key?: string
  pad_margin: number
  trace_margin: number
  board_edge_margin?: number
  cutout_margin?: number
  outline?: Point[]
}
