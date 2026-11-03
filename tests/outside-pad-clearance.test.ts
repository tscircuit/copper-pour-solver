import { expect, test } from "bun:test"
import { CopperPourPipelineSolver } from "lib/index"
import type { InputProblem } from "lib/types"
import { hasCopperAt } from "./utils/has-copper-at"

test("an outside pad's expanded clearance still cuts the inside of a small pour", () => {
  const input: InputProblem = {
    regionsForPour: [
      {
        shape: "rect",
        layer: "top",
        bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
        connectivityKey: "GND",
        padMargin: 0.1,
        traceMargin: 0.1,
        clearanceRules: [
          { clearance: 1.2, connectivityKeys: ["HV"], objectTypes: ["smtpad"] },
        ],
      },
    ],
    pads: [
      {
        shape: "circle",
        padId: "nearby",
        layer: "top",
        connectivityKey: "HV",
        x: 2,
        y: 0,
        radius: 0.2,
        isSmtPad: true,
      },
      {
        shape: "circle",
        padId: "distant",
        layer: "top",
        connectivityKey: "HV",
        x: 10000,
        y: 0,
        radius: 0.2,
        isSmtPad: true,
      },
    ],
  }
  const output = new CopperPourPipelineSolver(input).getOutput()
  expect(hasCopperAt(output.brep_shapes, { x: 0.8, y: 0 })).toBe(false)
  expect(hasCopperAt(output.brep_shapes, { x: 0.5, y: 0 })).toBe(true)
})
