import { expect, test } from "bun:test"
import { Circuit } from "@tscircuit/core"
import type { AnyCircuitElement, PcbHole } from "circuit-json"
import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
} from "lib/index"
import { runSolverAndRenderToSvg } from "./utils/run-solver-and-render-to-svg"

test("non-plated square holes receive copper-pour clearance", async () => {
  const clearance = 0.3
  const holeX = 2
  const holeSize = 2
  const circuit = new Circuit()
  circuit.add(
    <board width={12} height={8} routingDisabled>
      <net name="GND" isGroundNet />
      <pcbnotetext
        text={`GND POUR: ${clearance} mm clearance`}
        pcbY={3}
        fontSize={0.6}
      />
      <pcbnotetext
        text="Expected: clearance around square hole"
        pcbY={-3}
        fontSize={0.5}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const squareHole: PcbHole = {
    type: "pcb_hole",
    pcb_hole_id: "pcb_hole_square",
    hole_shape: "square",
    hole_diameter: holeSize,
    x: holeX,
    y: 0,
  }
  const circuitJson = [
    ...circuit.getCircuitJson(),
    squareHole,
  ] as AnyCircuitElement[]

  for (const layer of ["top", "bottom"] as const) {
    const input = convertCircuitJsonToInputProblem(circuitJson, {
      layer,
      source_net_name: "GND",
      pad_margin: clearance,
      trace_margin: clearance,
      board_edge_margin: 0.5,
      cutout_margin: clearance,
    })
    expect(input.pads).toEqual([
      {
        shape: "rect",
        padId: "pcb_hole_square",
        layer,
        connectivityKey: "hole:pcb_hole_square",
        bounds: {
          minX: holeX - holeSize / 2,
          minY: -holeSize / 2,
          maxX: holeX + holeSize / 2,
          maxY: holeSize / 2,
        },
      },
    ])

    const output = new CopperPourPipelineSolver(input).getOutput()
    expect(output.brep_shapes).toHaveLength(1)
    const clearanceRings = output.brep_shapes[0]!.inner_rings
    expect(clearanceRings).toHaveLength(1)
    const xs = clearanceRings[0]!.vertices.map((point) => point.x)
    const ys = clearanceRings[0]!.vertices.map((point) => point.y)
    expect(Math.min(...xs)).toBeCloseTo(holeX - holeSize / 2 - clearance)
    expect(Math.max(...xs)).toBeCloseTo(holeX + holeSize / 2 + clearance)
    expect(Math.min(...ys)).toBeCloseTo(-holeSize / 2 - clearance)
    expect(Math.max(...ys)).toBeCloseTo(holeSize / 2 + clearance)
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
