import { expect, test } from "bun:test"
import { Circuit } from "@tscircuit/core"
import type { PcbHoleOval } from "circuit-json"
import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
} from "lib/index"
import { runSolverAndRenderToSvg } from "./utils/run-solver-and-render-to-svg"

test("repro: non-plated oval hole is omitted from copper-pour clearance", async () => {
  const clearance = 0.3
  const roundHoleX = -3
  const ovalHoleX = 3
  const ovalHoleWidth = 4
  const ovalHoleHeight = 2
  const circuit = new Circuit()
  circuit.add(
    <board width={16} height={10} routingDisabled>
      <net name="GND" isGroundNet />
      <hole name="ROUND" diameter={2} pcbX={roundHoleX} />
      <pcbnotetext
        text={`GND POUR: ${clearance} mm clearance`}
        pcbY={3.5}
        fontSize={0.6}
      />
      <pcbnotetext text="ROUND" pcbX={roundHoleX} pcbY={2} fontSize={0.5} />
      <pcbnotetext
        text="NON-PLATED OVAL"
        pcbX={ovalHoleX}
        pcbY={2}
        fontSize={0.5}
      />
      <pcbnotetext
        text="Expected: clearance around both openings"
        pcbY={-3}
        fontSize={0.5}
      />
    </board>,
  )
  await circuit.renderUntilSettled()

  const ovalHole: PcbHoleOval = {
    type: "pcb_hole",
    pcb_hole_id: "pcb_hole_oval_repro",
    hole_shape: "oval",
    hole_width: ovalHoleWidth,
    hole_height: ovalHoleHeight,
    x: ovalHoleX,
    y: 0,
  }
  const circuitJson = [...circuit.getCircuitJson(), ovalHole]
  const holes = circuitJson.filter((element) => element.type === "pcb_hole")
  expect(holes).toHaveLength(2)
  const roundHole = holes.find((hole) => hole.hole_shape === "circle")!
  expect(holes.find((hole) => hole.hole_shape === "oval")).toMatchObject({
    hole_width: ovalHoleWidth,
    hole_height: ovalHoleHeight,
    x: ovalHoleX,
    y: 0,
  })

  for (const layer of ["top", "bottom"] as const) {
    const input = convertCircuitJsonToInputProblem(circuitJson, {
      layer,
      source_net_name: "GND",
      pad_margin: clearance,
      trace_margin: clearance,
      board_edge_margin: 0.5,
      cutout_margin: clearance,
    })
    expect(input.pads.map((pad) => pad.padId)).toEqual([roundHole.pcb_hole_id])
    expect(input.pads.some((pad) => pad.padId === ovalHole.pcb_hole_id)).toBe(
      false,
    )
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
