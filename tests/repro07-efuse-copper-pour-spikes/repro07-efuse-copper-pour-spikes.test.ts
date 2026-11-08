import { expect, test } from "bun:test"
import type { AnyCircuitElement } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
} from "lib/index"

// Pins 3 and 4 and the exposed ground pad of U_EFUSE (TPS26630RGER) on
// imrishabh18/nema-23-stepper-controller v1.4.20, translated to chip-local mm.
const circuitJson: AnyCircuitElement[] = [
  {
    type: "pcb_board",
    pcb_board_id: "pcb_board_0",
    center: { x: 0, y: 0 },
    width: 6,
    height: 4,
    thickness: 1.6,
    num_layers: 4,
    material: "fr4",
  },
  {
    type: "source_net",
    source_net_id: "source_net_gnd",
    name: "GND",
    member_source_group_ids: [],
    subcircuit_connectivity_map_key: "gnd",
  },
  ...[0.249936, -0.249936].map((y, index) => ({
    type: "pcb_smtpad" as const,
    pcb_smtpad_id: `pcb_smtpad_${index}`,
    pcb_component_id: "pcb_component_efuse",
    layer: "top" as const,
    shape: "rotated_pill" as const,
    x: -1.999996,
    y,
    width: 0.2800096,
    height: 0.7999984,
    radius: 0.1400048,
    ccw_rotation: 270,
    port_hints: [`pin${index + 3}`],
    is_covered_with_solder_mask: false,
  })),
  {
    type: "source_port",
    source_port_id: "source_port_ep",
    name: "EP",
    source_component_id: "source_component_efuse",
    port_hints: ["pin25"],
  },
  {
    type: "source_trace",
    source_trace_id: "source_trace_ep",
    connected_source_port_ids: ["source_port_ep"],
    connected_source_net_ids: ["source_net_gnd"],
  },
  {
    type: "pcb_port",
    pcb_port_id: "pcb_port_ep",
    pcb_component_id: "pcb_component_efuse",
    source_port_id: "source_port_ep",
    layers: ["top"],
    x: 0,
    y: -0.012446,
  },
  {
    type: "pcb_smtpad",
    pcb_smtpad_id: "pcb_smtpad_ep",
    pcb_component_id: "pcb_component_efuse",
    pcb_port_id: "pcb_port_ep",
    layer: "top",
    shape: "rect",
    x: 0,
    y: -0.012446,
    width: 2.6999946,
    height: 2.6999946,
    port_hints: ["pin25"],
    is_covered_with_solder_mask: false,
  },
]

test("eFuse ground pour forms a spike between adjacent rounded pin clearances", async () => {
  const input = convertCircuitJsonToInputProblem(circuitJson, {
    layer: "top",
    source_net_name: "GND",
    pad_margin: 0.25,
    trace_margin: 0.25,
  })
  const { brep_shapes } = new CopperPourPipelineSolver(input).getOutput()
  expect(brep_shapes).toHaveLength(1)
  const [pour] = brep_shapes
  expect(pour!.inner_rings).toHaveLength(1)
  const vertices = pour!.inner_rings[0]!.vertices
  const betweenPins = vertices.find((point) => point.x > -2 && point.y === 0)

  // The clearance reaches x = -1.35 at each pin center, but its union dips
  // back between the pins, leaving a ~0.093 mm copper tooth outside the EP.
  expect(betweenPins?.x).toBeCloseTo(-1.443021, 5)

  const svg = convertCircuitJsonToPcbSvg([
    ...circuitJson,
    {
      type: "pcb_copper_pour",
      shape: "brep",
      pcb_copper_pour_id: "pcb_copper_pour_gnd",
      layer: "top",
      source_net_id: "source_net_gnd",
      brep_shape: pour!,
      covered_with_solder_mask: true,
    },
  ])
  await expect(svg).toMatchSvgSnapshot(import.meta.path)
})
