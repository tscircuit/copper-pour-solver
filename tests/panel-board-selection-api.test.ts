import { expect, test } from "bun:test"
import { convertCircuitJsonToInputProblem } from "lib/index"
import { panelBoards, panelCircuitJson } from "./fixtures/panel-board-selection"

const pourOptions = {
  layer: "top" as const,
  source_net_name: "GND",
  pad_margin: 0.2,
  trace_margin: 0.2,
}

test("board selection preserves defaults and rejects missing explicit boards", () => {
  const firstBoardInput = convertCircuitJsonToInputProblem(
    panelCircuitJson,
    pourOptions,
  )
  expect(firstBoardInput.regionsForPour[0]?.bounds).toEqual({
    minX: -14,
    maxX: -4,
    minY: -4,
    maxY: 4,
  })
  const secondBoardInput = convertCircuitJsonToInputProblem(panelCircuitJson, {
    ...pourOptions,
    pcb_board_id: panelBoards[1]!.pcb_board_id,
  })
  expect(secondBoardInput.regionsForPour[0]?.bounds).toEqual({
    minX: 2,
    maxX: 14,
    minY: -5,
    maxY: 5,
  })
  expect(secondBoardInput.regionsForPour[0]?.boardOutline).toEqual(
    panelBoards[1]!.outline,
  )
  expect(() =>
    convertCircuitJsonToInputProblem(panelCircuitJson, {
      ...pourOptions,
      pcb_board_id: "pcb_board_missing",
    }),
  ).toThrow("Selected PCB board was not found in circuit JSON")
  expect(() => convertCircuitJsonToInputProblem([], pourOptions)).toThrow(
    "No pcb_board found in circuit json",
  )
})
