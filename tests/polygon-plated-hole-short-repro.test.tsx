import { expect, test } from "bun:test"
import { Circuit } from "@tscircuit/core"
import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
} from "lib/index"
import { runSolverAndRenderToSvg } from "./utils/run-solver-and-render-to-svg"

test("repro: polygon plated hole is omitted from ground pour clearance", async () => {
  const clearance = 0.3
  const circuit = new Circuit()
  circuit.add(
    <board width={16} height={10} routingDisabled>
      <net name="GND" isGroundNet />
      <net name="VCC" isPowerNet />
      <chip
        name="J1"
        connections={{ pin1: "net.VCC", pin2: "net.VCC" }}
        footprint={
          <footprint>
            <platedhole
              shape="hole_with_polygon_pad"
              holeShape="circle"
              holeDiameter={0.8}
              holeOffsetX={0}
              holeOffsetY={0}
              pcbX={-3}
              portHints={["pin1"]}
              padOutline={[
                { x: -1, y: -1 },
                { x: 1, y: -1 },
                { x: 1, y: 1 },
                { x: -1, y: 1 },
              ]}
            />
            <platedhole
              shape="circular_hole_with_rect_pad"
              holeDiameter={0.8}
              rectPadWidth={2}
              rectPadHeight={2}
              pcbX={3}
              portHints={["pin2"]}
            />
          </footprint>
        }
      />
      <pcbnotetext
        text="GND POUR: 0.3 mm clearance"
        pcbY={3.5}
        fontSize={0.6}
      />
      <pcbnotetext text="POLYGON: VCC" pcbX={-3} pcbY={2} fontSize={0.5} />
      <pcbnotetext text="RECT: VCC" pcbX={3} pcbY={2} fontSize={0.5} />
      <pcbnotetext
        text="Expected: clearance around BOTH pads"
        pcbY={-3}
        fontSize={0.5}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const platedHoles = circuitJson.filter(
    (elm) => elm.type === "pcb_plated_hole",
  )
  expect(platedHoles).toHaveLength(2)
  const polygonPad = platedHoles.find(
    (pad) => pad.shape === "hole_with_polygon_pad",
  )!
  const rectPad = platedHoles.find(
    (pad) => pad.shape === "circular_hole_with_rect_pad",
  )!
  const inputProblem = convertCircuitJsonToInputProblem(circuitJson, {
    layer: "bottom",
    source_net_name: "GND",
    pad_margin: clearance,
    trace_margin: clearance,
    board_edge_margin: 0.5,
  })

  // Characterize the bug, not the desired behavior: only the rectangular pad survives.
  expect(inputProblem.pads.map((pad) => pad.padId)).toEqual([
    rectPad.pcb_plated_hole_id,
  ])
  expect(
    inputProblem.pads.some(
      (pad) => pad.padId === polygonPad.pcb_plated_hole_id,
    ),
  ).toBe(false)
  const output = new CopperPourPipelineSolver(inputProblem).getOutput()
  expect(output.brep_shapes).toHaveLength(1)
  expect(output.brep_shapes[0]!.inner_rings).toHaveLength(1)
  const clearanceVertices = output.brep_shapes[0]!.inner_rings[0]!.vertices
  expect(Math.min(...clearanceVertices.map((point) => point.x))).toBeCloseTo(
    1.7,
  )
  expect(Math.max(...clearanceVertices.map((point) => point.x))).toBeCloseTo(
    4.3,
  )

  const svg = runSolverAndRenderToSvg(circuitJson, {
    layer: "bottom",
    net_name: "GND",
    pad_margin: clearance,
    trace_margin: clearance,
    board_edge_margin: 0.5,
  })
  await expect(svg).toMatchSvgSnapshot(import.meta.path)
})
