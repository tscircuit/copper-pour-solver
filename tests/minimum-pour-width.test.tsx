import { expect, test } from "bun:test"
import { Circuit } from "@tscircuit/core"
import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
} from "lib/index"
import { runSolverAndRenderToSvg } from "./utils/run-solver-and-render-to-svg"

test("a ground pour between two slots respects its minimum copper width", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={6} height={4} routingDisabled>
      <net name="GND" isGroundNet />
      <hole name="NORTH" shape="rect" width={0.8} height={1.6} pcbY={0.91} />
      <hole name="SOUTH" shape="rect" width={0.8} height={1.6} pcbY={-0.91} />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  // The slots and their clearances leave 0.12 mm of copper between them.
  const options = {
    layer: "top" as const,
    net_name: "GND",
    source_net_name: "GND",
    cutout_margin: 0.05,
    board_edge_margin: 0.35,
    trace_margin: 0.05,
    pad_margin: 0.05,
    minWidth: 0.15,
  }
  for (const [minWidth, islandCount] of [
    [0.1, 1],
    [0.12, 1],
    [0.15, 2],
  ] as const) {
    const input = convertCircuitJsonToInputProblem(circuitJson, {
      ...options,
      minWidth,
    })
    expect(
      new CopperPourPipelineSolver(input).getOutput().brep_shapes,
    ).toHaveLength(islandCount)
  }
  expect(runSolverAndRenderToSvg(circuitJson, options)).toMatchSvgSnapshot(
    import.meta.path,
  )
})
