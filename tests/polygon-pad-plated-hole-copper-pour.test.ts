import { expect, test } from "bun:test"
import type { AnyCircuitElement, PcbPlatedHole } from "circuit-json"
import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
} from "lib/index"

const boardAndNet = [
  {
    type: "pcb_board",
    pcb_board_id: "board_0",
    center: { x: 0, y: 0 },
    width: 20,
    height: 20,
    thickness: 1.6,
    num_layers: 2,
    material: "fr4",
  },
  {
    type: "source_net",
    source_net_id: "gnd",
    name: "GND",
    subcircuit_connectivity_map_key: "net_gnd",
    member_source_group_ids: [],
    is_ground: true,
    is_power: false,
    is_positive_voltage_source: false,
  },
] as AnyCircuitElement[]

const polygonPadHole = (rotation: number): PcbPlatedHole =>
  ({
    type: "pcb_plated_hole",
    pcb_plated_hole_id: "poly_pad",
    pcb_component_id: "component_0",
    shape: "hole_with_polygon_pad",
    hole_shape: "circle",
    hole_diameter: 0.6,
    hole_offset_x: 0.2,
    hole_offset_y: 0,
    x: 2,
    y: -1,
    layers: ["top", "bottom"],
    // Local outline relative to the plated-hole center.
    pad_outline: [
      { x: -1, y: -0.5 },
      { x: 1, y: -0.5 },
      { x: 1, y: 0.5 },
      { x: -1, y: 0.5 },
    ],
    ...(rotation === 0 ? {} : { ccw_rotation: rotation }),
  }) as PcbPlatedHole

test("hole_with_polygon_pad plated holes clear copper pour", () => {
  const circuitJson: AnyCircuitElement[] = [...boardAndNet, polygonPadHole(0)]
  const input = convertCircuitJsonToInputProblem(circuitJson, {
    layer: "top",
    source_net_id: "gnd",
    pad_margin: 0.5,
    trace_margin: 0.2,
  })

  expect(input.pads).toEqual([
    {
      shape: "polygon",
      padId: "poly_pad",
      layer: "top",
      isPlatedHole: true,
      connectivityKey: "unconnected-plated-hole:poly_pad",
      points: [
        { x: 1, y: -1.5 },
        { x: 3, y: -1.5 },
        { x: 3, y: -0.5 },
        { x: 1, y: -0.5 },
      ],
    },
  ])

  const output = new CopperPourPipelineSolver(input).getOutput()
  expect(output.brep_shapes).toHaveLength(1)
  const voids = output.brep_shapes[0]!.inner_rings
  expect(voids).toHaveLength(1)
  const xs = voids[0]!.vertices.map(({ x }) => x)
  const ys = voids[0]!.vertices.map(({ y }) => y)
  expect(Math.min(...xs)).toBeCloseTo(0.5, 2)
  expect(Math.max(...xs)).toBeCloseTo(3.5, 2)
  expect(Math.min(...ys)).toBeCloseTo(-2, 2)
  expect(Math.max(...ys)).toBeCloseTo(0, 2)
})

test("hole_with_polygon_pad rotates pad_outline by ccw_rotation", () => {
  const circuitJson: AnyCircuitElement[] = [...boardAndNet, polygonPadHole(90)]
  const input = convertCircuitJsonToInputProblem(circuitJson, {
    layer: "bottom",
    source_net_id: "gnd",
    pad_margin: 0.5,
    trace_margin: 0.2,
  })

  expect(input.pads).toHaveLength(1)
  expect(input.pads[0]).toMatchObject({
    shape: "polygon",
    padId: "poly_pad",
    layer: "bottom",
    isPlatedHole: true,
  })
  const points = (input.pads[0] as { points: { x: number; y: number }[] })
    .points
  const expected = [
    { x: 2.5, y: -2 },
    { x: 2.5, y: 0 },
    { x: 1.5, y: 0 },
    { x: 1.5, y: -2 },
  ]
  expect(points).toHaveLength(expected.length)
  for (let i = 0; i < expected.length; i++) {
    expect(points[i]!.x).toBeCloseTo(expected[i]!.x, 6)
    expect(points[i]!.y).toBeCloseTo(expected[i]!.y, 6)
  }

  const output = new CopperPourPipelineSolver(input).getOutput()
  expect(output.brep_shapes).toHaveLength(1)
  const voids = output.brep_shapes[0]!.inner_rings
  expect(voids).toHaveLength(1)
  const xs = voids[0]!.vertices.map(({ x }) => x)
  const ys = voids[0]!.vertices.map(({ y }) => y)
  // 1x2 mm pad after 90° rotation, plus 0.5 mm margin on each side.
  expect(Math.min(...xs)).toBeCloseTo(1, 2)
  expect(Math.max(...xs)).toBeCloseTo(3, 2)
  expect(Math.min(...ys)).toBeCloseTo(-2.5, 2)
  expect(Math.max(...ys)).toBeCloseTo(0.5, 2)
})
