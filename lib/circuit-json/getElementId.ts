import type { AnyCircuitElement } from "circuit-json"

export const getElementId = (
  element: AnyCircuitElement,
): string | undefined => {
  const elm = element as any
  return (
    elm.source_net_id ??
    elm.source_trace_id ??
    elm.source_port_id ??
    elm.pcb_port_id ??
    elm.pcb_smtpad_id ??
    elm.pcb_plated_hole_id ??
    elm.pcb_trace_id ??
    elm.pcb_via_id
  )
}
