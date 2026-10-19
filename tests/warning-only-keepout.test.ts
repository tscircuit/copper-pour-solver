import { expect, test } from "bun:test"
import type { AnyCircuitElement } from "circuit-json"
import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
} from "lib/index"
import { runSolverAndRenderToSvg } from "./utils/run-solver-and-render-to-svg"

const circuitJson = [
  {
    type: "source_net",
    source_net_id: "source_net_gnd",
    name: "GND",
    member_source_group_ids: [],
    is_ground: true,
    is_power: false,
    is_positive_voltage_source: false,
    subcircuit_id: "subcircuit_0",
    subcircuit_connectivity_map_key: "subcircuit_0_connectivity_gnd",
  },
  {
    type: "pcb_board",
    pcb_board_id: "pcb_board_0",
    center: { x: 0, y: 0 },
    thickness: 1.6,
    num_layers: 2,
    width: 10,
    height: 10,
    material: "fr4",
  },
  {
    type: "pcb_keepout",
    pcb_keepout_id: "pcb_keepout_enforced",
    shape: "rect",
    center: { x: -2, y: 0 },
    width: 2,
    height: 3,
    layers: ["top", "bottom"],
  },
  {
    type: "pcb_keepout",
    pcb_keepout_id: "pcb_keepout_warning_only_rect",
    shape: "rect",
    center: { x: 2, y: 0 },
    width: 2,
    height: 3,
    layers: ["top", "bottom"],
    warning_only: true,
  },
  {
    type: "pcb_keepout",
    pcb_keepout_id: "pcb_keepout_warning_only_circle",
    shape: "circle",
    center: { x: 0, y: 3 },
    radius: 1,
    layers: ["top", "bottom"],
    warning_only: true,
  },
] as AnyCircuitElement[]

test("warning_only keepouts do not clip copper pours", () => {
  for (const layer of ["top", "bottom"] as const) {
    const inputProblem = convertCircuitJsonToInputProblem(circuitJson, {
      layer,
      source_net_id: "source_net_gnd",
      pad_margin: 0.2,
      trace_margin: 0.1,
    })

    expect(
      inputProblem.pads
        .filter((pad) => pad.connectivityKey.startsWith("keepout:"))
        .map((pad) => pad.padId),
    ).toEqual(["pcb_keepout_enforced"])

    const output = new CopperPourPipelineSolver(inputProblem).getOutput()
    expect(output.brep_shapes).toHaveLength(1)
    const innerRings = output.brep_shapes[0]!.inner_rings
    expect(innerRings).toHaveLength(1)
    const xs = innerRings[0]!.vertices.map(({ x }) => x)
    expect(Math.min(...xs)).toBeCloseTo(-3, 2)
    expect(Math.max(...xs)).toBeCloseTo(-1, 2)
  }

  expect(
    runSolverAndRenderToSvg(circuitJson, {
      layer: "top",
      net_name: "GND",
      pad_margin: 0.2,
      trace_margin: 0.1,
    }),
  ).toMatchSvgSnapshot(import.meta.path)
})
