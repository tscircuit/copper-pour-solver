import { expect, test } from "bun:test"
import type { AnyCircuitElement } from "circuit-json"
import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
} from "lib/index"

test("BeagleBone P5 mounting drills clear inner-layer pours when wider than the pad", () => {
  // P5's two mounting holes have a 3.2512 mm drill and a 1.016 mm pad in the
  // Altium source. Move one to board origin; retain its dimensions and stack.
  const circuitJson: AnyCircuitElement[] = [
    {
      type: "pcb_board",
      pcb_board_id: "board",
      center: { x: 0, y: 0 },
      width: 8,
      height: 8,
      thickness: 1.6,
      num_layers: 6,
      material: "fr4",
    },
    {
      type: "source_net",
      source_net_id: "gnd",
      name: "DGND",
      subcircuit_connectivity_map_key: "ground",
      member_source_group_ids: [],
      is_ground: true,
      is_power: false,
      is_positive_voltage_source: false,
    },
    {
      type: "pcb_plated_hole",
      pcb_plated_hole_id: "p5_mounting_hole",
      pcb_component_id: "P5",
      shape: "circle",
      x: 0,
      y: 0,
      outer_diameter: 1.016,
      hole_diameter: 3.2512,
      layers: ["top", "bottom", "inner1", "inner2", "inner3", "inner4"],
    },
  ]
  for (const layer of ["inner1", "inner4"] as const) {
    const problem = convertCircuitJsonToInputProblem(circuitJson, {
      layer,
      source_net_id: "gnd",
      pad_margin: 0.2,
      trace_margin: 0.2,
    })
    const output = new CopperPourPipelineSolver(problem).getOutput()
    expect(output.brep_shapes).toHaveLength(1)
    const holes = output.brep_shapes[0]!.inner_rings
    expect(holes).toHaveLength(1)
    const minimumRadius = Math.min(
      ...holes[0]!.vertices.map(({ x, y }) => Math.hypot(x, y)),
    )
    expect(minimumRadius).toBeGreaterThan(3.2512 / 2)
    expect(minimumRadius).toBeCloseTo(3.2512 / 2 + 0.2, 2)
  }
})
