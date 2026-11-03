import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import {
  convertCircuitJsonToInputProblem,
  CopperPourPipelineSolver,
} from "lib/index"
import { hasCopperAt } from "./utils/has-copper-at"

test("clips to the explicit owning board when another panel board appears first", () => {
  const circuitJson: CircuitJson = [
    {
      type: "pcb_board",
      pcb_board_id: "left",
      center: { x: -13, y: 0 },
      width: 20,
      height: 12,
      num_layers: 2,
      thickness: 1.6,
      material: "fr4",
    },
    {
      type: "pcb_board",
      pcb_board_id: "right",
      center: { x: 13, y: 0 },
      width: 20,
      height: 12,
      num_layers: 2,
      thickness: 1.6,
      material: "fr4",
    },
    {
      type: "source_net",
      source_net_id: "right_ground",
      name: "GND",
      member_source_group_ids: [],
      subcircuit_connectivity_map_key: "right_ground",
    },
  ]
  const owningBoard = [
    { x: 3, y: -6 },
    { x: 23, y: -6 },
    { x: 23, y: 6 },
    { x: 3, y: 6 },
  ]
  const input = convertCircuitJsonToInputProblem(circuitJson, {
    layer: "bottom",
    source_net_id: "right_ground",
    pad_margin: 0.2,
    trace_margin: 0.2,
    board_edge_margin: 1,
    outline: owningBoard,
    board_outline: owningBoard,
  })
  const output = new CopperPourPipelineSolver(input).getOutput()
  expect(hasCopperAt(output.brep_shapes, { x: 13, y: 0 })).toBe(true)
  expect(hasCopperAt(output.brep_shapes, { x: 3.9, y: 0 })).toBe(false)
  expect(hasCopperAt(output.brep_shapes, { x: 4.1, y: 0 })).toBe(true)
  expect(hasCopperAt(output.brep_shapes, { x: -13, y: 0 })).toBe(false)
})
