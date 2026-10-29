import { expect, test } from "bun:test"
import { CopperPourPipelineSolver } from "lib/index"
import type { InputProblem } from "lib/types"

test("explicit outline controls obstacle filtering when it extends past supplied bounds", () => {
  const input: InputProblem = {
    pads: [
      {
        shape: "circle",
        padId: "signal",
        layer: "top",
        connectivityKey: "signal",
        x: 4,
        y: 0,
        radius: 0.5,
      },
    ],
    regionsForPour: [
      {
        shape: "rect",
        layer: "top",
        connectivityKey: "ground",
        padMargin: 0.2,
        traceMargin: 0.2,
        bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
        outline: [
          { x: -5, y: -5 },
          { x: 5, y: -5 },
          { x: 5, y: 5 },
          { x: -5, y: 5 },
        ],
      },
    ],
  }
  const output = new CopperPourPipelineSolver(input).getOutput()
  expect(output.brep_shapes).toHaveLength(1)
  expect(output.brep_shapes[0]!.inner_rings).toHaveLength(1)
})
