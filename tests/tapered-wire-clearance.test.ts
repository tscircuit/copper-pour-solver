import { expect, test } from "bun:test"
import type { AnyCircuitElement } from "circuit-json"
import {
  convertCircuitJsonToInputProblem,
  CopperPourPipelineSolver,
} from "lib/index"

const circuitJson = [
  {
    type: "pcb_board",
    pcb_board_id: "pcb_board_0",
    center: { x: 0, y: 0 },
    width: 14,
    height: 8,
    num_layers: 2,
    thickness: 1.6,
    material: "fr4",
  },
  {
    type: "source_net",
    source_net_id: "source_net_gnd",
    name: "GND",
    subcircuit_connectivity_map_key: "net_gnd",
  },
  {
    type: "source_net",
    source_net_id: "source_net_signal",
    name: "SIGNAL",
    subcircuit_connectivity_map_key: "net_signal",
  },
  {
    type: "source_trace",
    source_trace_id: "source_trace_signal",
    connected_source_net_ids: ["source_net_signal"],
    connected_source_port_ids: [],
    subcircuit_connectivity_map_key: "net_signal",
  },
  {
    type: "pcb_trace",
    pcb_trace_id: "pcb_trace_signal",
    source_trace_id: "source_trace_signal",
    route: [
      {
        route_type: "wire",
        x: -2,
        y: 0,
        width: 2,
        start_width: 2,
        end_width: 0.2,
        width_interpolation_mode: "quadratic",
        layer: "top",
      },
      { route_type: "via", x: 2, y: 0, from_layer: "top", to_layer: "bottom" },
    ],
  },
] as AnyCircuitElement[]

test("quadratic wire taper ending at a via uses its outline and trace clearance", () => {
  const input = convertCircuitJsonToInputProblem(circuitJson, {
    layer: "top",
    source_net_id: "source_net_gnd",
    pad_margin: 0.7,
    trace_margin: 0.2,
  })
  expect(input.pads).toHaveLength(1)
  expect(input.pads[0]).toMatchObject({
    shape: "polygon",
    isTrace: true,
    connectivityKey: "net_signal",
  })
  const result = new CopperPourPipelineSolver(input).getOutput()
  const hole = result.brep_shapes[0]!.inner_rings[0]!.vertices
  expect(Math.min(...hole.map((p) => p.x))).toBeCloseTo(-2.2, 3)
  expect(Math.max(...hole.map((p) => p.x))).toBeCloseTo(2.2, 3)
  // Polygon offsets use miter joins at the flat cap, so its corner extends
  // beyond 1.2 mm. Changing pad clearance must not change this trace outline.
  const changedPadMargin = structuredClone(input)
  changedPadMargin.regionsForPour[0]!.padMargin = 1.5
  expect(new CopperPourPipelineSolver(changedPadMargin).getOutput()).toEqual(
    result,
  )
  const outline =
    input.pads[0]!.shape === "polygon" ? input.pads[0]!.points : []
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="260" viewBox="-3 -2 7 3.5"><rect x="-3" y="-2" width="7" height="3.5" fill="#d5e6cc"/><text x="-2.7" y="-1.6" font-size="0.2">Quadratic taper: 0.2 mm trace clearance, flat caps</text><polygon points="${hole.map((p) => `${p.x},${-p.y}`).join(" ")}" fill="white"/><polygon points="${outline.map((p) => `${p.x},${-p.y}`).join(" ")}" fill="#bf7829"/></svg>`
  expect(svg).toMatchSvgSnapshot(import.meta.path)
})
