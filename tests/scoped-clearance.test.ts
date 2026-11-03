import { expect, test } from "bun:test"
import { CopperPourPipelineSolver } from "lib/index"
import type { InputProblem } from "lib/types"
import { hasCopperAt } from "./utils/has-copper-at"

test("applies the first matching net and object clearance to emitted copper", () => {
  const input: InputProblem = {
    regionsForPour: [
      {
        shape: "rect",
        layer: "top",
        bounds: { minX: -8, minY: -5, maxX: 8, maxY: 5 },
        connectivityKey: "GND",
        padMargin: 0.1,
        traceMargin: 0.1,
        clearanceRules: [
          { clearance: 1.5, connectivityKeys: ["HV"], objectTypes: ["smtpad"] },
          { clearance: 0.4, connectivityKeys: ["HV"], objectTypes: ["via"] },
          { clearance: 0.2, objectTypes: ["smtpad"] },
        ],
      },
    ],
    pads: [
      {
        padId: "high-voltage",
        connectivityKey: "HV",
        layer: "top",
        shape: "circle",
        x: -4,
        y: 0,
        radius: 0.5,
        isSmtPad: true,
      },
      {
        padId: "via",
        connectivityKey: "HV",
        layer: "top",
        shape: "circle",
        x: 0,
        y: 0,
        radius: 0.5,
        isVia: true,
      },
      {
        padId: "low-voltage",
        connectivityKey: "LV",
        layer: "top",
        shape: "circle",
        x: 4,
        y: 0,
        radius: 0.5,
        isSmtPad: true,
      },
      {
        padId: "same-net",
        connectivityKey: "GND",
        layer: "top",
        shape: "circle",
        x: 0,
        y: 3,
        radius: 0.5,
        isSmtPad: true,
      },
    ],
  }
  const shapes = new CopperPourPipelineSolver(input).getOutput().brep_shapes
  expect(hasCopperAt(shapes, { x: -2.1, y: 0 })).toBe(false)
  expect(hasCopperAt(shapes, { x: -1.9, y: 0 })).toBe(true)
  expect(hasCopperAt(shapes, { x: 0.85, y: 0 })).toBe(false)
  expect(hasCopperAt(shapes, { x: 0.95, y: 0 })).toBe(true)
  expect(hasCopperAt(shapes, { x: 4.65, y: 0 })).toBe(false)
  expect(hasCopperAt(shapes, { x: 4.75, y: 0 })).toBe(true)
  expect(hasCopperAt(shapes, { x: 0, y: 3 })).toBe(true)
})
