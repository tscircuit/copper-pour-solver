import { expect, test } from "bun:test"
import { CopperPourPipelineSolver } from "lib/index"
import type { InputPad, InputProblem } from "lib/types"

const gndPad: InputPad = {
  shape: "rect",
  padId: "gnd-pad-1",
  layer: "top",
  connectivityKey: "net:GND",
  isSmtPad: true,
  bounds: { minX: -7, minY: -1, maxX: -5, maxY: 1 },
}

// A closed ring of different-net copper moats a pocket of pour that can never
// reach the pour net, matching the orphan-island geometry from the issue.
const pocketRing: InputPad = {
  shape: "trace",
  padId: "sig-ring",
  layer: "top",
  connectivityKey: "net:SIG",
  width: 0.4,
  segments: [
    { x: 3.4, y: -1.6 },
    { x: 6.6, y: -1.6 },
    { x: 6.6, y: 1.6 },
    { x: 3.4, y: 1.6 },
    { x: 3.4, y: -1.6 },
  ],
}

const problem = (
  pads: InputPad[],
  remove_unconnected_islands?: boolean,
): InputProblem => ({
  regionsForPour: [
    {
      shape: "rect",
      layer: "top",
      bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
      connectivityKey: "net:GND",
      padMargin: 0.2,
      traceMargin: 0.2,
      remove_unconnected_islands,
    },
  ],
  pads,
})

const solveCount = (input: InputProblem) =>
  new CopperPourPipelineSolver(input).getOutput().brep_shapes.length

test("island sealed off by different-net copper is removed when the flag is set", () => {
  const input = problem([gndPad, pocketRing], true)
  expect(solveCount(input)).toBe(1)
})

test("same input keeps the orphan island when the flag is off", () => {
  const input = problem([gndPad, pocketRing])
  expect(solveCount(input)).toBe(2)
})

test("an island containing a pad of the pour net stays connected", () => {
  const pocketPad: InputPad = {
    shape: "circle",
    padId: "gnd-via",
    layer: "top",
    connectivityKey: "net:GND",
    x: 5,
    y: 0,
    radius: 0.5,
  }
  const input = problem([gndPad, pocketRing, pocketPad], true)
  expect(solveCount(input)).toBe(2)
})

test("a pour region with no same-net copper emits nothing under removal", () => {
  const input = problem([pocketRing], true)
  expect(solveCount(input)).toBe(0)
})
