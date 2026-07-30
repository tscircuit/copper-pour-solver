import { expect, test } from "bun:test"
import type { AnyCircuitElement, PcbCopperPourBRep } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
} from "lib/index"
import type { InputProblem } from "lib/types"

// Pill / oval plated holes (e.g. USB-C receptacle shield legs) placed on a board that also has a
// top copper pour on a different net. The solver must anti-pad each one; before pill/oval plated
// holes were handled they were dropped from the pad list entirely and the pour flooded solid over
// them (a short). Positions are spread apart so each anti-pad stays its own ring.
const platedHoles = [
  { id: "pill_a", shape: "pill" as const, x: -6, y: -6, ccw_rotation: 0 },
  { id: "pill_b", shape: "pill" as const, x: 6, y: -6, ccw_rotation: 0 },
  { id: "pill_rot", shape: "pill" as const, x: -6, y: 6, ccw_rotation: 90 },
  { id: "oval_a", shape: "oval" as const, x: 6, y: 6, ccw_rotation: 0 },
]

const circuitJson: AnyCircuitElement[] = [
  {
    type: "pcb_board",
    pcb_board_id: "pcb_board_0",
    center: { x: 0, y: 0 },
    width: 20,
    height: 20,
    thickness: 1.4,
    num_layers: 2,
    material: "fr4",
  },
  ...platedHoles.map(({ id, shape, x, y, ccw_rotation }) => ({
    type: "pcb_plated_hole" as const,
    pcb_plated_hole_id: `pcb_plated_hole_${id}`,
    pcb_component_id: "pcb_component_shield",
    shape,
    x,
    y,
    outer_width: 1.2,
    outer_height: 1.8,
    hole_width: 0.8,
    hole_height: 1.4,
    ccw_rotation,
    layers: ["top", "bottom"] as const,
    port_hints: [id],
    is_covered_with_solder_mask: false,
  })),
] as AnyCircuitElement[]

const getInputProblem = () =>
  convertCircuitJsonToInputProblem(circuitJson, {
    layer: "top",
    subcircuit_connectivity_map_key: "net:GND",
    pad_margin: 0.15,
    trace_margin: 0.15,
  })

const renderSolvedPour = (inputProblem: InputProblem) => {
  const solver = new CopperPourPipelineSolver(inputProblem)
  const output = solver.getOutput()
  const pcbCopperPours = output.brep_shapes.map(
    (brep_shape, index) =>
      ({
        type: "pcb_copper_pour",
        shape: "brep",
        pcb_copper_pour_id: `pcb_copper_pour_${index}`,
        layer: "top",
        source_net_id: "source_net_gnd",
        brep_shape,
        covered_with_solder_mask: true,
      }) as PcbCopperPourBRep,
  )

  return convertCircuitJsonToPcbSvg([...circuitJson, ...pcbCopperPours] as any)
}

test("pill and oval plated holes clear copper pour", () => {
  const inputProblem = getInputProblem()

  const pillPads = inputProblem.pads.filter((pad) => pad.shape === "pill")

  // All four pill/oval plated holes become pill pads (before the fix they were dropped).
  expect(pillPads).toHaveLength(4)
  expect(
    pillPads.some(
      (pad) =>
        pad.padId === "pcb_plated_hole_pill_rot" && pad.ccwRotation === 90,
    ),
  ).toBe(true)

  const solver = new CopperPourPipelineSolver(inputProblem)
  const output = solver.getOutput()

  // One pour with an anti-pad void around each of the four plated holes.
  expect(output.brep_shapes).toHaveLength(1)
  expect(output.brep_shapes[0]!.inner_rings).toHaveLength(4)
})

test("pill and oval plated hole copper pour svg snapshot", async () => {
  const inputProblem = getInputProblem()

  const svg = renderSolvedPour(inputProblem)

  await expect(svg).toMatchSvgSnapshot(
    import.meta.path,
    "pill-plated-hole-copper-pour",
  )
})
