import { expect, test } from "bun:test"
import { CopperPourPipelineSolver } from "lib/index"
import type { InputProblem } from "lib/types"
import { hasCopperAt } from "./utils/has-copper-at"

test("electrical drill-hole clearance remains independent of routed board-cutout spacing", () => {
  const input: InputProblem = {
    regionsForPour: [
      {
        shape: "rect",
        layer: "top",
        bounds: { minX: -5, minY: -4, maxX: 5, maxY: 4 },
        connectivityKey: "GND",
        padMargin: 0.14,
        traceMargin: 0.14,
        cutout_margin: 0.635,
        clearanceRules: [{ clearance: 0.14, objectTypes: ["hole"] }],
      },
    ],
    pads: [
      {
        shape: "circle",
        padId: "drill",
        layer: "top",
        connectivityKey: "hole:drill",
        x: -3,
        y: 0,
        radius: 0.5,
      },
      {
        shape: "rect",
        padId: "slot",
        layer: "top",
        connectivityKey: "cutout:slot",
        bounds: { minX: 2.5, minY: -1, maxX: 3.5, maxY: 1 },
      },
    ],
  }
  const output = new CopperPourPipelineSolver(input).getOutput()
  expect(hasCopperAt(output.brep_shapes, { x: -2.4, y: 0 })).toBe(false)
  expect(hasCopperAt(output.brep_shapes, { x: -2.3, y: 0 })).toBe(true)
  expect(hasCopperAt(output.brep_shapes, { x: 1.9, y: 0 })).toBe(false)
  expect(hasCopperAt(output.brep_shapes, { x: 1.8, y: 0 })).toBe(true)
})
