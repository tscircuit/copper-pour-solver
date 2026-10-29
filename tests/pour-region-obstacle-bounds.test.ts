import { expect, test } from "bun:test"
import { CopperPourPipelineSolver } from "lib/index"
import { getInputPadBounds } from "lib/solvers/copper-pour/get-input-pad-bounds"
import { getPadsOverlappingRegion } from "lib/solvers/copper-pour/get-pads-overlapping-region"
import type { InputPad, InputProblem } from "lib/types"

test("regional filtering keeps clearance-reaching rotated pads and traces", () => {
  const sharedPad = { connectivityKey: "signal", layer: "top" }
  const pads: InputPad[] = [
    {
      ...sharedPad,
      padId: "rotated",
      shape: "rotated_rect",
      x: 3.7,
      y: 0,
      width: 1,
      height: 1,
      ccwRotation: 45,
    },
    {
      ...sharedPad,
      padId: "trace",
      shape: "trace",
      segments: [
        { x: -4, y: -1 },
        { x: -4, y: 1 },
      ],
      width: 2,
    },
    {
      ...sharedPad,
      padId: "taper",
      shape: "tapered_trace",
      start: { x: 0, y: 4 },
      end: { x: 1, y: 4 },
      start_width: 2,
      end_width: 1,
      width_interpolation_mode: "linear",
    },
    {
      ...sharedPad,
      padId: "distant",
      shape: "circle",
      x: 100,
      y: 100,
      radius: 1,
    },
  ]
  const input: InputProblem = {
    pads,
    regionsForPour: [
      {
        shape: "rect",
        layer: "top",
        connectivityKey: "ground",
        bounds: { minX: -3, minY: -3, maxX: 3, maxY: 3 },
        padMargin: 1,
        traceMargin: 1,
      },
    ],
  }
  const selectedPads = getPadsOverlappingRegion({
    boundedPads: pads.map((pad) => ({ pad, bounds: getInputPadBounds(pad) })),
    region: input.regionsForPour[0]!,
  })
  expect(selectedPads.map((pad) => pad.padId)).toEqual([
    "rotated",
    "trace",
    "taper",
  ])
  const withDistantPad = new CopperPourPipelineSolver(input).getOutput()
  const withoutDistantPad = new CopperPourPipelineSolver({
    ...input,
    pads: pads.slice(0, -1),
  }).getOutput()
  expect(withDistantPad).toEqual(withoutDistantPad)
  const noObstacles = new CopperPourPipelineSolver({
    ...input,
    pads: [],
  }).getOutput()
  expect(withDistantPad).not.toEqual(noObstacles)
})
