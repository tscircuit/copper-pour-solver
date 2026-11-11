import { expect, test } from "bun:test"
import { Circuit } from "@tscircuit/core"
import type { Point } from "@tscircuit/math-utils"
import type { AnyCircuitElement } from "circuit-json"
import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
} from "lib/index"
import { runSolverAndRenderToSvg } from "./utils/run-solver-and-render-to-svg"

// L-shaped board with a single concave corner at (0, 0).
const ccwOutline: Point[] = [
  { x: -5, y: -5 },
  { x: 5, y: -5 },
  { x: 5, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 5 },
  { x: -5, y: 5 },
]
const cwOutline = [...ccwOutline].reverse()
const boardEdgeMargin = 1

const isPointInRing = (point: Point, ring: Point[]) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside
    }
  }
  return inside
}

const renderBoard = async (outline: Point[]) => {
  const circuit = new Circuit()
  circuit.add(
    <board outline={outline} routingDisabled>
      <net name="GND" isGroundNet />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson() as AnyCircuitElement[]
}

const solvePour = (circuitJson: AnyCircuitElement[]) =>
  new CopperPourPipelineSolver(
    convertCircuitJsonToInputProblem(circuitJson, {
      layer: "top",
      source_net_name: "GND",
      pad_margin: 0.2,
      trace_margin: 0.2,
      board_edge_margin: boardEdgeMargin,
    }),
  ).getOutput()

test("board edge clearance at a concave corner does not depend on outline winding", async () => {
  // Inside the board, 0.8 * margin from both edges of the concave corner:
  // farther than board_edge_margin from every edge, so it must be copper.
  const probe = { x: -0.8 * boardEdgeMargin, y: -0.8 * boardEdgeMargin }
  expect(Math.hypot(probe.x, probe.y)).toBeGreaterThan(boardEdgeMargin)

  const results = []
  for (const outline of [ccwOutline, cwOutline]) {
    const output = solvePour(await renderBoard(outline))
    expect(output.brep_shapes).toHaveLength(1)
    const outerRing = output.brep_shapes[0]!.outer_ring.vertices
    results.push({
      probeIsCopper: isPointInRing(probe, outerRing),
      outerRing,
    })
  }

  expect(results.map((r) => r.probeIsCopper)).toEqual([true, true])

  // No copper may come closer than board_edge_margin to the concave corner.
  for (const { outerRing } of results) {
    for (const vertex of outerRing) {
      expect(Math.hypot(vertex.x, vertex.y)).toBeGreaterThanOrEqual(
        boardEdgeMargin - 1e-6,
      )
    }
  }

  expect(
    runSolverAndRenderToSvg(await renderBoard(ccwOutline), {
      layer: "top",
      net_name: "GND",
      pad_margin: 0.2,
      trace_margin: 0.2,
      board_edge_margin: boardEdgeMargin,
    }),
  ).toMatchSvgSnapshot(import.meta.path)
})
