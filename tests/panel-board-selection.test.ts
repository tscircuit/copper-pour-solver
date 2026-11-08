import { expect, test } from "bun:test"
import type { PcbCopperPourBRep } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
} from "lib/index"
import { panelBoards, panelCircuitJson } from "./fixtures/panel-board-selection"

test("panel pours use their selected PCB board boundary", async () => {
  const pourOptions = panelBoards.map((board) => ({
    pcb_board_id: board.pcb_board_id,
    layer: "top" as const,
    source_net_name: "GND",
    pad_margin: 0.2,
    trace_margin: 0.2,
    board_edge_margin: 0.5,
    // Oversized explicit pour: the selected physical board must clip it.
    outline: [
      { x: board.center.x - 8, y: -7 },
      { x: board.center.x + 8, y: -7 },
      { x: board.center.x + 8, y: 7 },
      { x: board.center.x - 8, y: 7 },
    ],
  }))
  const input = convertCircuitJsonToInputProblem(panelCircuitJson, pourOptions)
  const output = new CopperPourPipelineSolver(input).getOutput()
  expect(output.brep_shapes_by_region.map((shapes) => shapes.length)).toEqual([
    1, 1,
  ])
  const leftVertices = output.brep_shapes_by_region[0]![0]!.outer_ring.vertices
  const rightVertices = output.brep_shapes_by_region[1]![0]!.outer_ring.vertices
  expect(Math.min(...leftVertices.map((point) => point.x))).toBeCloseTo(-13.5)
  expect(Math.max(...leftVertices.map((point) => point.x))).toBeCloseTo(-4.5)
  expect(Math.min(...rightVertices.map((point) => point.x))).toBeCloseTo(2.5)
  expect(Math.max(...rightVertices.map((point) => point.x))).toBeCloseTo(13.5)
  expect(Math.min(...rightVertices.map((point) => point.y))).toBeCloseTo(-4.5)
  expect(Math.max(...rightVertices.map((point) => point.y))).toBeCloseTo(4.5)
  // The chamfer is x + y = 16; emitted copper must clear it by 0.5 mm.
  expect(
    Math.max(...rightVertices.map((point) => point.x + point.y)),
  ).toBeCloseTo(16 - Math.SQRT2 * 0.5, 3)
  const reversedInput = convertCircuitJsonToInputProblem(
    [...panelCircuitJson].reverse(),
    pourOptions,
  )
  expect(reversedInput.regionsForPour).toEqual(input.regionsForPour)
  const pours: PcbCopperPourBRep[] = output.brep_shapes_by_region.flatMap(
    (shapes, regionIndex) =>
      shapes.map((brep_shape, shapeIndex) => ({
        type: "pcb_copper_pour",
        pcb_copper_pour_id: `pcb_copper_pour_${regionIndex}_${shapeIndex}`,
        shape: "brep",
        layer: "top",
        brep_shape,
        source_net_id: "source_net_gnd",
        covered_with_solder_mask: false,
      })),
  )
  await expect(
    convertCircuitJsonToPcbSvg([...panelCircuitJson, ...pours]),
  ).toMatchSvgSnapshot(import.meta.path)
})
