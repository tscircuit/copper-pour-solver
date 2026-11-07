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
