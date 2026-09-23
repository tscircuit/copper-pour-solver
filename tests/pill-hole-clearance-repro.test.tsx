import { expect, test } from "bun:test"
import { Circuit } from "@tscircuit/core"
import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
} from "lib/index"
import { runSolverAndRenderToSvg } from "./utils/run-solver-and-render-to-svg"

test("repro: non-plated pill hole is omitted from copper-pour clearance", async () => {
  const clearance = 0.3
  const circuit = new Circuit()
  circuit.add(
    <board width={20} height={10} routingDisabled>
      <net name="GND" isGroundNet />
      <hole name="ROUND" diameter={2} pcbX={-5} />
      <hole name="SLOT" shape="pill" width={6} height={2} pcbX={3} />
      <pcbnotetext
        text="GND POUR: 0.3 mm clearance"
        pcbY={3.5}
        fontSize={0.6}
      />
      <pcbnotetext text="ROUND" pcbX={-5} pcbY={2} fontSize={0.5} />
      <pcbnotetext text="NON-PLATED SLOT" pcbX={3} pcbY={2} fontSize={0.5} />
      <pcbnotetext
        text="Expected: clearance around both openings"
        pcbY={-3}
        fontSize={0.5}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const holes = circuitJson.filter((element) => element.type === "pcb_hole")
  expect(holes).toHaveLength(2)
  const slot = holes.find((hole) => hole.hole_shape === "pill")!
  expect(slot).toMatchObject({ hole_width: 6, hole_height: 2, x: 3, y: 0 })

  for (const layer of ["top", "bottom"] as const) {
    const input = convertCircuitJsonToInputProblem(circuitJson, {
      layer,
      source_net_name: "GND",
      pad_margin: clearance,
      trace_margin: clearance,
      board_edge_margin: 0.5,
      cutout_margin: clearance,
    })
    // Characterize the bug: the round hole survives, but the slot is missing.
    expect(input.pads).toHaveLength(1)
    expect(input.pads.some((pad) => pad.padId === slot.pcb_hole_id)).toBe(false)
    const output = new CopperPourPipelineSolver(input).getOutput()
    expect(output.brep_shapes).toHaveLength(1)
    expect(output.brep_shapes[0]!.inner_rings).toHaveLength(1)
  }

  expect(
    runSolverAndRenderToSvg(circuitJson, {
      layer: "top",
      net_name: "GND",
      pad_margin: clearance,
      trace_margin: clearance,
      board_edge_margin: 0.5,
      cutout_margin: clearance,
    }),
  ).toMatchSvgSnapshot(import.meta.path)
})
