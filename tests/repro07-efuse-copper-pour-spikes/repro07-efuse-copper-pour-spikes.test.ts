import { expect, test } from "bun:test"
import type { AnyCircuitElement, Point } from "circuit-json"
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

const getPourInput = (padMargin: number, elements = circuitJson) =>
  convertCircuitJsonToInputProblem(elements, {
    layer: "top",
    source_net_name: "GND",
    pad_margin: padMargin,
    trace_margin: 0.25,
  })

const solvePour = (padMargin: number) =>
  new CopperPourPipelineSolver(getPourInput(padMargin)).getOutput().brep_shapes

const getMidpointCrossings = (vertices: Point[]) =>
  vertices.flatMap((start, index) => {
    const end = vertices[(index + 1) % vertices.length]!
    const startsAboveMidpoint = start.y > 0
    const endsAboveMidpoint = end.y > 0
    if (startsAboveMidpoint === endsAboveMidpoint) return []
    return [start.x - (start.y * (end.x - start.x)) / (end.y - start.y)]
  })

test("eFuse ground pour follows a straight clearance between adjacent rounded pins", async () => {
  const brep_shapes = solvePour(0.25)
  expect(brep_shapes).toHaveLength(1)
  const [pour] = brep_shapes
  expect(pour!.inner_rings).toHaveLength(1)
  const crossings = getMidpointCrossings(pour!.inner_rings[0]!.vertices)

  // At the midpoint between pins, both edges of the clearance follow the
  // same extent as the capsule ends at the pin centers.
  expect(Math.max(...crossings)).toBeCloseTo(-1.349997, 6)
  expect(Math.min(...crossings)).toBeCloseTo(-2.649995, 6)

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

test("the eFuse pins retain copper between non-overlapping clearances", () => {
  const brep_shapes = solvePour(0.1)
  expect(brep_shapes).toHaveLength(1)
  expect(brep_shapes[0]!.inner_rings).toHaveLength(2)
})

test("aligned pads on separate footprints keep their individual clearances", () => {
  const separateFootprints = circuitJson.map((element) =>
    element.type === "pcb_smtpad" && element.pcb_smtpad_id === "pcb_smtpad_0"
      ? { ...element, pcb_component_id: "pcb_component_other" }
      : element,
  )
  const input = getPourInput(0.25, separateFootprints)
  const { brep_shapes } = new CopperPourPipelineSolver(input).getOutput()
  const crossings = getMidpointCrossings(
    brep_shapes[0]!.inner_rings[0]!.vertices,
  )
  expect(Math.max(...crossings)).toBeCloseTo(-1.443021, 6)
})

test("the clearance follows a rotated pin row", () => {
  const rotation = 37.25
  const angle = (rotation * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const input = getPourInput(0.25)
  for (const pad of input.pads) {
    if (pad.shape !== "pill") continue
    // Rotate the row about (-2, 0), so it stays inside the test board.
    const x = pad.x + 2
    const y = pad.y
    pad.x = x * cos - y * sin - 2
    pad.y = x * sin + y * cos
    pad.ccwRotation += rotation
  }

  const { brep_shapes } = new CopperPourPipelineSolver(input).getOutput()
  const vertices = brep_shapes[0]!.inner_rings[0]!.vertices.map(({ x, y }) => ({
    x: (x + 2) * cos + y * sin - 2,
    y: -(x + 2) * sin + y * cos,
  }))
  const crossings = getMidpointCrossings(vertices)
  expect(Math.max(...crossings)).toBeCloseTo(-1.349997, 5)
  expect(Math.min(...crossings)).toBeCloseTo(-2.649995, 5)
})

test("a same-net pin between two different-net pins interrupts the row", () => {
  const input = getPourInput(0.25)
  const [first, second] = input.pads.filter((pad) => pad.shape === "pill")
  first!.y = -0.375
  second!.y = 0.375
  input.pads.push({
    ...first!,
    padId: "pcb_smtpad_ground_between_pins",
    y: 0,
    connectivityKey: input.regionsForPour[0]!.connectivityKey,
  })

  const { brep_shapes } = new CopperPourPipelineSolver(input).getOutput()
  const vertices = brep_shapes[0]!.inner_rings[0]!.vertices
  const clearanceBetweenPins = vertices.find(
    (point) => point.x > -2 && point.y === 0,
  )
  expect(clearanceBetweenPins?.x).toBeLessThan(-1.6)
})
