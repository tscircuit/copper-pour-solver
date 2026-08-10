import { expect, test } from "bun:test"
import type { AnyCircuitElement } from "circuit-json"
import { convertCircuitJsonToInputProblem } from "lib/circuit-json/convert-circuit-json-to-input-problem"

const circuitJson = [
  {
    type: "pcb_board",
    pcb_board_id: "pcb_board_0",
    center: { x: 0, y: 0 },
    width: 10,
    height: 10,
    thickness: 1.4,
    num_layers: 2,
    material: "fr4",
  },
  {
    type: "source_net",
    source_net_id: "source_net_gnd",
    name: "GND",
    subcircuit_connectivity_map_key: "net_gnd",
  },
  {
    type: "pcb_smtpad",
    pcb_smtpad_id: "pcb_smtpad_rect",
    pcb_component_id: "pcb_component_0",
    layer: "top",
    shape: "rect",
    x: -2,
    y: 0,
    width: 2,
    height: 1,
    port_hints: ["1"],
  },
  {
    type: "pcb_smtpad",
    pcb_smtpad_id: "pcb_smtpad_rotated_rect",
    pcb_component_id: "pcb_component_0",
    layer: "top",
    shape: "rotated_rect",
    x: 2,
    y: 0,
    width: 2,
    height: 1,
    ccw_rotation: 45,
    port_hints: ["2"],
  },
] as AnyCircuitElement[]

test("repro05 drops rotated_rect pads from copper-pour obstacles", () => {
  const inputProblem = convertCircuitJsonToInputProblem(circuitJson, {
    layer: "top",
    source_net_id: "source_net_gnd",
    pad_margin: 0.2,
    trace_margin: 0.2,
  })

  // Repro: the ordinary rectangular pad is preserved as an obstacle, but the
  // otherwise equivalent rotated rectangular pad is silently dropped.
  expect(inputProblem.pads.map((pad) => pad.padId)).toEqual(["pcb_smtpad_rect"])
})
