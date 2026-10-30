import { expect, test } from "bun:test"
import type { AnyCircuitElement, BRepShape } from "circuit-json"
import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
} from "lib/index"
import { crossSectionFromPolygons } from "lib/solvers/copper-pour/manifold-geometry-adapter"
import { MANIFOLD_GEOMETRY_SCALE } from "lib/solvers/copper-pour/polygon-ring"
import { runSolverAndRenderToSvg } from "./utils/run-solver-and-render-to-svg"

// A bridged connector-clearance hole, as emitted by Core's preserved-outline
// copperpour API. The duplicate bridge vertices carry the hole's topology.
const referenceGroundOutline = [
  { x: -5, y: -3 },
  { x: 1, y: -3 },
  { x: 1, y: 3 },
  { x: -5, y: 3 },
  { x: -5, y: -3 },
  { x: -3, y: -1 },
  { x: -3, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
  { x: -3, y: -1 },
  { x: -5, y: -3 },
]

function areaInWindow(
  shapes: BRepShape[],
  bounds: { minX: number; maxX: number },
) {
  const window = crossSectionFromPolygons([
    [
      { x: bounds.minX, y: -0.5 },
      { x: bounds.maxX, y: -0.5 },
      { x: bounds.maxX, y: 0.5 },
      { x: bounds.minX, y: 0.5 },
    ],
  ])
  let area = 0
  try {
    for (const shape of shapes) {
      const section = crossSectionFromPolygons(
        [
          shape.outer_ring.vertices,
          ...shape.inner_rings.map((ring) => ring.vertices),
        ],
        "EvenOdd",
      )
      const intersection = section.intersect(window)
      area += intersection.area() / MANIFOLD_GEOMETRY_SCALE ** 2
      intersection.delete()
      section.delete()
    }
    return area
  } finally {
    window.delete()
  }
}

test("new fill reclaims a removed connector's gap while preserving different-net copper", async () => {
  // Two neighboring power domains are common on the Sitara EVMs. Existing
  // copper must not be lost or overlapped when the GND boundary is repoured.
  const circuitJson: AnyCircuitElement[] = [
    {
      type: "pcb_board",
      pcb_board_id: "board",
      center: { x: 0, y: 0 },
      width: 12,
      height: 8,
      thickness: 1.6,
      num_layers: 2,
      material: "fr4",
    },
    {
      type: "source_net",
      source_net_id: "gnd",
      name: "GND",
      subcircuit_connectivity_map_key: "ground",
      member_source_group_ids: [],
      is_ground: true,
      is_power: false,
      is_positive_voltage_source: false,
    },
    {
      type: "source_net",
      source_net_id: "power",
      name: "VDD",
      subcircuit_connectivity_map_key: "power",
      member_source_group_ids: [],
      is_ground: false,
      is_power: true,
      is_positive_voltage_source: true,
    },
    {
      type: "pcb_copper_pour",
      covered_with_solder_mask: true,
      pcb_copper_pour_id: "reference_ground",
      shape: "polygon",
      points: referenceGroundOutline,
      layer: "top",
      source_net_id: "gnd",
    },
    {
      type: "pcb_copper_pour",
      covered_with_solder_mask: true,
      pcb_copper_pour_id: "reference_power",
      shape: "polygon",
      points: [
        { x: 2, y: -2 },
        { x: 5, y: -2 },
        { x: 5, y: 2 },
        { x: 2, y: 2 },
      ],
      layer: "top",
      source_net_id: "power",
    },
  ]
  const options = {
    layer: "top" as const,
    source_net_id: "gnd",
    pad_margin: 0.2,
    trace_margin: 0.2,
  }
  const before = JSON.stringify(circuitJson)
  const input = convertCircuitJsonToInputProblem(circuitJson, options)
  const output = new CopperPourPipelineSolver(input).getOutput()
  expect(
    areaInWindow(output.brep_shapes, { minX: -2.5, maxX: -1.5 }),
  ).toBeCloseTo(1)
  expect(
    areaInWindow(output.brep_shapes, { minX: -4.5, maxX: -3.5 }),
  ).toBeCloseTo(1)
  expect(
    areaInWindow(output.brep_shapes, { minX: 1.8, maxX: 5.2 }),
  ).toBeCloseTo(0)
  expect(JSON.stringify(circuitJson)).toBe(before)
  await expect(
    runSolverAndRenderToSvg(circuitJson, { ...options, net_name: "GND" }),
  ).toMatchSvgSnapshot(import.meta.path)
})
